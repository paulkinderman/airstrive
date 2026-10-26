-- Group grids. Runs after friends.sql.
\set ON_ERROR_STOP on
reset role;

-- Gus, Hal and Ivy. Gus is friends with Hal and with Ivy; Hal and Ivy don't know each other.
insert into auth.users (id) values
  ('e0000000-0000-4000-8000-000000000001'), ('e0000000-0000-4000-8000-000000000002'),
  ('e0000000-0000-4000-8000-000000000003');
update public.users set username = 'Gus' where id = 'e0000000-0000-4000-8000-000000000001';
update public.users set username = 'Hal' where id = 'e0000000-0000-4000-8000-000000000002';
update public.users set username = 'Ivy' where id = 'e0000000-0000-4000-8000-000000000003';
insert into public.friendships (user_a, user_b) values
  ('e0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000003');

-- A grid Gus made and kept private, so only the group can read its template.
insert into public.grids (id, title, color, theme, size, cols, rows, author_id, is_public, made_by)
values ('f0000000-0000-4000-8000-000000000001', 'Our year', '#336699', 'Family', 'small', 6, 8,
        'e0000000-0000-4000-8000-000000000001', false, 'Gus');
insert into public.grid_squares (grid_id, idx, prompt)
select 'f0000000-0000-4000-8000-000000000001', i, 'Prompt ' || i from generate_series(0, 47) i;

-- ----- Gus starts it alone, writes two moments, then makes it a group grid -----
set role authenticated;
set request.jwt.claim.sub = 'e0000000-0000-4000-8000-000000000001';

insert into public.user_grids (id, grid_id, freebies_left, started_at, updated_at, audience) values
  ('f1000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001', 2, now(), now(), 'friends');
insert into public.square_states (id, user_grid_id, idx, state, updated_at) values
  ('f2000000-0000-4000-8000-000000000020', 'f1000000-0000-4000-8000-000000000001', 20, 'done', now()),
  ('f2000000-0000-4000-8000-000000000021', 'f1000000-0000-4000-8000-000000000001', 21, 'done', now()),
  ('f2000000-0000-4000-8000-000000000022', 'f1000000-0000-4000-8000-000000000001', 22, 'revealed', now()),
  ('f2000000-0000-4000-8000-000000000023', 'f1000000-0000-4000-8000-000000000001', 23, 'revealed', now());
insert into public.moments (id, square_state_id, title, body, happened_on, created_at, updated_at, audience) values
  ('f3000000-0000-4000-8000-000000000020', 'f2000000-0000-4000-8000-000000000020', 'Apple picking', 'Gus words', '2026-10-20', now(), now(), 'friends'),
  ('f3000000-0000-4000-8000-000000000021', 'f2000000-0000-4000-8000-000000000021', 'Long walk', 'Gus secret', '2026-10-21', now(), now(), 'private');
insert into public.photos (id, moment_id, position, storage_path, created_at, updated_at) values
  ('f4000000-0000-4000-8000-000000000020', 'f3000000-0000-4000-8000-000000000020', 0, 'e0000000-0000-4000-8000-000000000001/p20.webp', now(), now()),
  ('f4000000-0000-4000-8000-000000000021', 'f3000000-0000-4000-8000-000000000021', 0, 'e0000000-0000-4000-8000-000000000001/p21.webp', now(), now());
reset role;
insert into storage.objects (bucket_id, name) values
  ('photos', 'e0000000-0000-4000-8000-000000000001/p20.webp'),
  ('photos', 'e0000000-0000-4000-8000-000000000001/p21.webp'),
  ('photos', 'e0000000-0000-4000-8000-000000000002/h22.webp'),
  ('photos', 'e0000000-0000-4000-8000-000000000002/h23.webp');
set role authenticated;

