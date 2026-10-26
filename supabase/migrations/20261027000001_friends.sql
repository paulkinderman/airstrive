-- Friends and profiles: mutual friendships, friend requests and codes, blocks, and an
-- audience on every grid and moment (private, friends or public).
--
-- Other people's grids and moments are never readable through the sync tables, so a
-- phone's pull only ever returns its own rows. They are read through the profile
-- functions below, which return only what the viewer may see, and every audience check
-- goes through can_view().

-- ---------- audiences ----------

alter table public.user_grids
  add column audience text not null default 'private' check (audience in ('private', 'friends', 'public'));
alter table public.moments
  add column audience text not null default 'private' check (audience in ('private', 'friends', 'public'));

-- show_moments was v1's never-used "show my moments" switch; it becomes friends.
update public.user_grids set audience = 'friends' where show_moments;

-- ---------- friends ----------

-- One row per pair, smaller id first, so a pair can't be friends twice.
create table public.friendships (
  user_a uuid not null references public.users(id) on delete cascade,
  user_b uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_a, user_b),
  check (user_a < user_b)
);
create index friendships_b on public.friendships (user_b);

create table public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  from_id uuid not null references public.users(id) on delete cascade,
  to_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  -- "Not now": hidden from the person asked, still pending for the sender.
  dismissed_at timestamptz,
  unique (from_id, to_id),
  check (from_id <> to_id)
);
create index friend_requests_to on public.friend_requests (to_id);

-- Behind the QR code and "Share my link". Used once, then a new one is made.
create table public.friend_codes (
  code text primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  used_at timestamptz
);
create index friend_codes_user on public.friend_codes (user_id);

create table public.blocks (
  blocker_id uuid not null references public.users(id) on delete cascade,
  blocked_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index blocks_blocked on public.blocks (blocked_id);

-- Admins hide a reported moment here rather than on the synced row, which phones write.
create table public.hidden_moments (
  moment_id uuid primary key references public.moments(id) on delete cascade,
  owner_id uuid not null references public.users(id) on delete cascade,
  hidden_at timestamptz not null default now(),
  hidden_by uuid references public.users(id) on delete set null
);

alter table public.friendships enable row level security;
alter table public.friend_requests enable row level security;
alter table public.friend_codes enable row level security;
alter table public.blocks enable row level security;
alter table public.hidden_moments enable row level security;

-- Readable by the people in them; every write goes through the functions below.
create policy friendships_read on public.friendships for select to authenticated
  using (user_a = auth.uid() or user_b = auth.uid());
create policy friend_requests_read on public.friend_requests for select to authenticated
  using (from_id = auth.uid() or (to_id = auth.uid() and dismissed_at is null));
create policy friend_codes_read on public.friend_codes for select to authenticated using (user_id = auth.uid());
create policy blocks_read on public.blocks for select to authenticated using (blocker_id = auth.uid());
create policy hidden_moments_admin on public.hidden_moments for select to authenticated using (public.is_admin());

grant select on public.friendships, public.friend_requests, public.friend_codes, public.blocks, public.hidden_moments to authenticated;

-- ---------- the rules ----------

create or replace function public.is_blocked(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from blocks where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a))
$$;

create or replace function public.are_friends(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from friendships where user_a = least(a, b) and user_b = greatest(a, b))
$$;

/** The narrower of two audiences: a moment never reaches further than its grid. */
create or replace function public.narrower(a text, b text) returns text
language sql immutable set search_path = public as $$
  select case
    when a = 'private' or b = 'private' then 'private'
    when a = 'friends' or b = 'friends' then 'friends'
    else 'public'
  end
$$;

/**
 * The one place that decides whether someone sees something. Public is anyone signed in,
 * Friends is accepted friends, Private is the owner. Blocks hide everything both ways,
 * and a person whose sharing is suspended reaches friends at most.
 */
create or replace function public.can_view(viewer uuid, owner uuid, audience text) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when viewer is null or owner is null then false
    when viewer = owner then true
    when is_blocked(viewer, owner) then false
    when audience = 'public' and not coalesce((select sharing_suspended from users where id = owner), false) then true
    when audience in ('public', 'friends') then are_friends(viewer, owner)
    else false
  end
$$;

