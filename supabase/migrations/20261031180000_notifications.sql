-- Notifications: a list on the Profile tab of what other people did that concerns you
-- (friend requests, new friends, invites to group grids, people joining and posting in
-- them), and iOS pushes for the same events through Expo's push service.
--
-- Rows are written here by triggers, never by phones. Each new row asks the send-push
-- edge function to deliver it (through pg_net, once the project has the two vault
-- secrets below); the function reads what to send from push_payload(), which applies the
-- person's push settings, blocks, and the badge count.
--
-- Per project, once (the secret is made in the database and never leaves it):
--   select vault.create_secret('https://<ref>.supabase.co/functions/v1/send-push', 'push_function_url');
--   select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'push_secret');
--   supabase functions deploy send-push --no-verify-jwt
-- Until then notifications still fill the list; only the pushes are skipped.

-- pg_net makes the HTTP call after the transaction commits. Plain Postgres (the tests)
-- doesn't have it, and the pushes are skipped there.
do $$ begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net;
  end if;
end $$;

-- ---------- tables ----------

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  kind text not null check (kind in ('friend_request', 'friend_accepted', 'group_invite', 'group_joined', 'group_moment')),
  actor_id uuid references public.users(id) on delete cascade,
  group_id uuid references public.user_grids(id) on delete cascade,
  moment_id uuid references public.moments(id) on delete cascade,
  square_state_id uuid,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index notifications_user on public.notifications (user_id, created_at desc);
create index notifications_actor on public.notifications (actor_id);