do $$ begin
  -- A solo row can't be put into a group by the phone.
  update public.user_grids set group_id = id, updated_at = now() where id = 'f1000000-0000-4000-8000-000000000001';
  assert (select group_id from public.user_grids where id = 'f1000000-0000-4000-8000-000000000001') is null, 'phone cannot set group_id';
  begin
    insert into public.moment_entries (id, moment_id, body, created_at, updated_at)
    values (gen_random_uuid(), 'f3000000-0000-4000-8000-000000000020', 'x', now(), now());
    raise exception 'entry on a solo moment accepted';
  exception when not_null_violation or insufficient_privilege then null;
  end;

  assert public.make_group('f1000000-0000-4000-8000-000000000001') = 'f1000000-0000-4000-8000-000000000001', 'group made';
  assert public.make_group('f1000000-0000-4000-8000-000000000001') = 'f1000000-0000-4000-8000-000000000001', 'making it twice is fine';
  assert (select audience from public.user_grids where id = 'f1000000-0000-4000-8000-000000000001') = 'private', 'group grid is private';
  assert (select count(*) from public.square_states where group_id = 'f1000000-0000-4000-8000-000000000001') = 4, 'squares in the group';
  assert (select count(*) from public.moments where group_id = 'f1000000-0000-4000-8000-000000000001' and body = '' and audience = 'private') = 2, 'moment words moved out';
  assert (select audience from public.moment_entries where body = 'Gus words') = 'group', 'shared words become Group';
  assert (select audience from public.moment_entries where body = 'Gus secret') = 'private', 'private words stay Private';
  assert (select audience from public.photos where id = 'f4000000-0000-4000-8000-000000000020') = 'group', 'shared photo becomes Group';
  assert (select audience from public.photos where id = 'f4000000-0000-4000-8000-000000000021') = 'private', 'private photo stays Private';
  assert (select count(*) from public.my_groups()) = 1, 'Gus is in it';
  assert jsonb_array_length(public.profile('e0000000-0000-4000-8000-000000000001')->'grids') = 0, 'group grids leave the profile';

  -- Moments added later in a group grid can't be given a wider audience.
  update public.moments set audience = 'public', updated_at = now() where id = 'f3000000-0000-4000-8000-000000000020';
  assert (select audience from public.moments where id = 'f3000000-0000-4000-8000-000000000020') = 'private', 'group moments stay private';
  update public.user_grids set audience = 'public', updated_at = now() where id = 'f1000000-0000-4000-8000-000000000001';
  assert (select audience from public.user_grids where id = 'f1000000-0000-4000-8000-000000000001') = 'private', 'group grids stay private';

  begin
    perform public.invite_to_group('f1000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000002');
    raise exception 'invited a stranger';
  exception when raise_exception then
    if sqlerrm = 'invited a stranger' then raise; end if;
  end;
end $$;

-- Gus and Hal become friends; Gus invites Hal.
reset role;
insert into public.friendships (user_a, user_b) values ('e0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000002');
set role authenticated;
do $$ begin
  assert public.invite_to_group('f1000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000002') = 'invited', 'invited';
  assert public.invite_to_group('f1000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000002') = 'invited', 'inviting twice is fine';
  assert (select p->>'status' from public.my_groups(), jsonb_array_elements(people) p where p->>'username' = 'Hal') = 'invited', 'Hal shows as invited';
end $$;

-- ----- Hal: nothing until he accepts -----
set request.jwt.claim.sub = 'e0000000-0000-4000-8000-000000000002';
do $$ begin
  assert (select title from public.my_group_invites()) = 'Our year', 'Hal sees the invite';
  assert (select from_username from public.my_group_invites()) = 'Gus', 'from Gus';
  assert (select count(*) from public.user_grids where id = 'f1000000-0000-4000-8000-000000000001') = 0, 'not before accepting';
  assert (select count(*) from public.moment_entries) = 0, 'no entries before accepting';
  assert (select count(*) from public.grids where id = 'f0000000-0000-4000-8000-000000000001') = 0, 'private template hidden';
  begin
    perform public.invite_to_group('f1000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001');
    raise exception 'outsider invited';
  exception when raise_exception then
    if sqlerrm = 'outsider invited' then raise; end if;
  end;

  perform public.respond_group_invite('f1000000-0000-4000-8000-000000000001', true);
  assert (select count(*) from public.my_group_invites()) = 0, 'invite used';
  assert (select count(*) from public.user_grids where id = 'f1000000-0000-4000-8000-000000000001') = 1, 'Hal sees the grid';
  assert (select count(*) from public.grids where id = 'f0000000-0000-4000-8000-000000000001') = 1, 'and its template';
  assert (select count(*) from public.grid_squares where grid_id = 'f0000000-0000-4000-8000-000000000001') = 48, 'and its squares';
  assert (select count(*) from public.square_states where group_id = 'f1000000-0000-4000-8000-000000000001') = 4, 'the board';
  assert (select count(*) from public.moments where group_id = 'f1000000-0000-4000-8000-000000000001') = 2, 'both moments (titles are shared)';
  assert (select count(*) from public.moment_entries) = 1, 'Gus''s Group entry only';
  assert (select body from public.moment_entries) = 'Gus words', 'the Group one';
  assert (select count(*) from public.photos where group_id = 'f1000000-0000-4000-8000-000000000001') = 1, 'Group photo only';
  assert (select count(*) from storage.objects where name like 'e0000000-0000-4000-8000-000000000001/%') = 1, 'reads the Group photo file only';
  assert (select name from storage.objects where name like 'e0000000-0000-4000-8000-000000000001/%') like '%p20.webp', 'the Group photo file';
  assert jsonb_array_length(public.profile('e0000000-0000-4000-8000-000000000001')->'grids') = 0, 'not on Gus''s profile for friends either';
  assert not public.can_view_moment('f3000000-0000-4000-8000-000000000020'), 'group moments are outside the friends rules';
