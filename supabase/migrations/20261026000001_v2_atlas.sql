-- AirStrive v2: the Atlas. Interests from onboarding, grids people make and share,
-- reports, the admin role, and the rule that two hides in 30 days suspends sharing.

-- ---------- users ----------

alter table public.users
  add column interests text[] not null default '{}',
  add column onboarded_at timestamptz,
  add column is_admin boolean not null default false,
  add column sharing_suspended boolean not null default false,
  add constraint interests_count check (cardinality(interests) <= 40);

-- interests and onboarded_at are the person's own; is_admin and sharing_suspended are not.
grant update (interests, onboarded_at) on public.users to authenticated;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from users where id = auth.uid()), false)
$$;
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

create policy users_admin_read on public.users for select to authenticated using (public.is_admin());

-- ---------- grids people make ----------

alter table public.grids
  add column created_at timestamptz not null default now(),
  add column shared_at timestamptz,
  add column hidden_at timestamptz,
  add constraint grids_size_shape check (
    (size = 'tiny' and cols = 4 and rows = 5) or (size = 'small' and cols = 6 and rows = 8) or
    (size = 'medium' and cols = 8 and rows = 10) or (size = 'full' and cols = 10 and rows = 12)
  ),
  add constraint grids_title_length check (char_length(btrim(title)) between 1 and 60),
  add constraint grids_description_length check (char_length(description) <= 280),
  add constraint grids_color_hex check (color ~ '^#[0-9A-Fa-f]{6}$'),
  add constraint grids_theme_length check (char_length(theme) between 1 and 30);

alter table public.grid_squares
  add constraint grid_squares_prompt_length check (char_length(btrim(prompt)) between 1 and 120),
  add constraint grid_squares_cluster_length check (char_length(cluster) <= 40);

create index grids_atlas on public.grids (is_official desc, shared_at desc) where is_public and not is_hidden;
create index grids_author on public.grids (author_id);

-- Indexes revealed when a grid is started. Mirrors startingSquares() in src/data/types.ts.
create or replace function public.starting_squares(size text) returns int[]
language sql immutable set search_path = public as $$
  select case size
    when 'tiny' then array[9, 10]
    when 'small' then array[20, 21, 26, 27]
    when 'medium' then array[35, 36, 43, 44]
    when 'full' then array[54, 55, 64, 65]
  end
$$;

-- Admins see every grid, hidden ones included.
drop policy grids_read on public.grids;
create policy grids_read on public.grids for select to authenticated using (
  (is_public and not is_hidden)
  or author_id = auth.uid()
  or exists (select 1 from public.user_grids ug where ug.grid_id = grids.id and ug.user_id = auth.uid())
  or public.is_admin()
);

/**
 * The only way a person writes a grid. The phone calls it from the sync queue.
 * The first call creates the grid with its squares. Squares never change after that
 * (people who adopted it keep the board they started), but the author can still change
 * the title, color, theme, description and whether it is shared, newest write winning.
 * Sharing while suspended saves the grid as private and says so.
 */
