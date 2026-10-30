-- Run after supabase-stubs.sql and the migrations. Any failure raises and stops the script.
\set ON_ERROR_STOP on

insert into auth.users (id) values
  ('11111111-1111-1111-1111-111111111111'),
  ('22222222-2222-2222-2222-222222222222');

do $$ begin
  assert (select count(*) from public.users) = 2, 'profile rows created by trigger';
  assert (select count(*) from public.grids where is_official) = 31, 'six starter grids and the premade ones';
  assert (select count(*) from public.grid_squares) = 1648, 'starter and premade prompts';
end $$;

-- ----- as user one -----
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

select public.claim_username('Paulk');

insert into public.user_grids (id, grid_id, freebies_left, started_at, updated_at)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'grid_fall', 2, now(), '2026-10-25T10:00:00Z');
insert into public.square_states (id, user_grid_id, idx, state, updated_at)
values ('bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 21, 'revealed', '2026-10-25T10:00:00Z');
insert into public.moments (id, square_state_id, title, happened_on, created_at, updated_at)
values ('cccccccc-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', 'Carve a pumpkin', '2026-10-25', now(), '2026-10-25T10:00:00Z');

-- An older write loses.
insert into public.moments (id, square_state_id, title, body, happened_on, created_at, updated_at)
values ('cccccccc-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', 'Carve a pumpkin', 'stale', '2026-10-25', now(), '2026-10-25T09:00:00Z')
on conflict (id) do update set body = excluded.body, updated_at = excluded.updated_at;
do $$ begin assert (select body from public.moments) = '', 'older write ignored'; end $$;

-- A newer write wins.
insert into public.moments (id, square_state_id, title, body, happened_on, created_at, updated_at)
values ('cccccccc-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', 'Carve a pumpkin', 'fresh', '2026-10-25', now(), '2026-10-25T11:00:00Z')
on conflict (id) do update set body = excluded.body, updated_at = excluded.updated_at;
do $$ begin assert (select body from public.moments) = 'fresh', 'newer write applied'; end $$;

-- Deleting wins, even against a later edit.
update public.moments set deleted_at = '2026-10-25T12:00:00Z', updated_at = '2026-10-25T12:00:00Z';
update public.moments set body = 'resurrected', updated_at = '2026-10-25T13:00:00Z', deleted_at = null;
do $$ begin
  assert (select deleted_at is not null and body = 'fresh' from public.moments), 'delete wins over edit';
end $$;

-- A new live moment can take the square once the old one is a tombstone.
insert into public.moments (id, square_state_id, title, happened_on, created_at, updated_at)
values ('cccccccc-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000001', 'Carve a pumpkin', '2026-10-26', now(), now());

-- Photo paths must be in the person's own folder.
insert into public.photos (id, moment_id, position, storage_path, created_at, updated_at)
values ('dddddddd-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000002', 0,
        '11111111-1111-1111-1111-111111111111/dddddddd-0000-0000-0000-000000000001.webp', now(), now());
do $$ begin
  begin
    insert into public.photos (id, moment_id, position, storage_path, created_at, updated_at)
    values (gen_random_uuid(), 'cccccccc-0000-0000-0000-000000000002', 1, '22222222-2222-2222-2222-222222222222/x.webp', now(), now());
    raise exception 'foreign storage path accepted';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Usernames cannot be set directly.
do $$ begin
  begin
    update public.users set username = 'sneaky';
    raise exception 'direct username update accepted';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ----- as user two -----
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

do $$ begin
  assert (select count(*) from public.moments) = 0, 'cannot see another person''s moments';
  assert (select count(*) from public.user_grids) = 0, 'cannot see another person''s grids';
  assert (select count(*) from public.users) = 1, 'sees only own profile';
  assert (select count(*) from public.grids) = 31, 'sees the public grids';
end $$;

do $$ begin
  begin
    perform public.claim_username('paulK');
    raise exception 'duplicate username accepted';
  exception when raise_exception then
    if sqlerrm <> 'username taken' then raise; end if;
  end;
  begin
    perform public.claim_username('Admin');
    raise exception 'reserved username accepted';
  exception when raise_exception then
    if sqlerrm <> 'username taken' then raise; end if;
  end;
end $$;

-- Cannot attach rows to someone else's grid.
do $$ begin
  begin
    insert into public.square_states (id, user_grid_id, idx, state, updated_at)
    values (gen_random_uuid(), 'aaaaaaaa-0000-0000-0000-000000000001', 22, 'revealed', now());
    raise exception 'foreign parent accepted';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Updating someone else's row is a silent no-op under RLS.
update public.moments set body = 'hijack';
reset role;
do $$ begin
  assert not exists (select 1 from public.moments where body = 'hijack'), 'foreign update blocked';
end $$;

-- Account deletion: removing the auth user removes every row the person owns.
delete from auth.users where id = '11111111-1111-1111-1111-111111111111';
do $$ begin
  assert (select count(*) from public.users) = 1, 'profile gone';
  assert (select count(*) from public.user_grids) = 0, 'grids gone';
  assert (select count(*) from public.square_states) = 0, 'squares gone';
  assert (select count(*) from public.moments) = 0, 'moments gone';
  assert (select count(*) from public.photos) = 0, 'photos gone';
  assert (select count(*) from public.grids) = 31, 'shared templates stay';
end $$;

select 'all checks passed';
