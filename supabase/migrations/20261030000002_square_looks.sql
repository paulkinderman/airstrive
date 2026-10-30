-- How squares look. A grid can pick the icon shown on its revealed squares, and a
-- moment can pick how its done square is filled in when it has no photo.
--
--  grids.reveal_icon: '' is the grid-color dot; anything else is an emoji
--  moments.fill:      '' is the grid's color; '#rrggbb' is another color; anything else is an emoji

alter table public.grids add column reveal_icon text not null default ''
  check (char_length(reveal_icon) <= 16);
alter table public.moments add column fill text not null default ''
  check (char_length(fill) <= 16);

/**
 * save_grid() as in v2_atlas, now also taking reveal_icon. The author can change it later
 * like the title and color.
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

  insert into grids (id, title, color, theme, size, cols, rows, description, reveal_icon, made_by, author_id,
                     is_official, is_public, shared_at, updated_at)
  values (gid, btrim(g->>'title'), g->>'color', g->>'theme', sz, c, r, coalesce(g->>'description', ''), icon,
          coalesce(me.username, 'someone'), uid, false, want_public, case when want_public then now() end, ts);

  insert into grid_squares (grid_id, idx, prompt, hint, cluster)
  select gid, (s->>'idx')::int, btrim(s->>'prompt'), '', coalesce(s->>'cluster', '')
  from jsonb_array_elements(squares) s;

  return result;
end $$;

/** profile_grid() as in group_grids, now with the grid's reveal icon and each moment's fill. */
create or replace function public.profile_grid(user_grid uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'user_grid_id', ug.id,
    'owner_id', ug.user_id,
    'owner', u.username,
    'audience', ug.audience,
    'completed_at', ug.completed_at,
    'grid', jsonb_build_object('id', g.id, 'title', g.title, 'color', g.color, 'cols', g.cols, 'rows', g.rows,
                               'description', g.description, 'made_by', g.made_by, 'reveal_icon', g.reveal_icon),
    'squares', (
      select jsonb_agg(sq order by (sq->>'idx')::int) from (
        select jsonb_build_object(
          'idx', ss.idx,
          'state', case when ss.state = 'done' and vm.id is null then 'revealed' else ss.state end,
          'prompt', case when ss.state = 'hidden' then '' else gs.prompt end,
          'cluster', case when ss.state = 'hidden' then '' else gs.cluster end,
          'moment', case when vm.id is null then null else jsonb_build_object(
            'id', vm.id, 'title', vm.title, 'body', vm.body, 'happened_on', vm.happened_on, 'fill', vm.fill,
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
          select m.id, m.title, m.body, m.happened_on, m.fill from moments m
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