end $$;

-- Hal does a square: the board is shared, so he updates Gus's rows the way the phone does (an upsert).
insert into public.square_states (id, user_grid_id, idx, state, done_at, updated_at)
values ('f2000000-0000-4000-8000-000000000022', 'f1000000-0000-4000-8000-000000000001', 22, 'done', now(), now() + interval '1 minute')
on conflict (id) do update set state = excluded.state, done_at = excluded.done_at, updated_at = excluded.updated_at;
insert into public.moments (id, square_state_id, title, happened_on, created_at, updated_at) values
  ('f3000000-0000-4000-8000-000000000022', 'f2000000-0000-4000-8000-000000000022', 'Pie night', '2026-10-22', now(), now());
insert into public.moment_entries (id, moment_id, body, audience, created_at, updated_at) values
  ('f5000000-0000-4000-8000-000000000022', 'f3000000-0000-4000-8000-000000000022', 'Hal words', 'group', now(), now()),
  ('f5000000-0000-4000-8000-000000000023', 'f3000000-0000-4000-8000-000000000020', 'Hal secret', 'private', now(), now());
insert into public.photos (id, moment_id, position, storage_path, audience, created_at, updated_at) values
  ('f4000000-0000-4000-8000-000000000022', 'f3000000-0000-4000-8000-000000000022', 0, 'e0000000-0000-4000-8000-000000000002/h22.webp', 'group', now(), now()),
  ('f4000000-0000-4000-8000-000000000023', 'f3000000-0000-4000-8000-000000000022', 1, 'e0000000-0000-4000-8000-000000000002/h23.webp', 'group', now(), now());

do $$ begin
  assert (select state from public.square_states where id = 'f2000000-0000-4000-8000-000000000022') = 'done', 'Hal did a square';
  assert (select user_id from public.square_states where id = 'f2000000-0000-4000-8000-000000000022') = 'e0000000-0000-4000-8000-000000000001', 'still Gus''s row';
  assert (select group_id from public.moment_entries where id = 'f5000000-0000-4000-8000-000000000022') = 'f1000000-0000-4000-8000-000000000001', 'group set from the moment';

  -- Someone else's entry isn't his to change.
  update public.moment_entries set body = 'changed', updated_at = now() + interval '1 hour' where body = 'Gus words';
  assert (select body from public.moment_entries where moment_id = 'f3000000-0000-4000-8000-000000000020' and user_id <> auth.uid()) = 'Gus words', 'others'' entries are read-only';
  -- Shared moment details are anyone's.
  update public.moments set title = 'Apple picking!', updated_at = now() + interval '1 minute' where id = 'f3000000-0000-4000-8000-000000000020';
  assert (select title from public.moments where id = 'f3000000-0000-4000-8000-000000000020') = 'Apple picking!', 'shared title edited';
  -- One person can't delete the whole grid, or take it out of the group.
  update public.user_grids set deleted_at = now(), updated_at = now() + interval '1 minute' where id = 'f1000000-0000-4000-8000-000000000001';
  assert (select deleted_at from public.user_grids where id = 'f1000000-0000-4000-8000-000000000001') is null, 'leaving, not deleting';
  begin
    update public.moment_entries set moment_id = 'f3000000-0000-4000-8000-000000000000', updated_at = now() + interval '1 minute'
    where id = 'f5000000-0000-4000-8000-000000000022';
    raise exception 'moved an entry out of its grid';
  exception when insufficient_privilege then null;
  end;
  -- Photos only from his own folder.
  begin
    insert into public.photos (id, moment_id, position, storage_path, created_at, updated_at)
    values (gen_random_uuid(), 'f3000000-0000-4000-8000-000000000022', 2, 'e0000000-0000-4000-8000-000000000001/x.webp', now(), now());
    raise exception 'photo from someone else''s folder';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ----- Gus sees Hal's Group things, not his Private one -----