/** A moment as others see it: its own audience narrowed by its grid's, and gone once an admin hides it. */
create or replace function public.moment_audience(moment uuid) returns text
language sql stable security definer set search_path = public as $$
  select case when exists (select 1 from hidden_moments h where h.moment_id = m.id) then 'private'
              else narrower(m.audience, ug.audience) end
  from moments m
  join square_states ss on ss.id = m.square_state_id
  join user_grids ug on ug.id = ss.user_grid_id
  where m.id = moment and m.deleted_at is null and ss.deleted_at is null and ug.deleted_at is null
$$;

/** Whether the signed-in person may see a moment. */
create or replace function public.can_view_moment(moment uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select can_view(auth.uid(), m.user_id, moment_audience(m.id)) from moments m where m.id = moment), false)
$$;

/** Storage: a photo file is readable when its moment is. */
create or replace function public.can_read_photo(path text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from photos p
    where p.storage_path = path and p.deleted_at is null and can_view_moment(p.moment_id)
  )
$$;

create policy photos_bucket_shared_read on storage.objects for select to authenticated
  using (bucket_id = 'photos' and public.can_read_photo(name));

-- ---------- finding people ----------

/** Where the viewer stands with someone: friends, a request either way, or nothing. */
create or replace function public.relation_to(other uuid) returns text
language sql stable security definer set search_path = public as $$
  select case
    when other = auth.uid() then 'self'
    when are_friends(auth.uid(), other) then 'friends'
    when exists (select 1 from friend_requests where from_id = auth.uid() and to_id = other) then 'requested'
    when exists (select 1 from friend_requests where from_id = other and to_id = auth.uid()) then 'incoming'
    else 'none'
  end
$$;

/** Usernames starting with what was typed (3 characters or more), 20 at most. */
create or replace function public.search_usernames(prefix text)
returns table (id uuid, username text, relation text)
language plpgsql stable security definer set search_path = public as $$
declare
  q text := lower(normalize(btrim(coalesce(prefix, '')), NFC));
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if char_length(q) < 3 then return; end if;
  return query
    select u.id, u.username, relation_to(u.id)
    from users u
    where u.username is not null
      and u.id <> auth.uid()
      and lower(u.username) like replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_') || '%'
      and not is_blocked(auth.uid(), u.id)
    order by lower(u.username) = q desc, lower(u.username)
    limit 20;
end $$;

-- ---------- requests ----------

create or replace function public.make_friends(a uuid, b uuid) returns void
language sql security definer set search_path = public as $$
  insert into friendships (user_a, user_b) values (least(a, b), greatest(a, b)) on conflict do nothing;
  delete from friend_requests where (from_id = a and to_id = b) or (from_id = b and to_id = a);
$$;

/**
 * Asks to be friends. If they already asked you, you're friends now. A blocked pair
 * gets the same answer as anyone else, so a block can't be detected.
 */
