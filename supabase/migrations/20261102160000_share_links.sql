-- Share links: four kinds of link a person can send to friends, each of which also works
-- for someone who hasn't signed up yet (the website shows what the link is for, and the
-- link waits through sign-up).
--
--   /f/CODE        Be my friend. The person's friend code, now reusable until they reset it.
--   /g/CODE        Join my grid. Joins a group grid, and makes you friends with whoever made the link.
--   /a/GRID?f=CODE Try this grid. An Atlas grid, with the sender's friend code to offer friendship.
--   /p/CODE        See my grid. A read-only peek at one Friends or Public grid, open to anyone with
--                  the link, which also offers friendship with its owner.
--
-- invite_preview() is the one function the website calls without signing in. It returns
-- only what the link's owner chose to show: a username, a grid's title and look, and for a
-- peek the squares and the titles of moments their friends could see. Never bodies,
-- photos, places or who-with.

-- ---------- 1. reusable friend codes ----------

-- A code with no expiry is reusable; the old one-use, 7-day codes keep working as they were.
alter table public.friend_codes alter column expires_at drop not null;
alter table public.friend_codes alter column expires_at drop default;

/** The person's friend code, made the first time and kept until they reset it. */
create or replace function public.my_friend_code() returns text
language plpgsql security definer set search_path = public, extensions as $$
declare
  me uuid := auth.uid();
  c text;
begin
  if me is null then raise exception 'not signed in'; end if;
  select code into c from friend_codes
  where user_id = me and used_at is null and expires_at is null
  order by created_at desc limit 1;
  if c is not null then return c; end if;
  delete from friend_codes where user_id = me and (used_at is not null or expires_at <= now());
  loop
    c := new_share_code();
    begin
      insert into friend_codes (code, user_id, expires_at) values (c, me, null);
      return c;
    exception when unique_violation then null;
    end;
  end loop;
end $$;

/** Stops the current friend link and QR code working, and returns a new one. */
create or replace function public.reset_friend_code() returns text
language plpgsql security definer set search_path = public, extensions as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  update friend_codes set used_at = now() where user_id = auth.uid() and used_at is null;
  return my_friend_code();
end $$;

/** 12 letters and digits, with no 0/O or 1/I/L so a code read aloud or typed survives. */
create or replace function public.new_share_code() returns text
language plpgsql volatile set search_path = public, extensions as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  b bytea := gen_random_bytes(12);
  c text := '';
begin
  for i in 0..11 loop
    c := c || substr(alphabet, get_byte(b, i) % length(alphabet) + 1, 1);
  end loop;
  return c;
end $$;

/** The owner of a friend code that still works, or null. */
create or replace function public.friend_code_owner(code text) returns uuid
language sql stable security definer set search_path = public as $$
  select fc.user_id from friend_codes fc
  where fc.code = upper(btrim(friend_code_owner.code)) and fc.used_at is null
    and (fc.expires_at is null or fc.expires_at > now())
$$;

create or replace function public.preview_friend_code(code text)
returns table (id uuid, username text, relation text)
language sql stable security definer set search_path = public as $$
  select u.id, u.username, relation_to(u.id)
  from users u
  where u.id = friend_code_owner(preview_friend_code.code)
    and u.id <> auth.uid() and not is_blocked(auth.uid(), u.id)
$$;

/** Showing the code was its owner's yes, so accepting makes you friends straight away. */
create or replace function public.accept_friend_code(code text) returns text
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  clean text := upper(btrim(code));
  fc friend_codes;
begin
  if me is null then raise exception 'not signed in'; end if;
  select * into fc from friend_codes f
  where f.code = clean and f.used_at is null and (f.expires_at is null or f.expires_at > now()) for update;
  if fc.user_id is null or fc.user_id = me or is_blocked(me, fc.user_id) then return 'invalid'; end if;
  if are_friends(me, fc.user_id) then return 'friends'; end if;
  -- An old one-use code is spent; a reusable one keeps working.
  if fc.expires_at is not null then update friend_codes set used_at = now() where friend_codes.code = clean; end if;
  perform make_friends(me, fc.user_id);
  return 'friends';
end $$;

-- ---------- 2. join-my-grid links ----------

-- One live link per group grid, shared by everyone in it. Stopping it keeps the row so a
-- stopped link can say so; the next share makes a new one.
create table public.group_links (
  code text primary key,
  group_id uuid not null references public.user_grids(id) on delete cascade,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  stopped_at timestamptz
);
create index group_links_group on public.group_links (group_id);
alter table public.group_links enable row level security;
-- Every read and write goes through the functions below.

