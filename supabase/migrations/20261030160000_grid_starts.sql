-- A grid's creator can pick which squares are revealed when someone starts it.
--
--  grids.starts: the indexes revealed at the start, null for the usual ones (starting_squares)
--
-- At least one square, at most a quarter of the board, each on the board once. Like the
-- squares themselves, they're set when the grid is made and never change after.

/** Whether a grid's own starting squares fit its board. */
create or replace function public.starts_fit(starts int[], cells int) returns boolean
language sql immutable set search_path = public as $$
  select starts is null or (
    cardinality(starts) between 1 and cells / 4
    and (select count(distinct i) from unnest(starts) i where i between 0 and cells - 1) = cardinality(starts)
  )
$$;

alter table public.grids add column starts int[]
  constraint grids_starts_fit check (public.starts_fit(starts, cols * rows));

/** The squares revealed when a grid is started: its creator's pick, or the usual ones. */
create or replace function public.grid_starts(g public.grids) returns int[]
language sql stable set search_path = public as $$
  select coalesce(g.starts, starting_squares(g.size))
$$;

/**
 * save_grid() as in square_looks, now also taking starts when the grid is made: a JSON
 * array or the phone's '9,10,12', with '' or nothing for the usual squares.
 */
create or replace function public.save_grid(g jsonb, squares jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  gid text := g->>'id';
  sz text := g->>'size';
  ts timestamptz := (g->>'updated_at')::timestamptz;
  want_public boolean := coalesce((g->>'is_public')::boolean, false);
  icon text := left(btrim(coalesce(g->>'reveal_icon', '')), 16);
  starts int[];
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
      reveal_icon = icon,
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

  if jsonb_typeof(g->'starts') = 'array' then
    starts := array(select (x #>> '{}')::int from jsonb_array_elements(g->'starts') x);
  elsif btrim(coalesce(g->>'starts', '')) <> '' then
    starts := string_to_array(btrim(g->>'starts'), ',')::int[];
  end if;
  if cardinality(starts) = 0 then starts := null; end if;
  if not starts_fit(starts, c * r) then
    raise exception 'a % grid starts on 1 to % squares, each on the board once', sz, c * r / 4;
  end if;

  insert into grids (id, title, color, theme, size, cols, rows, description, reveal_icon, starts, made_by, author_id,
                     is_official, is_public, shared_at, updated_at)
  values (gid, btrim(g->>'title'), g->>'color', g->>'theme', sz, c, r, coalesce(g->>'description', ''), icon, starts,
          coalesce(me.username, 'someone'), uid, false, want_public, case when want_public then now() end, ts);

  insert into grid_squares (grid_id, idx, prompt, hint, cluster)
  select gid, (s->>'idx')::int, btrim(s->>'prompt'), '', coalesce(s->>'cluster', '')
  from jsonb_array_elements(squares) s;

  return result;
end $$;

/** atlas_grids() as in v2_atlas, with each grid's starting squares and the prompts on them. */
drop function public.atlas_grids();
create function public.atlas_grids()
returns table (
  id text, title text, color text, theme text, size text, cols int, rows int, description text,
  made_by text, author_id uuid, is_official boolean, shared_at timestamptz, updated_at timestamptz, starters text[],
  starts int[]
)
language sql stable security invoker set search_path = public as $$
  select g.id, g.title, g.color, g.theme, g.size, g.cols, g.rows, g.description,
         g.made_by, g.author_id, g.is_official, g.shared_at, g.updated_at,
         array(select s.prompt from grid_squares s
               where s.grid_id = g.id and s.idx = any(grid_starts(g)) order by s.idx),
         grid_starts(g)
  from grids g
  where g.is_public and not g.is_hidden
  order by g.is_official desc, g.shared_at desc nulls last, g.title
  limit 1000
$$;
revoke execute on function public.atlas_grids() from public, anon;
grant execute on function public.atlas_grids() to authenticated;