set request.jwt.claim.sub = 'e0000000-0000-4000-8000-000000000001';
do $$ begin
  assert (select count(*) from public.moment_entries) = 3, 'his two and Hal''s Group one';
  assert not exists (select 1 from public.moment_entries where body = 'Hal secret'), 'not Hal''s Private one';
  assert (select count(*) from public.photos where group_id = 'f1000000-0000-4000-8000-000000000001') = 4, 'all photos but none private of Hal''s';
  assert (select count(*) from storage.objects where name like 'e0000000-0000-4000-8000-000000000002/%') = 2, 'reads Hal''s Group photo files';
  assert (select p->>'status' from public.my_groups(), jsonb_array_elements(people) p where p->>'username' = 'Hal') = 'member', 'Hal is a member';
  assert (select count(*) from public.group_unshares) = 0, 'nothing unshared yet';
end $$;

-- Hal makes a photo Private: Gus's phone is told to drop it.
set request.jwt.claim.sub = 'e0000000-0000-4000-8000-000000000002';
update public.photos set audience = 'private', updated_at = now() + interval '1 minute' where id = 'f4000000-0000-4000-8000-000000000023';
set request.jwt.claim.sub = 'e0000000-0000-4000-8000-000000000001';
do $$ begin
  assert (select row_id from public.group_unshares) = 'f4000000-0000-4000-8000-000000000023', 'unshare recorded';
  assert not exists (select 1 from public.photos where id = 'f4000000-0000-4000-8000-000000000023'), 'Gus no longer reads it';
  assert (select count(*) from storage.objects where name like 'e0000000-0000-4000-8000-000000000002/%') = 1, 'or its file';
  assert public.invite_to_group('f1000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000003') = 'invited', 'Gus invites Ivy';
end $$;

-- ----- Ivy: outside until she accepts, then a member like the others -----
set request.jwt.claim.sub = 'e0000000-0000-4000-8000-000000000003';
do $$ begin
  assert (select count(*) from public.moments where group_id is not null) = 0, 'nothing before joining';
  assert (select count(*) from public.group_unshares) = 0, 'not even unshares';
  assert (select count(*) from storage.objects where name like 'e0000000%') = 0, 'or files';
  perform public.respond_group_invite('f1000000-0000-4000-8000-000000000001', true);
  assert (select count(*) from public.moment_entries) = 2, 'both Group entries';
  begin
    perform public.respond_group_invite('f1000000-0000-4000-8000-000000000001', true);
    raise exception 'answered twice';
  exception when raise_exception then
    if sqlerrm = 'answered twice' then raise; end if;
  end;
end $$;

-- ----- Hal leaves: his words stay, his access goes -----
set request.jwt.claim.sub = 'e0000000-0000-4000-8000-000000000002';
do $$ begin
  assert public.leave_group('f1000000-0000-4000-8000-000000000001') = 'left', 'Hal left';
  assert (select count(*) from public.moment_entries) = 0, 'he no longer reads entries, even his own';
  assert (select count(*) from public.moments where group_id is not null) = 0, 'or moments he added';
  assert (select count(*) from public.my_groups()) = 0, 'no groups';
  update public.moment_entries set body = 'edited after leaving', updated_at = now() + interval '2 hours' where id = 'f5000000-0000-4000-8000-000000000022';
end $$;
set request.jwt.claim.sub = 'e0000000-0000-4000-8000-000000000003';
do $$ begin
  assert (select body from public.moment_entries where id = 'f5000000-0000-4000-8000-000000000022') = 'Hal words', 'his entry stays, unedited';
  assert (select p->>'status' from public.my_groups(), jsonb_array_elements(people) p where p->>'username' = 'Hal') = 'left', 'shown as having left';
