-- Friends, profiles and audiences. Runs after atlas.sql.
\set ON_ERROR_STOP on
reset role;

-- Four new people: Ana, Ben, Cy and Dee.
insert into auth.users (id) values
  ('a1111111-0000-4000-8000-000000000001'), ('b2222222-0000-4000-8000-000000000002'),
  ('c3333333-0000-4000-8000-000000000003'), ('d4444444-0000-4000-8000-000000000004');
update public.users set username = 'Ana' where id = 'a1111111-0000-4000-8000-000000000001';
update public.users set username = 'Ben' where id = 'b2222222-0000-4000-8000-000000000002';
update public.users set username = 'Cy_' where id = 'c3333333-0000-4000-8000-000000000003';
update public.users set username = 'Dee' where id = 'd4444444-0000-4000-8000-000000000004';

-- ----- Ana's grids: one public, one for friends, one private -----
set role authenticated;
set request.jwt.claim.sub = 'a1111111-0000-4000-8000-000000000001';

insert into public.user_grids (id, grid_id, freebies_left, started_at, updated_at, audience) values
  ('a0000000-0000-4000-8000-0000000000a1', 'grid_fall', 2, now(), now(), 'public'),
  ('a0000000-0000-4000-8000-0000000000a2', 'grid_running', 2, now(), now(), 'friends'),
  ('a0000000-0000-4000-8000-0000000000a3', 'grid_chess', 2, now(), now(), 'private');
insert into public.square_states (id, user_grid_id, idx, state, updated_at) values
  ('a0000000-0000-4000-8000-0000000000b1', 'a0000000-0000-4000-8000-0000000000a1', 20, 'done', now()),
  ('a0000000-0000-4000-8000-0000000000b2', 'a0000000-0000-4000-8000-0000000000a1', 21, 'done', now()),
  ('a0000000-0000-4000-8000-0000000000b3', 'a0000000-0000-4000-8000-0000000000a1', 22, 'done', now()),
  ('a0000000-0000-4000-8000-0000000000b4', 'a0000000-0000-4000-8000-0000000000a1', 0, 'hidden', now()),
  ('a0000000-0000-4000-8000-0000000000b5', 'a0000000-0000-4000-8000-0000000000a2', 35, 'done', now()),
  ('a0000000-0000-4000-8000-0000000000b6', 'a0000000-0000-4000-8000-0000000000a3', 20, 'done', now());
insert into public.moments (id, square_state_id, title, body, happened_on, place, with_people, created_at, updated_at, audience) values
  ('a0000000-0000-4000-8000-0000000000c1', 'a0000000-0000-4000-8000-0000000000b1', 'Public one', 'For everyone', '2026-10-20', 'Placeville', 'Samwise', now(), now(), 'public'),
  ('a0000000-0000-4000-8000-0000000000c2', 'a0000000-0000-4000-8000-0000000000b2', 'Friends one', 'For friends', '2026-10-21', '', '', now(), now(), 'friends'),
  ('a0000000-0000-4000-8000-0000000000c3', 'a0000000-0000-4000-8000-0000000000b3', 'Private one', 'Just me', '2026-10-22', '', '', now(), now(), 'private'),
  -- Public moment on a friends grid: reaches friends only.
  ('a0000000-0000-4000-8000-0000000000c5', 'a0000000-0000-4000-8000-0000000000b5', 'Run', '', '2026-10-23', '', '', now(), now(), 'public'),
  ('a0000000-0000-4000-8000-0000000000c6', 'a0000000-0000-4000-8000-0000000000b6', 'Chess', '', '2026-10-24', '', '', now(), now(), 'public');
insert into public.photos (id, moment_id, position, storage_path, is_cover, created_at, updated_at) values
  ('a0000000-0000-4000-8000-0000000000d1', 'a0000000-0000-4000-8000-0000000000c1', 0, 'a1111111-0000-4000-8000-000000000001/d1.webp', true, now(), now()),
  ('a0000000-0000-4000-8000-0000000000d2', 'a0000000-0000-4000-8000-0000000000c2', 0, 'a1111111-0000-4000-8000-000000000001/d2.webp', true, now(), now()),
  ('a0000000-0000-4000-8000-0000000000d3', 'a0000000-0000-4000-8000-0000000000c3', 0, 'a1111111-0000-4000-8000-000000000001/d3.webp', true, now(), now());
