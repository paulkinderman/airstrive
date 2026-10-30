-- From friends on the wide home screen. Runs after avatars.sql.
\set ON_ERROR_STOP on
reset role;

-- Eve and Fin are friends; Gus is a stranger who shares in public.
insert into auth.users (id) values
  ('e5000000-0000-4000-8000-000000000001'), ('e5000000-0000-4000-8000-000000000002'), ('e5000000-0000-4000-8000-000000000003');
update public.users set username = 'Eve' where id = 'e5000000-0000-4000-8000-000000000001';
insert into public.friendships (user_a, user_b) values
  ('e5000000-0000-4000-8000-000000000001', 'e5000000-0000-4000-8000-000000000002');

set role authenticated;
set request.jwt.claim.sub = 'e5000000-0000-4000-8000-000000000001';
insert into public.user_grids (id, grid_id, freebies_left, started_at, updated_at, audience) values
  ('e5100000-0000-4000-8000-000000000001', 'grid_fall', 2, now(), now(), 'friends'),
  ('e5100000-0000-4000-8000-000000000002', 'grid_chess', 2, now(), now(), 'private');
insert into public.square_states (id, user_grid_id, idx, state, updated_at) values
  ('e5200000-0000-4000-8000-000000000001', 'e5100000-0000-4000-8000-000000000001', 20, 'done', now()),
  ('e5200000-0000-4000-8000-000000000002', 'e5100000-0000-4000-8000-000000000001', 21, 'done', now()),
  ('e5200000-0000-4000-8000-000000000003', 'e5100000-0000-4000-8000-000000000002', 20, 'done', now());
insert into public.moments (id, square_state_id, title, happened_on, created_at, updated_at, audience) values
  ('e5300000-0000-4000-8000-000000000001', 'e5200000-0000-4000-8000-000000000001', 'Older', '2026-10-20', now() - interval '1 day', now(), 'public'),
  ('e5300000-0000-4000-8000-000000000002', 'e5200000-0000-4000-8000-000000000002', 'Kept to myself', '2026-10-21', now(), now(), 'private'),
  ('e5300000-0000-4000-8000-000000000003', 'e5200000-0000-4000-8000-000000000003', 'Private grid', '2026-10-22', now(), now(), 'public');
insert into public.photos (id, moment_id, position, storage_path, is_cover, created_at, updated_at) values
  ('e5400000-0000-4000-8000-000000000001', 'e5300000-0000-4000-8000-000000000001', 0, 'e5000000-0000-4000-8000-000000000001/a.webp', false, now(), now()),
  ('e5400000-0000-4000-8000-000000000002', 'e5300000-0000-4000-8000-000000000001', 1, 'e5000000-0000-4000-8000-000000000001/b.webp', true, now(), now());

set request.jwt.claim.sub = 'e5000000-0000-4000-8000-000000000003';
insert into public.user_grids (id, grid_id, freebies_left, started_at, updated_at, audience) values
  ('e5100000-0000-4000-8000-000000000003', 'grid_fall', 2, now(), now(), 'public');
insert into public.square_states (id, user_grid_id, idx, state, updated_at) values
  ('e5200000-0000-4000-8000-000000000004', 'e5100000-0000-4000-8000-000000000003', 20, 'done', now());
insert into public.moments (id, square_state_id, title, happened_on, created_at, updated_at, audience) values
  ('e5300000-0000-4000-8000-000000000004', 'e5200000-0000-4000-8000-000000000004', 'For the world', '2026-10-23', now(), now(), 'public');

-- Fin sees Eve's shared moment with its cover, and nothing private or from strangers.
set request.jwt.claim.sub = 'e5000000-0000-4000-8000-000000000002';
do $$ begin
  assert (select count(*) from public.friend_moments()) = 1, 'one moment from a friend';
  assert (select title from public.friend_moments()) = 'Older', 'the shared one';
  assert (select username from public.friend_moments()) = 'Eve', 'with the friend''s name';
  assert (select cover_path from public.friend_moments()) = 'e5000000-0000-4000-8000-000000000001/b.webp', 'the cover photo';
  assert (select grid_title from public.friend_moments()) = (select title from public.grids where id = 'grid_fall'), 'and its grid';
end $$;

-- Eve doesn't see her own; Gus isn't a friend.
set request.jwt.claim.sub = 'e5000000-0000-4000-8000-000000000001';
do $$ begin assert (select count(*) from public.friend_moments()) = 0, 'not your own'; end $$;
set request.jwt.claim.sub = 'e5000000-0000-4000-8000-000000000003';
do $$ begin assert (select count(*) from public.friend_moments()) = 0, 'strangers see nothing'; end $$;

-- A block hides it.
reset role;
insert into public.blocks (blocker_id, blocked_id) values ('e5000000-0000-4000-8000-000000000001', 'e5000000-0000-4000-8000-000000000002');
set role authenticated;
set request.jwt.claim.sub = 'e5000000-0000-4000-8000-000000000002';
do $$ begin assert (select count(*) from public.friend_moments()) = 0, 'blocked'; end $$;

reset role;
set role anon;
do $$ begin
  begin
    perform public.friend_moments();
    raise exception 'anon called friend_moments';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
select 'friend moments checks passed';