end $$;

-- ----- Gus deletes his account: the group keeps the grid and his Group things -----
reset role;
delete from auth.users where id = 'e0000000-0000-4000-8000-000000000001';
set role authenticated;
do $$ begin
  assert (select count(*) from public.user_grids where id = 'f1000000-0000-4000-8000-000000000001') = 1, 'grid kept';
  assert (select user_id from public.user_grids where id = 'f1000000-0000-4000-8000-000000000001') is null, 'credited to no one';
  assert (select count(*) from public.square_states where group_id = 'f1000000-0000-4000-8000-000000000001') = 4, 'board kept';
  assert (select count(*) from public.moments where group_id = 'f1000000-0000-4000-8000-000000000001') = 3, 'moments kept';
  assert (select user_id from public.moment_entries where body = 'Gus words') is null, 'his Group entry kept, unnamed';
  assert (select count(*) from public.photos where id = 'f4000000-0000-4000-8000-000000000020' and user_id is null) = 1, 'his Group photo kept';
  assert (select count(*) from public.grids where id = 'f0000000-0000-4000-8000-000000000001') = 1, 'template still readable';
  assert not exists (select 1 from public.my_groups(), jsonb_array_elements(people) p where p->>'username' = 'Gus'), 'Gus is gone from the list';
end $$;
reset role;
do $$ begin
  assert not exists (select 1 from public.moment_entries where body = 'Gus secret'), 'his Private entry went with him';
  assert (select deleted_at from public.photos where id = 'f4000000-0000-4000-8000-000000000021') is not null, 'his Private photo too';
end $$;

-- Group folders: members manage them, nobody else.
insert into storage.objects (bucket_id, name) values ('photos', 'groups/f1000000-0000-4000-8000-000000000001/p20.webp');
set role authenticated;
do $$ begin
  assert public.can_manage_group_folder('groups/f1000000-0000-4000-8000-000000000001/p20.webp'), 'Ivy manages the folder';
  assert not public.can_manage_group_folder('groups/not-a-uuid/p20.webp'), 'nonsense path';
  assert not public.can_manage_group_folder('groups/f1000000-0000-4000-8000-000000000001/a/b.webp'), 'nested path';
end $$;
set request.jwt.claim.sub = 'e0000000-0000-4000-8000-000000000002';
do $$ begin
  assert not public.can_manage_group_folder('groups/f1000000-0000-4000-8000-000000000001/p20.webp'), 'Hal left';
  delete from storage.objects where name like 'groups/%';
end $$;
reset role;
do $$ begin
  assert (select count(*) from storage.objects where name like 'groups/%') = 1, 'Hal could not delete it';
end $$;

-- ----- The last one out: the grid goes -----
set role authenticated;
set request.jwt.claim.sub = 'e0000000-0000-4000-8000-000000000003';
do $$ begin
  delete from storage.objects where name like 'groups/f1000000-0000-4000-8000-000000000001/%';
  assert public.leave_group('f1000000-0000-4000-8000-000000000001') = 'deleted', 'last one out';
  assert public.leave_group('f1000000-0000-4000-8000-000000000001') = 'left', 'leaving again is harmless';
end $$;
reset role;
do $$ begin
  assert (select count(*) from storage.objects where name like 'groups/%') = 0, 'Ivy cleared the folder';
  assert not exists (select 1 from public.user_grids where id = 'f1000000-0000-4000-8000-000000000001'), 'grid gone';
  assert not exists (select 1 from public.moment_entries where group_id = 'f1000000-0000-4000-8000-000000000001'), 'entries gone';
  assert not exists (select 1 from public.photos where group_id = 'f1000000-0000-4000-8000-000000000001'), 'photos gone';
end $$;

-- Someone else's grid can't be turned into a group.
reset role;
insert into public.user_grids (id, user_id, grid_id, freebies_left, started_at, updated_at)
values ('f1000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000002', 'grid_fall', 2, now(), now());
set role authenticated;
set request.jwt.claim.sub = 'e0000000-0000-4000-8000-000000000003';
do $$ begin
  begin
    perform public.make_group('f1000000-0000-4000-8000-000000000002');
    raise exception 'took someone else''s grid';
  exception when raise_exception then
    if sqlerrm <> 'grid not found' then raise; end if;
  end;
end $$;
reset role;
select 'group checks passed';