/** The group grid's join link, made by the first member who shares it. */
create or replace function public.group_link(grp uuid) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare
  c text;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if not is_group_member(grp) then raise exception 'not in this group'; end if;
  select code into c from group_links where group_id = grp and stopped_at is null order by created_at desc limit 1;
  if c is not null then return c; end if;
  loop
    c := new_share_code();
    begin
      insert into group_links (code, group_id, created_by) values (c, grp, auth.uid());
      return c;
    exception when unique_violation then null;
    end;
  end loop;
end $$;

/** Turns the link off; anyone who already joined stays. */
create or replace function public.stop_group_link(grp uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_group_member(grp) then raise exception 'not in this group'; end if;
  update group_links set stopped_at = now() where group_id = grp and stopped_at is null;
end $$;

/**
 * Joins the group grid behind a link, and makes you friends with whoever made the link
 * (if they're still in it). Returns the group's id, or null when the link doesn't work.
 */
create or replace function public.join_group_link(code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  l group_links;
begin
  if me is null then raise exception 'not signed in'; end if;
  select * into l from group_links gl where gl.code = upper(btrim(join_group_link.code)) and gl.stopped_at is null;
  if l.group_id is null or not exists (select 1 from user_grids where id = l.group_id and deleted_at is null) then return null; end if;
  if l.created_by is not null and is_blocked(me, l.created_by) then return null; end if;
  delete from group_invites where group_id = l.group_id and to_id = me;
  insert into group_members (group_id, user_id) values (l.group_id, me) on conflict do nothing;
  if l.created_by is not null and l.created_by <> me and not are_friends(me, l.created_by)
     and exists (select 1 from group_members where group_id = l.group_id and user_id = l.created_by) then
    perform make_friends(me, l.created_by);
  end if;
  return l.group_id;
end $$;

-- ---------- 4. see-my-grid peek links ----------

create table public.peek_links (
  code text primary key,
  user_grid_id uuid not null references public.user_grids(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  stopped_at timestamptz
);
create index peek_links_grid on public.peek_links (user_grid_id);
alter table public.peek_links enable row level security;

/** A peek link for one of your own grids. Only a Friends or Public grid can have one. */
create or replace function public.peek_link(user_grid uuid) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare
  me uuid := auth.uid();
  ug user_grids;
  c text;
begin
  if me is null then raise exception 'not signed in'; end if;
  select * into ug from user_grids where id = user_grid;
  if not found or ug.user_id is distinct from me or ug.deleted_at is not null or ug.group_id is not null then
    raise exception 'grid not found';
  end if;
  if ug.audience = 'private' then raise exception 'grid is private'; end if;
  select code into c from peek_links where user_grid_id = user_grid and stopped_at is null order by created_at desc limit 1;
  if c is not null then return c; end if;
  loop
    c := new_share_code();
    begin
      insert into peek_links (code, user_grid_id, user_id) values (c, user_grid, me);
      return c;
    exception when unique_violation then null;
    end;
  end loop;
end $$;

create or replace function public.stop_peek_link(user_grid uuid) returns void
language sql security definer set search_path = public as $$
  update peek_links set stopped_at = now()
  where user_grid_id = stop_peek_link.user_grid and user_id = auth.uid() and stopped_at is null;
$$;

/**
 * The grid behind a peek link that still works: live, the owner's, not in a group, not
 * Private, and the owner's sharing not suspended. Making a grid Private turns its link off.
 */
create or replace function public.peek_grid(code text) returns uuid
language sql stable security definer set search_path = public as $$
  select ug.id
  from peek_links pl
  join user_grids ug on ug.id = pl.user_grid_id
  join users u on u.id = ug.user_id
  where pl.code = upper(btrim(peek_grid.code)) and pl.stopped_at is null
    and ug.user_id = pl.user_id and ug.deleted_at is null and ug.group_id is null
    and ug.audience in ('friends', 'public') and not u.sharing_suspended
$$;

/** "Be friends with Ana" from her peek link. */
create or replace function public.accept_peek_link(code text) returns text
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  owner uuid := (select user_id from user_grids where id = peek_grid(code));
begin
  if me is null then raise exception 'not signed in'; end if;
  if owner is null or owner = me or is_blocked(me, owner) then return 'invalid'; end if;
  perform make_friends(me, owner);
  return 'friends';
end $$;

-- ---------- the preview behind every link ----------

/** A grid template's look, for previews. */
create or replace function public.grid_card(grid text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', g.id, 'title', g.title, 'color', g.color, 'cols', g.cols, 'rows', g.rows,
                            'description', g.description, 'made_by', g.made_by)
  from grids g where g.id = grid
$$;

/**
 * What a link is for, for its landing page in the app and on the website. Works signed
 * out (the website), and adds where you stand when signed in. Null when the link doesn't
 * work, or when its owner has blocked you or you them.
 *
 *   kind 'f': { username }
 *   kind 'g': { from, grid, members: [usernames], member: bool }
 *   kind 'a': { grid, from }  (code is the grid id, from_code the sender's friend code)
 *   kind 'p': { owner, owner_id, grid, squares: [{ idx, state, prompt, title }] }
 *
 * Signed in, 'f' and 'p' also carry user_id and relation.
 */
create or replace function public.invite_preview(kind text, code text, from_code text default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  who uuid;
  grp uuid;
  ug uuid;
  out jsonb;
begin
  if kind = 'f' then
    who := friend_code_owner(code);
    if who is null or is_blocked(me, who) then return null; end if;
    return (select jsonb_build_object('username', u.username, 'user_id', case when me is null then null else u.id end,
                                      'relation', case when me is null then null else relation_to(u.id) end)
            from users u where u.id = who and u.username is not null);

  elsif kind = 'g' then
    select gl.group_id, gl.created_by into grp, who from group_links gl
    where gl.code = upper(btrim(invite_preview.code)) and gl.stopped_at is null;
    if grp is null or (who is not null and is_blocked(me, who)) then return null; end if;
    return (
      select jsonb_build_object(
        'from', coalesce((select username from users where id = who), 'someone'),
        'grid', grid_card(x.grid_id),
        'members', coalesce((select jsonb_agg(coalesce(u.username, 'someone') order by m.joined_at)
                             from group_members m join users u on u.id = m.user_id where m.group_id = grp), '[]'::jsonb),
        'member', me is not null and exists (select 1 from group_members where group_id = grp and user_id = me))
      from user_grids x where x.id = grp and x.deleted_at is null
    );

  elsif kind = 'a' then
    if not exists (select 1 from grids g where g.id = code and ((g.is_public and not g.is_hidden) or g.is_official)) then
      return null;
    end if;
    who := case when from_code is null then null else friend_code_owner(from_code) end;
    if who is not null and is_blocked(me, who) then who := null; end if;
    return jsonb_build_object(
      'grid', grid_card(code),
      'from', (select username from users where id = who),
      'relation', case when me is null or who is null then null else relation_to(who) end);

  elsif kind = 'p' then
    ug := peek_grid(code);
    if ug is null then return null; end if;
    select x.user_id into who from user_grids x where x.id = ug;
    if is_blocked(me, who) then return null; end if;
    select jsonb_build_object(
      'owner', coalesce(u.username, 'someone'),
      'owner_id', case when me is null then null else u.id end,
      'relation', case when me is null then null else relation_to(u.id) end,
      'user_grid_id', case when me is null then null else x.id end,
      'grid', grid_card(x.grid_id),
      'squares', (
        select jsonb_agg(jsonb_build_object(
          'idx', ss.idx,
          'state', case when ss.state = 'done' and vm.title is null then 'revealed' else ss.state end,
          'prompt', case when ss.state = 'hidden' then '' else gs.prompt end,
          'title', vm.title
        ) order by ss.idx)
        from square_states ss
        join grid_squares gs on gs.grid_id = x.grid_id and gs.idx = ss.idx
        left join lateral (
          -- What a friend of the owner could see: the moment's own audience narrowed by the grid's.
          select m.title from moments m
          where m.square_state_id = ss.id and m.deleted_at is null and moment_audience(m.id) in ('friends', 'public')
          order by m.updated_at desc limit 1
        ) vm on true
        where ss.user_grid_id = x.id and ss.deleted_at is null
      )
    ) into out
    from user_grids x join users u on u.id = x.user_id
    where x.id = ug;
    return out;
  end if;
  return null;
end $$;

-- ---------- grants ----------

do $$
declare f text;
begin
  foreach f in array array[
    'public.new_share_code()', 'public.friend_code_owner(text)', 'public.peek_grid(text)', 'public.grid_card(text)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
  foreach f in array array[
    'public.my_friend_code()', 'public.reset_friend_code()', 'public.preview_friend_code(text)', 'public.accept_friend_code(text)',
    'public.group_link(uuid)', 'public.stop_group_link(uuid)', 'public.join_group_link(text)',
    'public.peek_link(uuid)', 'public.stop_peek_link(uuid)', 'public.accept_peek_link(text)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- The website shows a link's preview before anyone signs in.
revoke execute on function public.invite_preview(text, text, text) from public;
grant execute on function public.invite_preview(text, text, text) to anon, authenticated;
