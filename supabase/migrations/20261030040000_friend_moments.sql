-- From friends: the newest moments the viewer's friends have shared, for the right-hand
-- panel of the wide home screen. Only accepted friends, never strangers' public moments,
-- and only moments the viewer may already see (can_view_moment), so blocks, audiences,
-- hidden moments and group grids work exactly as they do on a profile.

create or replace function public.friend_moments(lim int default 8)
returns table (
  moment_id uuid, user_id uuid, username text, title text, happened_on date, created_at timestamptz,
  fill text, grid_title text, grid_color text, cover_path text
)
language sql stable security definer set search_path = public as $$
  select m.id, m.user_id, u.username, m.title, m.happened_on, m.created_at, m.fill, g.title, g.color,
         (select p.storage_path from photos p
          where p.moment_id = m.id and p.deleted_at is null and p.storage_path is not null
          order by p.is_cover desc, p.position limit 1)
  from friendships f
  join moments m on m.user_id = case when f.user_a = auth.uid() then f.user_b else f.user_a end
  join square_states ss on ss.id = m.square_state_id
  join user_grids ug on ug.id = ss.user_grid_id
  join grids g on g.id = ug.grid_id
  join users u on u.id = m.user_id
  where auth.uid() in (f.user_a, f.user_b)
    and m.deleted_at is null and ss.deleted_at is null and ug.deleted_at is null
    and ug.group_id is null
    and can_view_moment(m.id)
  order by m.created_at desc
  limit least(greatest(coalesce(lim, 8), 1), 20)
$$;

revoke execute on function public.friend_moments(int) from public, anon;
grant execute on function public.friend_moments(int) to authenticated;
