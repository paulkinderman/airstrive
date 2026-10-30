-- The Alexa skill (supabase/functions/alexa) reads with the person's own token from Alexa
-- account linking, so it sees exactly what the app sees. friend_moments already covers
-- what friends shared; this adds the shelf the Echo Show draws: the person's grids, solo
-- and group, each with its board, its Next up square, and the moment behind each done square.
--
-- Security invoker on purpose: row level security decides which grids, moments and
-- photos come back (own rows, and group rows for members, without others' private photos).

create or replace function public.echo_shelf(lim int default 12) returns jsonb
language sql stable security invoker set search_path = public as $$
  select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.finished, x.started_at desc), '[]'::jsonb)
  from (
    select ug.id as user_grid_id, g.title, g.color, g.cols, g.rows,
           ug.completed_at is not null as finished, ug.started_at, ug.group_id is not null as together,
           (select count(*) from square_states ss
            where ss.user_grid_id = ug.id and ss.deleted_at is null and ss.state = 'done') as done,
           (select count(*) from square_states ss
            where ss.user_grid_id = ug.id and ss.deleted_at is null) as total,
           -- The square most recently turned over and not yet done, as on the phone's home cards.
           (select gs.prompt from square_states ss
            join grid_squares gs on gs.grid_id = ug.grid_id and gs.idx = ss.idx
            where ss.user_grid_id = ug.id and ss.deleted_at is null and ss.state = 'revealed'
            order by ss.updated_at desc, ss.idx limit 1) as next_up,
           (select coalesce(jsonb_agg(jsonb_build_object(
                     'idx', ss.idx,
                     'state', ss.state,
                     'prompt', case when ss.state = 'hidden' then '' else gs.prompt end,
                     'title', m.title,
                     'happened_on', m.happened_on,
                     'cover_path', (select p.storage_path from photos p
                                    where p.moment_id = m.id and p.deleted_at is null and p.storage_path is not null
                                    order by p.is_cover desc, p.position limit 1)
                   ) order by ss.idx), '[]'::jsonb)
            from square_states ss
            join grid_squares gs on gs.grid_id = ug.grid_id and gs.idx = ss.idx
            left join lateral (
              select mo.id, mo.title, mo.happened_on from moments mo
              where mo.square_state_id = ss.id and mo.deleted_at is null
              order by mo.updated_at desc limit 1
            ) m on true
            where ss.user_grid_id = ug.id and ss.deleted_at is null) as squares
    from user_grids ug
    join grids g on g.id = ug.grid_id
    where ug.deleted_at is null
    order by ug.completed_at is not null, ug.started_at desc
    limit least(greatest(coalesce(lim, 12), 1), 30)
  ) x
$$;

revoke execute on function public.echo_shelf(int) from public, anon;
grant execute on function public.echo_shelf(int) to authenticated;
