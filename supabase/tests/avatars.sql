-- Profile pictures. Runs after groups.sql.
\set ON_ERROR_STOP on
reset role;

-- Jo, Kit, Lou and Max. Jo and Kit are friends; Jo and Lou share a group grid; Max is a stranger.
insert into auth.users (id) values
  ('a7000000-0000-4000-8000-000000000001'), ('a7000000-0000-4000-8000-000000000002'),
  ('a7000000-0000-4000-8000-000000000003'), ('a7000000-0000-4000-8000-000000000004');
insert into public.friendships (user_a, user_b) values
  ('a7000000-0000-4000-8000-000000000001', 'a7000000-0000-4000-8000-000000000002');
insert into public.user_grids (id, user_id, grid_id, freebies_left, started_at, updated_at) values
  ('a7100000-0000-4000-8000-000000000001', 'a7000000-0000-4000-8000-000000000001', 'grid_fall', 2, now(), now());
insert into public.group_members (group_id, user_id) values
  ('a7100000-0000-4000-8000-000000000001', 'a7000000-0000-4000-8000-000000000001'),
  ('a7100000-0000-4000-8000-000000000001', 'a7000000-0000-4000-8000-000000000003');

-- ----- Jo sets a picture -----
set role authenticated;
set request.jwt.claim.sub = 'a7000000-0000-4000-8000-000000000001';

do $$ begin
  begin
    perform public.set_avatar('a7000000-0000-4000-8000-000000000001/one.jpg');
    raise exception 'set an avatar that was never uploaded';
  exception when others then
    assert sqlerrm = 'picture not uploaded', sqlerrm;
  end;
  begin
    perform public.set_avatar('a7000000-0000-4000-8000-000000000002/one.jpg');
    raise exception 'pointed at someone else''s folder';
  exception when others then
    assert sqlerrm = 'invalid picture', sqlerrm;
  end;
end $$;

insert into storage.objects (bucket_id, name) values ('avatars', 'a7000000-0000-4000-8000-000000000001/one.jpg');
do $$ begin
  begin
    insert into storage.objects (bucket_id, name) values ('avatars', 'a7000000-0000-4000-8000-000000000002/x.jpg');
    raise exception 'uploaded into someone else''s folder';
  exception when insufficient_privilege then null;
  end;
  assert public.set_avatar('a7000000-0000-4000-8000-000000000001/one.jpg') is null, 'nothing replaced';
  assert (select avatar_path from public.avatars(array['a7000000-0000-4000-8000-000000000001'::uuid]))
    = 'a7000000-0000-4000-8000-000000000001/one.jpg', 'sees own';
end $$;

-- avatar_path can't be written directly.
do $$ begin
  begin
    update public.users set avatar_path = null where id = 'a7000000-0000-4000-8000-000000000001';
    raise exception 'wrote avatar_path directly';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ----- who sees it -----
set request.jwt.claim.sub = 'a7000000-0000-4000-8000-000000000002';
do $$ begin
  assert (select count(*) from public.avatars(array['a7000000-0000-4000-8000-000000000001'::uuid])) = 1, 'friend sees it';
  assert (select count(*) from storage.objects where bucket_id = 'avatars') = 1, 'friend can read the file';
end $$;

set request.jwt.claim.sub = 'a7000000-0000-4000-8000-000000000003';
do $$ begin
  assert (select count(*) from public.avatars(array['a7000000-0000-4000-8000-000000000001'::uuid])) = 1, 'group member sees it';
  assert (select count(*) from storage.objects where bucket_id = 'avatars') = 1, 'group member can read the file';
end $$;

set request.jwt.claim.sub = 'a7000000-0000-4000-8000-000000000004';
do $$ begin
  assert (select count(*) from public.avatars(array['a7000000-0000-4000-8000-000000000001'::uuid])) = 0, 'stranger does not';
  assert (select count(*) from storage.objects where bucket_id = 'avatars') = 0, 'stranger cannot read the file';
  assert (select count(*) from public.users where id = 'a7000000-0000-4000-8000-000000000001') = 0, 'nor the users row';
end $$;

-- A block hides it from a friend.
set request.jwt.claim.sub = 'a7000000-0000-4000-8000-000000000001';
select public.block_user('a7000000-0000-4000-8000-000000000003');
set request.jwt.claim.sub = 'a7000000-0000-4000-8000-000000000003';
do $$ begin
  assert (select count(*) from public.avatars(array['a7000000-0000-4000-8000-000000000001'::uuid])) = 0, 'blocked: hidden';
  assert (select count(*) from storage.objects where bucket_id = 'avatars') = 0, 'blocked: file hidden';
end $$;

-- ----- a new picture: the old file stops being readable, and is returned for removal -----
set request.jwt.claim.sub = 'a7000000-0000-4000-8000-000000000001';
insert into storage.objects (bucket_id, name) values ('avatars', 'a7000000-0000-4000-8000-000000000001/two.jpg');
do $$ begin
  assert public.set_avatar('a7000000-0000-4000-8000-000000000001/two.jpg')
    = 'a7000000-0000-4000-8000-000000000001/one.jpg', 'returns the old path';
end $$;
set request.jwt.claim.sub = 'a7000000-0000-4000-8000-000000000002';
do $$ begin
  assert (select array_agg(name) from storage.objects where bucket_id = 'avatars')
    = array['a7000000-0000-4000-8000-000000000001/two.jpg'], 'only the current file reads';
end $$;

-- Removing it.
set request.jwt.claim.sub = 'a7000000-0000-4000-8000-000000000001';
do $$ begin
  assert public.set_avatar(null) = 'a7000000-0000-4000-8000-000000000001/two.jpg', 'returns the removed path';
end $$;
set request.jwt.claim.sub = 'a7000000-0000-4000-8000-000000000002';
do $$ begin
  assert (select count(*) from public.avatars(array['a7000000-0000-4000-8000-000000000001'::uuid])) = 0, 'gone';
end $$;

-- Only admins take a picture down.
do $$ begin
  begin
    perform public.admin_clear_avatar('a7000000-0000-4000-8000-000000000001');
    raise exception 'non-admin cleared a picture';
  exception when others then
    assert sqlerrm <> 'non-admin cleared a picture', sqlerrm;
  end;
end $$;

reset role;
select 'avatar checks passed';