create or replace function public.request_friend(target uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception 'not signed in'; end if;
  if target is null or target = me or not exists (select 1 from users where id = target) then raise exception 'no such person'; end if;
  if are_friends(me, target) then return 'friends'; end if;
  if is_blocked(me, target) then return 'requested'; end if;
  if exists (select 1 from friend_requests where from_id = target and to_id = me) then
    perform make_friends(me, target);
    return 'friends';
  end if;
  if exists (select 1 from friend_requests where from_id = me and to_id = target) then return 'requested'; end if;
  if (select count(*) from friend_requests where from_id = me) >= 20 then raise exception 'too many requests'; end if;
  insert into friend_requests (from_id, to_id) values (me, target);
  return 'requested';
end $$;

/** Accept makes you friends; Not now hides it on your side without telling them. */
create or replace function public.respond_request(other uuid, accept boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception 'not signed in'; end if;
  if not exists (select 1 from friend_requests where from_id = other and to_id = me) then raise exception 'no such request'; end if;
  if accept then perform make_friends(me, other);
  else update friend_requests set dismissed_at = now() where from_id = other and to_id = me;
  end if;
end $$;

create or replace function public.cancel_request(other uuid) returns void
language sql security definer set search_path = public as $$
  delete from friend_requests where from_id = auth.uid() and to_id = other;
$$;

-- ---------- codes (QR and links) ----------

/** The person's current code, made fresh when the last one was used or ran out. */
create or replace function public.my_friend_code() returns text
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  c text;
  -- No 0/O or 1/I/L, so a code read aloud or typed survives.
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  b bytea;
begin
  if me is null then raise exception 'not signed in'; end if;
  select code into c from friend_codes
  where user_id = me and used_at is null and expires_at > now() + interval '1 day'
  order by created_at desc limit 1;
  if c is not null then return c; end if;
  delete from friend_codes where user_id = me and (used_at is not null or expires_at <= now());
  loop
    b := gen_random_bytes(12);
    c := '';
    for i in 0..11 loop
      c := c || substr(alphabet, get_byte(b, i) % length(alphabet) + 1, 1);
    end loop;
    begin
      insert into friend_codes (code, user_id) values (c, me);
      return c;
    exception when unique_violation then null;
    end;
  end loop;
end $$;

/** Who a code belongs to, for "Paul wants to be friends". Null for a bad, used, blocked or own code. */
create or replace function public.preview_friend_code(code text)
returns table (id uuid, username text, relation text)
language sql stable security definer set search_path = public as $$
  select u.id, u.username, relation_to(u.id)
  from friend_codes fc join users u on u.id = fc.user_id
  where fc.code = upper(btrim(preview_friend_code.code)) and fc.used_at is null and fc.expires_at > now()
    and u.id <> auth.uid() and not is_blocked(auth.uid(), u.id)
$$;

/** Showing the code was its owner's yes, so accepting makes you friends straight away. */
create or replace function public.accept_friend_code(code text) returns text
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  owner uuid;
  clean text := upper(btrim(code));
begin
  if me is null then raise exception 'not signed in'; end if;
  select user_id into owner from friend_codes fc
  where fc.code = clean and fc.used_at is null and fc.expires_at > now() for update;
  if owner is null or owner = me or is_blocked(me, owner) then return 'invalid'; end if;
  update friend_codes set used_at = now() where friend_codes.code = clean;
  perform make_friends(me, owner);
  return 'friends';
end $$;

-- ---------- removing and blocking ----------

create or replace function public.remove_friend(other uuid) returns void
language sql security definer set search_path = public as $$
  delete from friendships where user_a = least(auth.uid(), other) and user_b = greatest(auth.uid(), other);
$$;

create or replace function public.block_user(other uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception 'not signed in'; end if;
  if other is null or other = me then raise exception 'no such person'; end if;
  delete from friendships where user_a = least(me, other) and user_b = greatest(me, other);
  delete from friend_requests where (from_id = me and to_id = other) or (from_id = other and to_id = me);
  insert into blocks (blocker_id, blocked_id) values (me, other) on conflict do nothing;
end $$;

create or replace function public.unblock_user(other uuid) returns void
language sql security definer set search_path = public as $$
  delete from blocks where blocker_id = auth.uid() and blocked_id = other;
$$;

-- ---------- lists for the Profile tab ----------

create or replace function public.my_friends()
returns table (id uuid, username text, since timestamptz)
language sql stable security definer set search_path = public as $$
  select u.id, u.username, f.created_at
  from friendships f join users u on u.id = case when f.user_a = auth.uid() then f.user_b else f.user_a end
  where auth.uid() in (f.user_a, f.user_b)
  order by lower(u.username)
$$;

create or replace function public.my_friend_requests()
returns table (id uuid, username text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select u.id, u.username, r.created_at
  from friend_requests r join users u on u.id = r.from_id
  where r.to_id = auth.uid() and r.dismissed_at is null and not is_blocked(auth.uid(), r.from_id)
  order by r.created_at desc
$$;

create or replace function public.my_blocks()
returns table (id uuid, username text)
language sql stable security definer set search_path = public as $$
  select u.id, coalesce(u.username, 'someone') from blocks b join users u on u.id = b.blocked_id
  where b.blocker_id = auth.uid() order by lower(u.username)
$$;

-- ---------- profiles ----------

/** Someone's profile as the viewer may see it: username, bio, and the grids that reach them. Null when blocked. */
create or replace function public.profile(target uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', u.id,
    'username', u.username,
    'bio', u.bio,
    'relation', relation_to(u.id),
    'grids', coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_grid_id', ug.id, 'grid_id', g.id, 'title', g.title, 'color', g.color,
        'cols', g.cols, 'rows', g.rows, 'audience', ug.audience, 'completed_at', ug.completed_at,
        'states', (select jsonb_agg(ss.state order by ss.idx) from square_states ss
                   where ss.user_grid_id = ug.id and ss.deleted_at is null)
      ) order by ug.completed_at is not null, ug.started_at desc)
      from user_grids ug join grids g on g.id = ug.grid_id
      where ug.user_id = u.id and ug.deleted_at is null and can_view(auth.uid(), u.id, ug.audience)
    ), '[]'::jsonb)
  )
  from users u
  where u.id = target and auth.uid() is not null and not is_blocked(auth.uid(), u.id)
