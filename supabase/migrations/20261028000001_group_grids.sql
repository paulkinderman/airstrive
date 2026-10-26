-- Group grids: friends doing one grid together. Everyone in the group works on the same
-- board, and each square holds one shared moment (its title, date and details) with an
-- entry from each person who wrote about it. Entries and photos are Group (everyone in
-- the group) or Private (only the person who added them).
--
-- A group grid is an ordinary user_grids row whose group_id is its own id, so the board
-- logic on the phone is the same for both. Every row of a group grid carries group_id,
-- set here from its parent, and access to those rows comes from membership alone: the
-- "own" policies cover solo rows only, so someone who leaves loses access to the rows
-- they made too. user_id stays on group rows to say who added them, and is cleared when
-- that person deletes their account so the rows outlive them.
--
-- Group grids never reach profiles, friends or the public. The grid template itself can
-- still be shared to the Atlas as usual.

-- ---------- membership ----------

create table public.group_members (
  group_id uuid not null references public.user_grids(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index group_members_user on public.group_members (user_id);

create table public.group_invites (
  group_id uuid not null references public.user_grids(id) on delete cascade,
  from_id uuid not null references public.users(id) on delete cascade,
  to_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (group_id, to_id)
);
create index group_invites_to on public.group_invites (to_id);

create or replace function public.is_group_member(g uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select g is not null and exists (select 1 from group_members where group_id = g and user_id = auth.uid())
$$;

-- ---------- group rows ----------

alter table public.user_grids add column group_id uuid;
alter table public.square_states add column group_id uuid;
alter table public.moments add column group_id uuid;
alter table public.photos
  add column group_id uuid,
  -- Only used in group grids; a solo photo follows its moment's audience.
  add column audience text not null default 'group' check (audience in ('group', 'private'));

alter table public.user_grids add constraint user_grids_group_is_self check (group_id is null or group_id = id);

-- Rows outlive the person who added them.
alter table public.user_grids alter column user_id drop not null;
alter table public.square_states alter column user_id drop not null;
alter table public.moments alter column user_id drop not null;
alter table public.photos alter column user_id drop not null;

/** One person's words on a group moment. */
create table public.moment_entries (
  id uuid primary key,
  user_id uuid default auth.uid() references public.users(id) on delete set null,
  moment_id uuid not null references public.moments(id) on delete cascade,
  group_id uuid not null,
  body text not null default '',
  audience text not null default 'group' check (audience in ('group', 'private')),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  server_updated_at timestamptz not null default clock_timestamp()
);
create index moment_entries_pull on public.moment_entries (group_id, server_updated_at);
create index moment_entries_moment on public.moment_entries (moment_id);

create index user_grids_group on public.user_grids (group_id) where group_id is not null;
create index square_states_group on public.square_states (group_id, server_updated_at) where group_id is not null;
create index moments_group on public.moments (group_id, server_updated_at) where group_id is not null;
create index photos_group on public.photos (group_id, server_updated_at) where group_id is not null;

/**
 * When a Group entry or photo becomes Private, the others in the group can no longer read
 * it, so they'd never see the change. This tells their phones to drop their copy.
 */
create table public.group_unshares (
  id bigserial primary key,
  group_id uuid not null references public.user_grids(id) on delete cascade,
  row_table text not null check (row_table in ('moment_entries', 'photos')),
  row_id uuid not null,
  server_updated_at timestamptz not null default clock_timestamp()
);
create index group_unshares_pull on public.group_unshares (group_id, server_updated_at);

-- Turning a grid into a group grid, and clearing who added a row when they delete their
-- account, are the only writes allowed to change group_id or user_id. They set this.
create or replace function public.regrouping() returns boolean
language sql stable set search_path = public as $$
  select coalesce(current_setting('airstrive.regroup', true), '') = 'on'
$$;

create or replace function public.lww_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if public.regrouping() then
    new.server_updated_at := clock_timestamp();
    return new;
  end if;
  if old.deleted_at is not null then
    return old;
  end if;
  if new.updated_at < old.updated_at and new.deleted_at is null then
    return old;
  end if;
  new.user_id := old.user_id;
  new.server_updated_at := clock_timestamp();
  return new;
end $$;

create trigger moment_entries_lww before update on public.moment_entries for each row execute function public.lww_guard();

/**
 * Keeps group_id true to the row's parent whatever the phone sends, and the rules that
 * follow from it: group grids and their moments stay private to the group, and a group
 * grid is never deleted by one person (they leave it instead).
 */
create or replace function public.group_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  parent uuid;
begin
  if regrouping() then return new; end if;

  if tg_table_name = 'user_grids' then
    if tg_op = 'INSERT' then
      new.group_id := null;
    else
      new.group_id := old.group_id;
      if old.group_id is not null then
        new.deleted_at := old.deleted_at;
      end if;
    end if;
    if new.group_id is not null then new.audience := 'private'; end if;
    return new;
  end if;

  if tg_table_name = 'square_states' then
    select group_id into parent from user_grids where id = new.user_grid_id;
  elsif tg_table_name = 'moments' then
    select group_id into parent from square_states where id = new.square_state_id;
  else
    select group_id into parent from moments where id = new.moment_id;
  end if;
  if tg_op = 'UPDATE' and parent is distinct from old.group_id then
    raise exception 'rows can''t move between grids' using errcode = '42501';
  end if;
  new.group_id := parent;
  -- A group moment's words live in each person's entry.
  if tg_table_name = 'moments' and new.group_id is not null then
    new.audience := 'private';
    new.body := '';
  end if;
  return new;
end $$;

create trigger user_grids_group before insert or update on public.user_grids for each row execute function public.group_guard();
create trigger square_states_group before insert or update on public.square_states for each row execute function public.group_guard();
create trigger moments_group before insert or update on public.moments for each row execute function public.group_guard();
create trigger photos_group before insert or update on public.photos for each row execute function public.group_guard();
create trigger moment_entries_group before insert or update on public.moment_entries for each row execute function public.group_guard();

create or replace function public.note_unshare() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.group_id is not null and old.audience = 'group' and new.audience = 'private' then
    insert into group_unshares (group_id, row_table, row_id) values (old.group_id, tg_table_name, old.id);
  end if;
  return null;
end $$;

create trigger photos_unshare after update on public.photos for each row execute function public.note_unshare();
create trigger moment_entries_unshare after update on public.moment_entries for each row execute function public.note_unshare();

-- ---------- row-level security ----------

-- Solo rows: the owner's, as before.
drop policy user_grids_own on public.user_grids;
create policy user_grids_own on public.user_grids for all to authenticated
  using (user_id = auth.uid() and group_id is null)
  with check (user_id = auth.uid() and group_id is null);

drop policy square_states_own on public.square_states;
create policy square_states_own on public.square_states for all to authenticated
  using (user_id = auth.uid() and group_id is null)
  with check (
    user_id = auth.uid() and group_id is null
    and exists (select 1 from public.user_grids ug where ug.id = user_grid_id and ug.user_id = auth.uid())
  );

drop policy moments_own on public.moments;
create policy moments_own on public.moments for all to authenticated
  using (user_id = auth.uid() and group_id is null)
  with check (
    user_id = auth.uid() and group_id is null
    and exists (select 1 from public.square_states s where s.id = square_state_id and s.user_id = auth.uid())
  );

drop policy photos_own on public.photos;
create policy photos_own on public.photos for all to authenticated
  using (user_id = auth.uid() and group_id is null)
  with check (
    user_id = auth.uid() and group_id is null
    and exists (select 1 from public.moments m where m.id = moment_id and m.user_id = auth.uid())
    and (storage_path is null or storage_path like auth.uid()::text || '/%')
  );

-- Group rows: the board and the shared moments are everyone's in the group. Anyone can
-- add a moment; it stays credited to whoever added it. Phones write with upserts, and
-- Postgres checks an upsert's row against the insert policies even when it ends up
-- updating, so each table the group updates needs an insert policy too.
create policy user_grids_group on public.user_grids for select to authenticated using (public.is_group_member(group_id));
create policy user_grids_group_update on public.user_grids for update to authenticated
  using (public.is_group_member(group_id)) with check (public.is_group_member(group_id));

create policy square_states_group on public.square_states for select to authenticated using (public.is_group_member(group_id));
create policy square_states_group_insert on public.square_states for insert to authenticated
  with check (public.is_group_member(group_id) and user_id = auth.uid());
create policy square_states_group_update on public.square_states for update to authenticated
  using (public.is_group_member(group_id)) with check (public.is_group_member(group_id));

create policy moments_group on public.moments for select to authenticated using (public.is_group_member(group_id));
create policy moments_group_insert on public.moments for insert to authenticated
  with check (public.is_group_member(group_id) and user_id = auth.uid());
create policy moments_group_update on public.moments for update to authenticated
  using (public.is_group_member(group_id)) with check (public.is_group_member(group_id));

-- Entries and photos are their author's to change, and Private ones are theirs alone to see.
create policy photos_group on public.photos for select to authenticated
  using (public.is_group_member(group_id) and (audience = 'group' or user_id = auth.uid()));
create policy photos_group_write on public.photos for insert to authenticated
  with check (
    public.is_group_member(group_id) and user_id = auth.uid()
    and (storage_path is null or storage_path like auth.uid()::text || '/%')
  );
create policy photos_group_update on public.photos for update to authenticated
  using (public.is_group_member(group_id) and user_id = auth.uid())
  with check (
    public.is_group_member(group_id) and user_id = auth.uid()
    and (storage_path is null or storage_path like auth.uid()::text || '/%')
  );

alter table public.moment_entries enable row level security;
create policy moment_entries_read on public.moment_entries for select to authenticated
  using (public.is_group_member(group_id) and (audience = 'group' or user_id = auth.uid()));
create policy moment_entries_write on public.moment_entries for insert to authenticated
  with check (public.is_group_member(group_id) and user_id = auth.uid());
create policy moment_entries_update on public.moment_entries for update to authenticated
  using (public.is_group_member(group_id) and user_id = auth.uid())
  with check (public.is_group_member(group_id) and user_id = auth.uid());

alter table public.group_members enable row level security;
alter table public.group_invites enable row level security;
alter table public.group_unshares enable row level security;
create policy group_members_read on public.group_members for select to authenticated using (public.is_group_member(group_id));
create policy group_invites_read on public.group_invites for select to authenticated
  using (to_id = auth.uid() or public.is_group_member(group_id));
create policy group_unshares_read on public.group_unshares for select to authenticated using (public.is_group_member(group_id));

grant select, insert, update on public.moment_entries to authenticated;
grant select on public.group_members, public.group_invites, public.group_unshares to authenticated;

-- A group grid's template is readable by everyone in the group, even when it's someone's
-- private grid. (The subquery sees the user_grids rows the reader may see.)
drop policy grids_read on public.grids;
create policy grids_read on public.grids for select to authenticated using (
  (is_public and not is_hidden)
  or author_id = auth.uid()
  or exists (select 1 from public.user_grids ug where ug.grid_id = grids.id)
  or public.is_admin()
);

-- ---------- photos ----------

-- Group moments never reach profiles, so they're out of the friends rules entirely.
create or replace function public.can_view_moment(moment uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select can_view(auth.uid(), m.user_id, moment_audience(m.id)) from moments m
    where m.id = moment and m.group_id is null
  ), false)
$$;

create or replace function public.can_read_photo(path text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from photos p
    where p.storage_path = path and p.deleted_at is null and case
      when p.group_id is null then can_view_moment(p.moment_id)
      else is_group_member(p.group_id) and (p.audience = 'group' or p.user_id = auth.uid())
    end
  )
$$;

/**
 * Photos from someone who deleted their account are moved to groups/{group_id}/ so the
 * group keeps them. The last person to leave a group clears that folder.
 */
create or replace function public.can_manage_group_folder(path text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  parts text[] := string_to_array(path, '/');
begin
  if array_length(parts, 1) <> 3 or parts[1] <> 'groups' then return false; end if;
  return is_group_member(parts[2]::uuid);
exception when invalid_text_representation then
  return false;
end $$;

create policy photos_bucket_group_delete on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and public.can_manage_group_folder(name));
create policy photos_bucket_group_list on storage.objects for select to authenticated
  using (bucket_id = 'photos' and public.can_manage_group_folder(name));

-- ---------- starting, inviting, leaving ----------

/**
 * Turns one of your grids into a group grid, with you as its first member. Anything you've
 * already written moves into your entries and photos, shared with the group when
 * share_existing is true and Private otherwise, and the grid leaves your profile.
 */
create or replace function public.make_group(user_grid uuid, share_existing boolean default false) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  ug user_grids;
begin
  if me is null then raise exception 'not signed in'; end if;
  select * into ug from user_grids where id = user_grid for update;
  if not found or ug.deleted_at is not null then raise exception 'grid not found'; end if;
  if ug.group_id is not null then
    if is_group_member(ug.group_id) then return ug.group_id; end if;
    raise exception 'grid not found';
  end if;
  if ug.user_id is distinct from me then raise exception 'grid not found'; end if;

  perform set_config('airstrive.regroup', 'on', true);
  update user_grids set group_id = id, audience = 'private', updated_at = greatest(updated_at, now()) where id = user_grid;
  update square_states set group_id = user_grid where user_grid_id = user_grid;
  insert into moment_entries (id, user_id, moment_id, group_id, body, audience, created_at, updated_at)
    select gen_random_uuid(), m.user_id, m.id, user_grid, m.body,
           case when share_existing then 'group' else 'private' end, m.created_at, now()
    from moments m join square_states ss on ss.id = m.square_state_id
    where ss.user_grid_id = user_grid and m.deleted_at is null and btrim(m.body) <> '';
  update photos p set group_id = user_grid, updated_at = greatest(p.updated_at, now()),
         audience = case when share_existing then 'group' else 'private' end
    from moments m join square_states ss on ss.id = m.square_state_id
    where p.moment_id = m.id and ss.user_grid_id = user_grid;
  update moments m set group_id = user_grid, audience = 'private', body = '', updated_at = greatest(m.updated_at, now())
    from square_states ss where ss.id = m.square_state_id and ss.user_grid_id = user_grid;
  perform set_config('airstrive.regroup', '', true);

  insert into group_members (group_id, user_id) values (user_grid, me);
  return user_grid;
end $$;

/** Invites a friend into a group you're in. */
create or replace function public.invite_to_group(grp uuid, friend uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception 'not signed in'; end if;
  if not is_group_member(grp) then raise exception 'not in this group'; end if;
  if exists (select 1 from group_members where group_id = grp and user_id = friend) then return 'member'; end if;
  if not are_friends(me, friend) or is_blocked(me, friend) then raise exception 'only friends can be invited'; end if;
  insert into group_invites (group_id, from_id, to_id) values (grp, me, friend) on conflict do nothing;
  return 'invited';
end $$;

create or replace function public.cancel_group_invite(grp uuid, friend uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_group_member(grp) then raise exception 'not in this group'; end if;
  delete from group_invites where group_id = grp and to_id = friend;
end $$;

/** Accept joins the group; No thanks drops the invite. */
create or replace function public.respond_group_invite(grp uuid, accept boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception 'not signed in'; end if;
  delete from group_invites where group_id = grp and to_id = me;
  if not found then raise exception 'no such invite'; end if;
  if accept then
    insert into group_members (group_id, user_id) values (grp, me) on conflict do nothing;
  end if;
end $$;

/**
 * Leaves a group. What you added stays for the others. When the last person leaves, the
 * grid goes; it returns 'deleted' then, so the phone can clear the group's photo files.
 */
create or replace function public.leave_group(grp uuid) returns text
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  delete from group_members where group_id = grp and user_id = auth.uid();
  if not found then return 'left'; end if;
  return case when exists (select 1 from user_grids where id = grp) then 'left' else 'deleted' end;
end $$;

create or replace function public.drop_empty_group() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from group_members where group_id = old.group_id) then
    delete from user_grids where id = old.group_id;
  end if;
  return null;
end $$;

create trigger group_members_drop_empty after delete on public.group_members
  for each row execute function public.drop_empty_group();

/**
 * Before an account goes: keep what it added to group grids for the group, credited to no
 * one. Private entries and photos go with it, since nobody else could ever see them.
 * (delete-account moves the kept photo files out of the person's folder first.)
 */
create or replace function public.release_group_rows() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from moment_entries where user_id = old.id and audience = 'private';
  perform set_config('airstrive.regroup', 'on', true);
  update photos set deleted_at = coalesce(deleted_at, now()), updated_at = now()
    where user_id = old.id and group_id is not null and audience = 'private';
  update user_grids set user_id = null where user_id = old.id and group_id is not null;
  update square_states set user_id = null where user_id = old.id and group_id is not null;
  update moments set user_id = null where user_id = old.id and group_id is not null;
  update photos set user_id = null where user_id = old.id and group_id is not null;
  -- Not left to the foreign key: lww_guard keeps user_id as it was on ordinary updates.
  update moment_entries set user_id = null where user_id = old.id;
  perform set_config('airstrive.regroup', '', true);
  return old;
end $$;

create trigger users_release_group_rows before delete on public.users
  for each row execute function public.release_group_rows();

-- ---------- lists ----------

/**
 * The groups you're in, with everyone the phone may need a name for: the members, the
 * people invited, and anyone who added something and has since left.
 */
create or replace function public.my_groups()
returns table (group_id uuid, people jsonb)
language sql stable security definer set search_path = public as $$
  select gm.group_id, coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', u.id, 'username', coalesce(u.username, 'someone'),
             'status', case p.rank when 1 then 'member' when 2 then 'invited' else 'left' end
           ) order by p.rank, lower(u.username))
    from (
      select x.user_id, min(x.rank) as rank from (
        select m.user_id, 1 as rank from group_members m where m.group_id = gm.group_id
        union all select i.to_id, 2 from group_invites i where i.group_id = gm.group_id
        union all select e.user_id, 3 from moment_entries e where e.group_id = gm.group_id and e.user_id is not null
        union all select ph.user_id, 3 from photos ph where ph.group_id = gm.group_id and ph.user_id is not null
        union all select mo.user_id, 3 from moments mo where mo.group_id = gm.group_id and mo.user_id is not null
      ) x group by x.user_id
    ) p join users u on u.id = p.user_id
  ), '[]'::jsonb)
  from group_members gm
  where gm.user_id = auth.uid()