reset role;
insert into storage.objects (bucket_id, name) values
  ('photos', 'a1111111-0000-4000-8000-000000000001/d1.webp'),
  ('photos', 'a1111111-0000-4000-8000-000000000001/d2.webp'),
  ('photos', 'a1111111-0000-4000-8000-000000000001/d3.webp');
set role authenticated;

do $$ begin
  assert (select count(*) from public.my_friends()) = 0, 'no friends yet';
  assert (select count(*) from public.search_usernames('an')) = 0, 'two letters is too short';
  assert (select username from public.search_usernames('BEN')) = 'Ben', 'search ignores case';
  assert (select relation from public.search_usernames('ben')) = 'none', 'not friends';
  assert (select count(*) from public.search_usernames('ana')) = 0, 'never finds yourself';
  assert (select count(*) from public.search_usernames('cy_')) = 1, 'underscore matches literally';
  assert (select count(*) from public.search_usernames('c%_')) = 0, 'wildcards are literal';
end $$;

-- ----- a stranger sees only what is public -----
set request.jwt.claim.sub = 'c3333333-0000-4000-8000-000000000003';
do $$
declare p jsonb; g jsonb;
begin
  p := public.profile('a1111111-0000-4000-8000-000000000001');
  assert p->>'username' = 'Ana', 'profile found';
  assert p->>'relation' = 'none', 'stranger';
  assert jsonb_array_length(p->'grids') = 1, 'stranger sees the public grid only';
  assert p->'grids'->0->>'title' = (select title from public.grids where id = 'grid_fall'), 'the public grid';

  g := public.profile_grid('a0000000-0000-4000-8000-0000000000a1');
  assert (select count(*) from jsonb_array_elements(g->'squares') s where s->'moment' <> 'null'::jsonb) = 1, 'stranger sees one moment';
  assert (select s->'moment'->>'title' from jsonb_array_elements(g->'squares') s where (s->>'idx')::int = 20) = 'Public one', 'the public moment';
  assert (select s->>'state' from jsonb_array_elements(g->'squares') s where (s->>'idx')::int = 21) = 'revealed', 'unseen moments look revealed';
  assert (select s->>'prompt' from jsonb_array_elements(g->'squares') s where (s->>'idx')::int = 0) = '', 'hidden prompts stay hidden';
  assert not (g::text like '%Placeville%') and not (g::text like '%Samwise%'), 'place and with never returned';
  assert public.profile_grid('a0000000-0000-4000-8000-0000000000a2') is null, 'friends grid not visible';
  assert public.profile_grid('a0000000-0000-4000-8000-0000000000a3') is null, 'private grid not visible';

  assert (select count(*) from storage.objects where name like 'a1111111%') = 1, 'stranger reads the public photo only';
  -- The sync tables still return nothing of anyone else's.
  assert (select count(*) from public.moments where user_id = 'a1111111-0000-4000-8000-000000000001') = 0, 'no moments through the sync tables';
  assert (select count(*) from public.user_grids where user_id = 'a1111111-0000-4000-8000-000000000001') = 0, 'no grids through the sync tables';
  begin
    perform public.are_friends('a1111111-0000-4000-8000-000000000001', 'b2222222-0000-4000-8000-000000000002');
    raise exception 'helper callable';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ----- Ana asks Ben; Ben accepts -----
set request.jwt.claim.sub = 'a1111111-0000-4000-8000-000000000001';
do $$ begin
  assert public.request_friend('b2222222-0000-4000-8000-000000000002') = 'requested', 'request sent';
  assert public.request_friend('b2222222-0000-4000-8000-000000000002') = 'requested', 'asking twice is fine';
  assert (select relation from public.search_usernames('ben')) = 'requested', 'search shows the request';
end $$;

set request.jwt.claim.sub = 'b2222222-0000-4000-8000-000000000002';
do $$ begin
  assert (select username from public.my_friend_requests()) = 'Ana', 'Ben sees the request';
  assert (select jsonb_array_length(public.profile('a1111111-0000-4000-8000-000000000001')->'grids')) = 1, 'not friends yet';
  perform public.respond_request('a1111111-0000-4000-8000-000000000001', true);
  assert (select username from public.my_friends()) = 'Ana', 'friends now';
  assert (select count(*) from public.my_friend_requests()) = 0, 'request gone';
end $$;