$$;

/**
 * One of someone's grids, read-only: the board, and the moments the viewer may see.
 * Squares behind a moment the viewer can't see look revealed. Place, weather and who
 * someone was with are never returned.
 */
create or replace function public.profile_grid(user_grid uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'user_grid_id', ug.id,
    'owner_id', ug.user_id,
    'owner', u.username,
    'audience', ug.audience,
    'completed_at', ug.completed_at,
    'grid', jsonb_build_object('id', g.id, 'title', g.title, 'color', g.color, 'cols', g.cols, 'rows', g.rows,
                               'description', g.description, 'made_by', g.made_by),
    'squares', (
      select jsonb_agg(sq order by (sq->>'idx')::int) from (
        select jsonb_build_object(
          'idx', ss.idx,
          'state', case when ss.state = 'done' and vm.id is null then 'revealed' else ss.state end,
          'prompt', case when ss.state = 'hidden' then '' else gs.prompt end,
          'cluster', case when ss.state = 'hidden' then '' else gs.cluster end,
          'moment', case when vm.id is null then null else jsonb_build_object(
            'id', vm.id, 'title', vm.title, 'body', vm.body, 'happened_on', vm.happened_on,
            'photos', coalesce((
              select jsonb_agg(jsonb_build_object('id', p.id, 'storage_path', p.storage_path, 'is_cover', p.is_cover,
                                                  'width', p.width, 'height', p.height)
                               order by p.is_cover desc, p.position)
              from photos p where p.moment_id = vm.id and p.deleted_at is null and p.storage_path is not null
            ), '[]'::jsonb)
          ) end
        ) as sq
        from square_states ss
        join grid_squares gs on gs.grid_id = ug.grid_id and gs.idx = ss.idx
        left join lateral (
          select m.id, m.title, m.body, m.happened_on from moments m
          where m.square_state_id = ss.id and m.deleted_at is null and can_view_moment(m.id)
          order by m.updated_at desc limit 1
        ) vm on true
        where ss.user_grid_id = ug.id and ss.deleted_at is null
      ) x
    )
  )
  from user_grids ug
  join grids g on g.id = ug.grid_id
  join users u on u.id = ug.user_id
  where ug.id = user_grid and ug.deleted_at is null and can_view(auth.uid(), ug.user_id, ug.audience)
$$;

-- ---------- reports on moments and people ----------

alter table public.reports
  alter column grid_id drop not null,
  add column target_kind text not null default 'grid' check (target_kind in ('grid', 'moment', 'user')),
  add column moment_id uuid references public.moments(id) on delete cascade,
  add column user_id uuid references public.users(id) on delete cascade,
  add constraint reports_one_target check (
    (target_kind = 'grid' and grid_id is not null and moment_id is null and user_id is null) or
    (target_kind = 'moment' and moment_id is not null and grid_id is null and user_id is null) or
    (target_kind = 'user' and user_id is not null and grid_id is null and moment_id is null)
  );
create unique index reports_one_open_moment on public.reports (reporter_id, moment_id) where status = 'open' and moment_id is not null;
create unique index reports_one_open_user on public.reports (reporter_id, user_id) where status = 'open' and user_id is not null;