$$;

create or replace function public.my_group_invites()
returns table (group_id uuid, from_username text, title text, color text, cols int, rows int, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select i.group_id, coalesce(u.username, 'someone'), g.title, g.color, g.cols, g.rows, i.created_at
  from group_invites i
  join users u on u.id = i.from_id
  join user_grids ug on ug.id = i.group_id
  join grids g on g.id = ug.grid_id
  where i.to_id = auth.uid() and not is_blocked(auth.uid(), i.from_id)
  order by i.created_at desc
$$;

-- ---------- profiles leave group grids out ----------

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
      where ug.user_id = u.id and ug.group_id is null and ug.deleted_at is null and can_view(auth.uid(), u.id, ug.audience)
    ), '[]'::jsonb)
  )
  from users u
  where u.id = target and auth.uid() is not null and not is_blocked(auth.uid(), u.id)
$$;

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
  where ug.id = user_grid and ug.group_id is null and ug.deleted_at is null and can_view(auth.uid(), ug.user_id, ug.audience)
$$;

-- ---------- grants ----------

do $$
declare f text;
begin
  foreach f in array array[
    'public.group_guard()', 'public.note_unshare()', 'public.drop_empty_group()', 'public.release_group_rows()'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
  foreach f in array array[
    -- regrouping() is read by lww_guard, which runs as the person writing.
    'public.is_group_member(uuid)', 'public.regrouping()', 'public.can_manage_group_folder(text)',
    'public.make_group(uuid, boolean)', 'public.invite_to_group(uuid, uuid)', 'public.cancel_group_invite(uuid, uuid)',
    'public.respond_group_invite(uuid, boolean)', 'public.leave_group(uuid)', 'public.my_groups()',
    'public.my_group_invites()'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