do $$
declare p jsonb; g jsonb;
begin
  p := public.profile('a1111111-0000-4000-8000-000000000001');
  assert p->>'relation' = 'friends', 'relation is friends';
  assert jsonb_array_length(p->'grids') = 2, 'friend sees public and friends grids';
  g := public.profile_grid('a0000000-0000-4000-8000-0000000000a1');
  assert (select count(*) from jsonb_array_elements(g->'squares') s where s->'moment' <> 'null'::jsonb) = 2, 'friend sees public and friends moments';
  assert (select count(*) from storage.objects where name like 'a1111111%') = 2, 'friend reads two photos';
  g := public.profile_grid('a0000000-0000-4000-8000-0000000000a2');
  assert (select s->'moment'->>'title' from jsonb_array_elements(g->'squares') s where (s->>'idx')::int = 35) = 'Run', 'public moment on a friends grid reaches friends';
  assert public.profile_grid('a0000000-0000-4000-8000-0000000000a3') is null, 'private grid still hidden';
end $$;

-- A stranger still can't see the public moment on the friends grid.
set request.jwt.claim.sub = 'c3333333-0000-4000-8000-000000000003';
do $$ begin
  assert public.profile_grid('a0000000-0000-4000-8000-0000000000a2') is null, 'friends grid hidden from strangers';
end $$;

-- ----- Not now, and asking back -----
set request.jwt.claim.sub = 'c3333333-0000-4000-8000-000000000003';
select public.request_friend('a1111111-0000-4000-8000-000000000001');
set request.jwt.claim.sub = 'a1111111-0000-4000-8000-000000000001';
do $$ begin
  perform public.respond_request('c3333333-0000-4000-8000-000000000003', false);
  assert (select count(*) from public.my_friend_requests()) = 0, 'not now hides it';
end $$;
set request.jwt.claim.sub = 'c3333333-0000-4000-8000-000000000003';
do $$ begin
  assert (select relation from public.search_usernames('ana')) = 'requested', 'sender still sees it pending';
  perform public.cancel_request('a1111111-0000-4000-8000-000000000001');
  assert (select relation from public.search_usernames('ana')) = 'none', 'cancelled';
end $$;
-- Two people asking each other become friends.
select public.request_friend('d4444444-0000-4000-8000-000000000004');
set request.jwt.claim.sub = 'd4444444-0000-4000-8000-000000000004';
do $$ begin
  assert public.request_friend('c3333333-0000-4000-8000-000000000003') = 'friends', 'asking back makes friends';
end $$;

-- ----- codes -----
set request.jwt.claim.sub = 'a1111111-0000-4000-8000-000000000001';
create temp table the_code as select public.my_friend_code() as c;
do $$ begin
  assert public.my_friend_code() = (select c from the_code), 'same code until used';
  assert char_length((select c from the_code)) = 12, 'twelve characters';
  assert public.accept_friend_code((select c from the_code)) = 'invalid', 'own code';
end $$;
set request.jwt.claim.sub = 'd4444444-0000-4000-8000-000000000004';
do $$ begin
  assert (select username from public.preview_friend_code(lower((select c from the_code)))) = 'Ana', 'preview names the owner, any case';
  assert public.accept_friend_code((select c from the_code)) = 'friends', 'code accepted';
  assert (select count(*) from public.my_friends() where username = 'Ana') = 1, 'friends by code';
end $$;
set request.jwt.claim.sub = 'c3333333-0000-4000-8000-000000000003';
do $$ begin
  assert public.accept_friend_code((select c from the_code)) = 'invalid', 'a code works once';
  assert (select count(*) from public.preview_friend_code((select c from the_code))) = 0, 'used code previews nothing';
end $$;
set request.jwt.claim.sub = 'a1111111-0000-4000-8000-000000000001';
do $$ begin
  assert public.my_friend_code() <> (select c from the_code), 'a new code after use';
end $$;

-- ----- blocking -----
set request.jwt.claim.sub = 'a1111111-0000-4000-8000-000000000001';
select public.block_user('d4444444-0000-4000-8000-000000000004');
do $$ begin
  assert (select count(*) from public.my_friends() where username = 'Dee') = 0, 'block removes the friendship';
  assert (select username from public.my_blocks()) = 'Dee', 'listed as blocked';