/** One row per phone that allowed pushes. A token moves to whoever signed in on it last. */
create table public.push_tokens (
  token text primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  platform text not null check (platform in ('ios', 'android')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index push_tokens_user on public.push_tokens (user_id);

/** Which kinds someone turned pushes off for. They still show in the list. */
create table public.notification_prefs (
  user_id uuid primary key references public.users(id) on delete cascade,
  push_off text[] not null default '{}',
  updated_at timestamptz not null default now()
);

alter table public.notifications enable row level security;
alter table public.push_tokens enable row level security;
alter table public.notification_prefs enable row level security;

-- Read through the functions below; nothing is written directly by phones.
create policy notifications_read on public.notifications for select to authenticated using (user_id = auth.uid());
create policy notification_prefs_read on public.notification_prefs for select to authenticated using (user_id = auth.uid());
revoke all on public.notifications, public.push_tokens, public.notification_prefs from anon, authenticated;
grant select on public.notifications, public.notification_prefs to authenticated;
grant select, delete on public.push_tokens to service_role;

-- ---------- sending ----------

/** Asks the send-push edge function to deliver a notification. Never fails the write that caused it. */
create or replace function public.queue_push(notification uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  url text;
  secret text;
begin
  if to_regnamespace('net') is null or to_regnamespace('vault') is null then return; end if;
  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1' into url using 'push_function_url';
  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1' into secret using 'push_secret';
  if url is null or secret is null then return; end if;
  execute 'select net.http_post(url := $1, body := $2, headers := $3)'
    using url, jsonb_build_object('notification_id', notification),
          jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || secret);
exception when others then
  raise warning 'push not queued: %', sqlerrm;
end $$;

/** Whether a caller of send-push holds the push secret, so the function needn't keep its own copy. */
create or replace function public.push_secret_matches(secret text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  expected text;
begin
  if secret is null or to_regnamespace('vault') is null then return false; end if;
  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1' into expected using 'push_secret';
  return expected is not null and expected = secret;
end $$;

/**
 * Adds a notification, unless it's about yourself or someone you've blocked (either way).
 * The same news about the same moment from the same person within an hour is only told once,
 * so writing the words after adding the moment doesn't notify twice.
 */
create or replace function public.add_notification(recipient uuid, kind text, actor uuid,
  grp uuid default null, moment uuid default null, square uuid default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  nid uuid;
begin
  if recipient is null or actor is null or recipient = actor then return; end if;
  if is_blocked(recipient, actor) then return; end if;
  if moment is not null and exists (
    select 1 from notifications n
    where n.user_id = recipient and n.actor_id = actor and n.moment_id = moment and n.kind = add_notification.kind
      and n.created_at > now() - interval '1 hour'
  ) then return; end if;
  insert into notifications (user_id, kind, actor_id, group_id, moment_id, square_state_id)
    values (recipient, kind, actor, grp, moment, square)
    returning id into nid;
  perform queue_push(nid);
end $$;

-- ---------- what makes a notification ----------

create or replace function public.notify_friend_request() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform add_notification(new.to_id, 'friend_request', new.from_id);
  return null;
end $$;
create trigger friend_requests_notify after insert on public.friend_requests
  for each row execute function public.notify_friend_request();

/** Whoever didn't make the friendship hears about it: the one who asked, or the one whose code was used. */
create or replace function public.notify_friendship() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
begin
  if me = new.user_a then perform add_notification(new.user_b, 'friend_accepted', me);
  elsif me = new.user_b then perform add_notification(new.user_a, 'friend_accepted', me);
  end if;
  return null;
end $$;
create trigger friendships_notify after insert on public.friendships
  for each row execute function public.notify_friendship();

create or replace function public.notify_group_invite() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform add_notification(new.to_id, 'group_invite', new.from_id, new.group_id);
  return null;
end $$;
create trigger group_invites_notify after insert on public.group_invites
  for each row execute function public.notify_group_invite();

create or replace function public.notify_group_joined() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  m record;
begin
  for m in select user_id from group_members where group_id = new.group_id and user_id <> new.user_id loop
    perform add_notification(m.user_id, 'group_joined', new.user_id, new.group_id);
  end loop;
  return null;
end $$;
create trigger group_members_notify after insert on public.group_members
  for each row execute function public.notify_group_joined();

/** A new moment in a group grid, or someone's words on one shared with the group, reaches the others. */
create or replace function public.notify_group_moment() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  square uuid;
  m record;
begin
  if new.group_id is null or new.user_id is null or new.deleted_at is not null then return null; end if;
  if tg_table_name = 'moments' then
    if tg_op <> 'INSERT' then return null; end if;
    square := new.square_state_id;
    for m in select user_id from group_members where group_id = new.group_id and user_id <> new.user_id loop
      perform add_notification(m.user_id, 'group_moment', new.user_id, new.group_id, new.id, square);
    end loop;
  else
    -- An entry counts once it has words the group can read.
    if new.audience <> 'group' or btrim(new.body) = '' then return null; end if;
    if tg_op = 'UPDATE' and old.audience = 'group' and btrim(old.body) <> '' then return null; end if;
    select square_state_id into square from moments where id = new.moment_id;
    for m in select user_id from group_members where group_id = new.group_id and user_id <> new.user_id loop
      perform add_notification(m.user_id, 'group_moment', new.user_id, new.group_id, new.moment_id, square);
    end loop;
  end if;
  return null;
end $$;
create trigger moments_notify after insert on public.moments
  for each row execute function public.notify_group_moment();
create trigger moment_entries_notify after insert or update on public.moment_entries
  for each row execute function public.notify_group_moment();

-- Requests and invites already waiting get a notification, so the list starts complete.
insert into public.notifications (user_id, kind, actor_id, created_at)
  select r.to_id, 'friend_request', r.from_id, r.created_at from public.friend_requests r where r.dismissed_at is null;
insert into public.notifications (user_id, kind, actor_id, group_id, created_at)
  select i.to_id, 'group_invite', i.from_id, i.group_id, i.created_at from public.group_invites i;

-- ---------- the list ----------

/**
 * Someone's notifications as they should see them. state says where a request or invite
 * stands now: pending, done (friends, or joined) or gone (withdrawn, declined, or no
 * longer possible), and gone ones are left out. Nothing from someone blocked either way,
 * and nothing about a group grid you've left.
 */
create or replace function public.notification_feed(me uuid, lim int default 100)
returns table (
  id uuid, kind text, actor_id uuid, actor_username text, group_id uuid, grid_title text, grid_color text,
  moment_id uuid, square_state_id uuid, moment_title text, state text, created_at timestamptz, read_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select * from (
    select n.id, n.kind, n.actor_id, coalesce(a.username, 'someone'), n.group_id, g.title, g.color,
      n.moment_id, n.square_state_id, mo.title,
      case n.kind
        when 'friend_request' then
          case when are_friends(me, n.actor_id) then 'done'
               when exists (select 1 from friend_requests r where r.from_id = n.actor_id and r.to_id = me and r.dismissed_at is null) then 'pending'
               else 'gone' end
        when 'group_invite' then
          case when exists (select 1 from group_members gm where gm.group_id = n.group_id and gm.user_id = me) then 'done'
               when exists (select 1 from group_invites i where i.group_id = n.group_id and i.to_id = me) then 'pending'
               else 'gone' end
        when 'group_joined' then
          case when exists (select 1 from group_members gm where gm.group_id = n.group_id and gm.user_id = me) then 'done' else 'gone' end
        when 'group_moment' then
          case when exists (select 1 from group_members gm where gm.group_id = n.group_id and gm.user_id = me)
                and mo.id is not null and mo.deleted_at is null then 'done' else 'gone' end
        else 'done'
      end as state,
      n.created_at, n.read_at
    from notifications n
    left join users a on a.id = n.actor_id
    left join user_grids ug on ug.id = n.group_id
    left join grids g on g.id = ug.grid_id
    left join moments mo on mo.id = n.moment_id
    where n.user_id = me and not is_blocked(me, n.actor_id)
  ) x
  where x.state <> 'gone'
  order by x.created_at desc
  limit lim
$$;

create or replace function public.my_notifications(lim int default 100)
returns table (
  id uuid, kind text, actor_id uuid, actor_username text, group_id uuid, grid_title text, grid_color text,
  moment_id uuid, square_state_id uuid, moment_title text, state text, created_at timestamptz, read_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select * from notification_feed(auth.uid(), least(greatest(coalesce(lim, 100), 1), 200))
$$;

create or replace function public.unread_notifications() returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from notification_feed(auth.uid(), 200) where read_at is null
$$;

/** Marks one notification read, or all of them when none is named. */
create or replace function public.mark_notifications_read(notification uuid default null) returns void
language sql security definer set search_path = public as $$
  update notifications set read_at = now()
  where user_id = auth.uid() and read_at is null and (notification is null or id = notification)
$$;

-- ---------- push settings and tokens ----------

create or replace function public.my_push_off() returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce((select push_off from notification_prefs where user_id = auth.uid()), '{}')
$$;

create or replace function public.set_push_kind(kind text, push boolean) returns text[]
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  out text[];
begin
  if me is null then raise exception 'not signed in'; end if;
  if kind not in ('friend_request', 'friend_accepted', 'group_invite', 'group_joined', 'group_moment') then
    raise exception 'unknown kind %', kind;
  end if;
  insert into notification_prefs (user_id, push_off) values (me, case when push then '{}' else array[kind] end)
  on conflict (user_id) do update set
    push_off = case when push then array_remove(notification_prefs.push_off, set_push_kind.kind)
                    else array(select distinct unnest(notification_prefs.push_off || set_push_kind.kind)) end,
    updated_at = now()
  returning push_off into out;
  return out;
end $$;

create or replace function public.register_push_token(token text, platform text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if token is null or char_length(token) not between 10 and 300 then raise exception 'bad token'; end if;
  insert into push_tokens (token, user_id, platform) values (token, auth.uid(), platform)
  on conflict on constraint push_tokens_pkey do update set user_id = excluded.user_id, platform = excluded.platform, updated_at = now();
end $$;

create or replace function public.unregister_push_token(token text) returns void
language sql security definer set search_path = public as $$
  delete from push_tokens where push_tokens.token = unregister_push_token.token and user_id = auth.uid()
$$;

/**
 * What send-push delivers for a notification: the phones, the words, where a tap goes,
 * and the badge. Null when there's nothing to send: already read, no phones, the person
 * turned that kind off, or it's no longer worth telling (a request withdrawn, say).
 */
create or replace function public.push_payload(notification uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  n notifications;
  f record;
  tokens text[];
  body text;
begin
  select * into n from notifications where id = notification;
  if not found or n.read_at is not null then return null; end if;
  if n.kind = any(coalesce((select push_off from notification_prefs where user_id = n.user_id), '{}')) then return null; end if;
  select array_agg(t.token order by t.updated_at desc) into tokens from push_tokens t where t.user_id = n.user_id;
  if tokens is null then return null; end if;
  select * into f from notification_feed(n.user_id, 200) x where x.id = n.id;
  if not found then return null; end if;
  body := case n.kind
    when 'friend_request' then f.actor_username || ' wants to be friends'
    when 'friend_accepted' then 'You and ' || f.actor_username || ' are friends now'
    when 'group_invite' then f.actor_username || ' invited you to do ' || coalesce(f.grid_title, 'a grid') || ' together'
    when 'group_joined' then f.actor_username || ' joined ' || coalesce(f.grid_title, 'your grid')
    when 'group_moment' then f.actor_username || ' added “' || coalesce(nullif(btrim(f.moment_title), ''), 'a moment') || '”'
  end;
  return jsonb_build_object(
    'tokens', to_jsonb(tokens),
    'title', case when n.kind = 'group_moment' then f.grid_title end,
    'body', body,
    'badge', (select count(*) from notification_feed(n.user_id, 200) x where x.read_at is null),
    'data', jsonb_strip_nulls(jsonb_build_object(
      'notificationId', n.id, 'kind', n.kind, 'actorId', n.actor_id,
      'groupId', n.group_id, 'squareStateId', n.square_state_id
    ))
  );
end $$;

-- ---------- grants ----------

do $$
declare f text;
begin
  foreach f in array array[
    'public.queue_push(uuid)', 'public.push_secret_matches(text)', 'public.add_notification(uuid, text, uuid, uuid, uuid, uuid)',
    'public.notification_feed(uuid, int)', 'public.push_payload(uuid)',
    'public.notify_friend_request()', 'public.notify_friendship()', 'public.notify_group_invite()',
    'public.notify_group_joined()', 'public.notify_group_moment()'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
  execute 'grant execute on function public.push_payload(uuid) to service_role';
  execute 'grant execute on function public.push_secret_matches(text) to service_role';
  foreach f in array array[
    'public.my_notifications(int)', 'public.unread_notifications()', 'public.mark_notifications_read(uuid)',
    'public.my_push_off()', 'public.set_push_kind(text, boolean)',
    'public.register_push_token(text, text)', 'public.unregister_push_token(text)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