create or replace function public.save_grid(g jsonb, squares jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  gid text := g->>'id';
  sz text := g->>'size';
  ts timestamptz := (g->>'updated_at')::timestamptz;
  want_public boolean := coalesce((g->>'is_public')::boolean, false);
  me public.users;
  old public.grids;
  c int;
  r int;
  result text := 'saved';
begin
  if uid is null then raise exception 'not signed in'; end if;
  if gid is null or gid !~ '^[0-9a-f-]{36}$' then raise exception 'invalid grid id'; end if;
  if ts is null then raise exception 'missing updated_at'; end if;
  select * into me from users where id = uid;

  if want_public and me.sharing_suspended then
    want_public := false;
    result := 'sharing_suspended';
  end if;

  select * into old from grids where id = gid for update;
  if found then
    if old.author_id is distinct from uid then raise exception 'not your grid'; end if;
    if old.updated_at >= ts then return 'stale'; end if;
    update grids set
      title = btrim(g->>'title'),
      color = g->>'color',
      theme = g->>'theme',
      description = coalesce(g->>'description', ''),
      is_public = want_public,
      shared_at = case when want_public then coalesce(old.shared_at, now()) else old.shared_at end,
      made_by = coalesce(me.username, made_by),
      updated_at = ts
    where id = gid;
    return result;
  end if;

  c := case sz when 'tiny' then 4 when 'small' then 6 when 'medium' then 8 when 'full' then 10 end;
  r := case sz when 'tiny' then 5 when 'small' then 8 when 'medium' then 10 when 'full' then 12 end;
  if c is null then raise exception 'invalid size'; end if;
  if jsonb_typeof(squares) <> 'array' or jsonb_array_length(squares) <> c * r then
    raise exception 'a % grid needs % squares', sz, c * r;
  end if;
  if (select count(distinct (s->>'idx')::int) from jsonb_array_elements(squares) s
      where (s->>'idx')::int between 0 and c * r - 1) <> c * r then
    raise exception 'square indexes must cover the board once';
  end if;

  insert into grids (id, title, color, theme, size, cols, rows, description, made_by, author_id,
                     is_official, is_public, shared_at, updated_at)
  values (gid, btrim(g->>'title'), g->>'color', g->>'theme', sz, c, r, coalesce(g->>'description', ''),
          coalesce(me.username, 'someone'), uid, false, want_public, case when want_public then now() end, ts);

  insert into grid_squares (grid_id, idx, prompt, hint, cluster)
  select gid, (s->>'idx')::int, btrim(s->>'prompt'), '', coalesce(s->>'cluster', '')
  from jsonb_array_elements(squares) s;

  return result;
end $$;
revoke execute on function public.save_grid(jsonb, jsonb) from public, anon;
grant execute on function public.save_grid(jsonb, jsonb) to authenticated;

/** Everything browsable in the Atlas, with each grid's starting prompts for the cards. */
create or replace function public.atlas_grids()
returns table (
  id text, title text, color text, theme text, size text, cols int, rows int, description text,
  made_by text, author_id uuid, is_official boolean, shared_at timestamptz, updated_at timestamptz, starters text[]
)
language sql stable security invoker set search_path = public as $$
  select g.id, g.title, g.color, g.theme, g.size, g.cols, g.rows, g.description,
         g.made_by, g.author_id, g.is_official, g.shared_at, g.updated_at,
         array(select s.prompt from grid_squares s
               where s.grid_id = g.id and s.idx = any(starting_squares(g.size)) order by s.idx)
  from grids g
  where g.is_public and not g.is_hidden
  order by g.is_official desc, g.shared_at desc nulls last, g.title
  limit 1000
$$;
revoke execute on function public.atlas_grids() from public, anon;
grant execute on function public.atlas_grids() to authenticated;

-- ---------- reports ----------

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null default auth.uid() references public.users(id) on delete cascade,
  grid_id text not null references public.grids(id) on delete cascade,
  reason text not null check (reason in ('harassment', 'hateful', 'spam', 'other')),
  note text not null default '' check (char_length(note) <= 500),
  status text not null default 'open' check (status in ('open', 'hidden', 'dismissed')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.users(id) on delete set null
);
create unique index reports_one_open on public.reports (reporter_id, grid_id) where status = 'open';
create index reports_open on public.reports (created_at) where status = 'open';

alter table public.reports enable row level security;

-- Anyone can report a shared grid that isn't official and isn't their own.
create policy reports_insert on public.reports for insert to authenticated with check (
  reporter_id = auth.uid()
  and status = 'open'
  and exists (
    select 1 from public.grids g
    where g.id = grid_id and g.is_public and not g.is_official and g.author_id is distinct from auth.uid()
  )
);
create policy reports_read on public.reports for select to authenticated
  using (reporter_id = auth.uid() or public.is_admin());

grant select on public.reports to authenticated;
grant insert (grid_id, reason, note) on public.reports to authenticated;

-- ---------- admin ----------

create or replace function public.require_admin() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admins only' using errcode = '42501'; end if;
end $$;
revoke execute on function public.require_admin() from public, anon, authenticated;

/** Hides or unhides a grid. Two hides on the same author within 30 days suspends their sharing. */
create or replace function public.admin_set_grid_hidden(grid text, hidden boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  author uuid;
begin
  perform require_admin();
  update grids set is_hidden = hidden, hidden_at = case when hidden then now() end
  where id = grid returning author_id into author;
  if not found then raise exception 'grid not found'; end if;
  if hidden then
    update reports set status = 'hidden', resolved_at = now(), resolved_by = auth.uid()
    where grid_id = grid and status = 'open';
    if author is not null and (
      select count(*) from grids where author_id = author and is_hidden and hidden_at > now() - interval '30 days'
    ) >= 2 then
      update users set sharing_suspended = true where id = author;
    end if;
  end if;
end $$;

create or replace function public.admin_resolve_report(report uuid, action text) returns void
language plpgsql security definer set search_path = public as $$
declare
  grid text;
begin
  perform require_admin();
  select grid_id into grid from reports where id = report;
  if not found then raise exception 'report not found'; end if;
  if action = 'hide' then
    perform admin_set_grid_hidden(grid, true);
  elsif action = 'dismiss' then
    update reports set status = 'dismissed', resolved_at = now(), resolved_by = auth.uid() where id = report and status = 'open';
  else
    raise exception 'unknown action %', action;
  end if;
end $$;

create or replace function public.admin_set_sharing_suspended(target uuid, suspended boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform require_admin();
  update users set sharing_suspended = suspended where id = target;
  if not found then raise exception 'user not found'; end if;
end $$;

revoke execute on function public.admin_set_grid_hidden(text, boolean) from public, anon;
revoke execute on function public.admin_resolve_report(uuid, text) from public, anon;
revoke execute on function public.admin_set_sharing_suspended(uuid, boolean) from public, anon;
grant execute on function public.admin_set_grid_hidden(text, boolean) to authenticated;
grant execute on function public.admin_resolve_report(uuid, text) to authenticated;
grant execute on function public.admin_set_sharing_suspended(uuid, boolean) to authenticated;