drop policy reports_insert on public.reports;
create policy reports_insert on public.reports for insert to authenticated with check (
  reporter_id = auth.uid()
  and status = 'open'
  and case target_kind
    -- A shared grid that isn't official and isn't your own.
    when 'grid' then exists (
      select 1 from public.grids g
      where g.id = grid_id and g.is_public and not g.is_official and g.author_id is distinct from auth.uid()
    )
    -- Someone else's moment that you can see.
    -- (moments shows the reporter only their own rows, so a visible row means it's theirs).
    when 'moment' then public.can_view_moment(moment_id)
      and not exists (select 1 from public.moments m where m.id = moment_id)
    -- Anyone but yourself.
    when 'user' then user_id <> auth.uid()
    else false
  end
);

revoke insert on public.reports from authenticated;
grant insert (grid_id, reason, note, target_kind, moment_id, user_id) on public.reports to authenticated;

/** Hides a moment from everyone but its owner. Two hidden moments in 30 days suspends their public sharing. */
create or replace function public.admin_set_moment_hidden(moment uuid, hidden boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  owner uuid;
begin
  perform require_admin();
  select user_id into owner from moments where id = moment;
  if owner is null then raise exception 'moment not found'; end if;
  if hidden then
    insert into hidden_moments (moment_id, owner_id, hidden_by) values (moment, owner, auth.uid()) on conflict do nothing;
    update reports set status = 'hidden', resolved_at = now(), resolved_by = auth.uid()
    where moment_id = moment and status = 'open';
    if (select count(*) from hidden_moments where owner_id = owner and hidden_at > now() - interval '30 days') >= 2 then
      update users set sharing_suspended = true where id = owner;
    end if;
  else
    delete from hidden_moments where moment_id = moment;
  end if;
end $$;

/** hide: hides the grid or moment, or for a reported person suspends their sharing. */
create or replace function public.admin_resolve_report(report uuid, action text) returns void
language plpgsql security definer set search_path = public as $$
declare
  r reports;
begin
  perform require_admin();
  select * into r from reports where id = report;
  if not found then raise exception 'report not found'; end if;
  if action = 'hide' then
    if r.target_kind = 'grid' then perform admin_set_grid_hidden(r.grid_id, true);
    elsif r.target_kind = 'moment' then perform admin_set_moment_hidden(r.moment_id, true);
    else
      update users set sharing_suspended = true where id = r.user_id;
      update reports set status = 'hidden', resolved_at = now(), resolved_by = auth.uid()
      where user_id = r.user_id and status = 'open';
    end if;
  elsif action = 'dismiss' then
    update reports set status = 'dismissed', resolved_at = now(), resolved_by = auth.uid() where id = report and status = 'open';
  else
    raise exception 'unknown action %', action;
  end if;
end $$;

/** For the admin site: a reported moment with its photos. */
create or replace function public.admin_moment(moment uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform require_admin();
  return (
    select jsonb_build_object(
      'id', m.id, 'title', m.title, 'body', m.body, 'happened_on', m.happened_on,
      'owner', u.username, 'owner_id', u.id, 'grid', g.title,
      'hidden', exists (select 1 from hidden_moments h where h.moment_id = m.id),
      'photos', coalesce((select jsonb_agg(p.storage_path order by p.position) from photos p
                          where p.moment_id = m.id and p.deleted_at is null and p.storage_path is not null), '[]'::jsonb)
    )
    from moments m join users u on u.id = m.user_id
    join square_states ss on ss.id = m.square_state_id
    join user_grids ug on ug.id = ss.user_grid_id
    join grids g on g.id = ug.grid_id
    where m.id = moment
  );
end $$;

-- Admins see reported photos.
create policy photos_bucket_admin_read on storage.objects for select to authenticated
  using (bucket_id = 'photos' and public.is_admin());

-- ---------- grants ----------

do $$
declare f text;
begin
  -- Helpers that take any two people would leak who is friends with whom, so only the
  -- functions above (which run as their owner) call them.
  foreach f in array array[
    'public.make_friends(uuid, uuid)', 'public.is_blocked(uuid, uuid)', 'public.are_friends(uuid, uuid)',
    'public.can_view(uuid, uuid, text)', 'public.moment_audience(uuid)', 'public.relation_to(uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
  foreach f in array array[
    'public.narrower(text, text)', 'public.can_view_moment(uuid)', 'public.can_read_photo(text)',
    'public.search_usernames(text)', 'public.request_friend(uuid)',
    'public.respond_request(uuid, boolean)', 'public.cancel_request(uuid)', 'public.my_friend_code()',
    'public.preview_friend_code(text)', 'public.accept_friend_code(text)', 'public.remove_friend(uuid)',
    'public.block_user(uuid)', 'public.unblock_user(uuid)', 'public.my_friends()', 'public.my_friend_requests()',
    'public.my_blocks()', 'public.profile(uuid)', 'public.profile_grid(uuid)',
    'public.admin_set_moment_hidden(uuid, boolean)', 'public.admin_moment(uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