end $$;
set request.jwt.claim.sub = 'd4444444-0000-4000-8000-000000000004';
do $$ begin
  assert public.profile('a1111111-0000-4000-8000-000000000001') is null, 'blocked person sees no profile';
  assert public.profile_grid('a0000000-0000-4000-8000-0000000000a1') is null, 'or public grids';
  assert (select count(*) from public.search_usernames('ana')) = 0, 'or search results';
  assert (select count(*) from storage.objects where name like 'a1111111%') = 0, 'or photos';
  assert public.request_friend('a1111111-0000-4000-8000-000000000001') = 'requested', 'a request looks normal';
end $$;
set request.jwt.claim.sub = 'a1111111-0000-4000-8000-000000000001';
do $$ begin
  assert (select count(*) from public.my_friend_requests()) = 0, 'but never arrives';
  perform public.unblock_user('d4444444-0000-4000-8000-000000000004');
  assert (select count(*) from public.my_blocks()) = 0, 'unblocked';
  assert (select count(*) from public.my_friends() where username = 'Dee') = 0, 'unblocking does not refriend';
end $$;

-- ----- reports and moderation -----
set request.jwt.claim.sub = 'c3333333-0000-4000-8000-000000000003';
insert into public.reports (target_kind, moment_id, reason) values ('moment', 'a0000000-0000-4000-8000-0000000000c1', 'spam');
insert into public.reports (target_kind, user_id, reason) values ('user', 'a1111111-0000-4000-8000-000000000001', 'harassment');
do $$ begin
  begin
    insert into public.reports (target_kind, moment_id, reason) values ('moment', 'a0000000-0000-4000-8000-0000000000c2', 'spam');
    raise exception 'reported a moment they cannot see';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.reports (target_kind, user_id, reason) values ('user', 'c3333333-0000-4000-8000-000000000003', 'spam');
    raise exception 'reported themselves';
  exception when insufficient_privilege then null;
  end;
end $$;

set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
do $$
declare r uuid;
begin
  assert (public.admin_moment('a0000000-0000-4000-8000-0000000000c1'))->>'owner' = 'Ana', 'admin sees the reported moment';
  select id into r from public.reports where moment_id = 'a0000000-0000-4000-8000-0000000000c1';
  perform public.admin_resolve_report(r, 'hide');
end $$;

set request.jwt.claim.sub = 'c3333333-0000-4000-8000-000000000003';
do $$
declare g jsonb;
begin
  g := public.profile_grid('a0000000-0000-4000-8000-0000000000a1');
  assert (select count(*) from jsonb_array_elements(g->'squares') s where s->'moment' <> 'null'::jsonb) = 0, 'hidden moment is gone';
  assert (select count(*) from storage.objects where name like 'a1111111%') = 0, 'and its photo';
end $$;
set request.jwt.claim.sub = 'a1111111-0000-4000-8000-000000000001';
do $$ begin
  assert (select count(*) from public.moments where id = 'a0000000-0000-4000-8000-0000000000c1') = 1, 'the owner keeps it';
end $$;

-- Suspended sharing: public reaches friends only.
reset role;
update public.users set sharing_suspended = true where id = 'a1111111-0000-4000-8000-000000000001';
set role authenticated;
set request.jwt.claim.sub = 'c3333333-0000-4000-8000-000000000003';
do $$ begin
  assert jsonb_array_length(public.profile('a1111111-0000-4000-8000-000000000001')->'grids') = 0, 'suspended: strangers see nothing';
end $$;
set request.jwt.claim.sub = 'b2222222-0000-4000-8000-000000000002';
do $$ begin
  assert jsonb_array_length(public.profile('a1111111-0000-4000-8000-000000000001')->'grids') = 2, 'suspended: friends still see';
  perform public.remove_friend('a1111111-0000-4000-8000-000000000001');
  assert (select count(*) from public.my_friends()) = 0, 'removed';
  assert jsonb_array_length(public.profile('a1111111-0000-4000-8000-000000000001')->'grids') = 0, 'removed friend sees nothing';
end $$;

-- Nobody writes the friend tables directly.
do $$ begin
  begin
    insert into public.friendships (user_a, user_b) values ('a1111111-0000-4000-8000-000000000001', 'b2222222-0000-4000-8000-000000000002');
    raise exception 'direct friendship insert accepted';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.blocks;
    raise exception 'direct block delete accepted';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Deleting an account takes its friendships with it.
reset role;
delete from auth.users where id = 'b2222222-0000-4000-8000-000000000002';
do $$ begin
  assert not exists (select 1 from public.friendships where 'b2222222-0000-4000-8000-000000000002' in (user_a, user_b)), 'friendships gone';
end $$;
select 'friends checks passed';
