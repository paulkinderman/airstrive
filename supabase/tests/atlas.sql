-- v2: making, sharing, reporting and moderating grids. Runs after rls_and_sync.sql.
\set ON_ERROR_STOP on
reset role;

-- rls_and_sync.sql deleted user one; bring them back.
insert into auth.users (id) values ('11111111-1111-1111-1111-111111111111'), ('33333333-3333-3333-3333-333333333333');
update public.users set is_admin = true where id = '33333333-3333-3333-3333-333333333333';

-- A board's worth of squares for save_grid.
create function pg_temp.squares(n int) returns jsonb language sql as $$
  select jsonb_agg(jsonb_build_object('idx', i, 'prompt', 'Square ' || i, 'cluster', 'Yours')) from generate_series(0, n - 1) i
$$;

-- ----- user one makes two grids -----
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select public.claim_username('Paulk');

do $$ begin
  assert public.save_grid(
    '{"id":"a0000000-0000-4000-8000-000000000001","title":"Piano","color":"#9C8CB8","theme":"Making","size":"tiny","description":"","is_public":true,"updated_at":"2026-10-26T10:00:00Z"}',
    pg_temp.squares(20)) = 'saved', 'creates a shared grid';
  assert public.save_grid(
    '{"id":"a0000000-0000-4000-8000-000000000002","title":"Pottery","color":"#D4A190","theme":"Making","size":"tiny","is_public":true,"updated_at":"2026-10-26T10:00:00Z"}',
    pg_temp.squares(20)) = 'saved', 'creates a second';
  assert public.save_grid(
    '{"id":"a0000000-0000-4000-8000-000000000003","title":"Secret","color":"#2EB08A","theme":"Mind","size":"tiny","is_public":false,"updated_at":"2026-10-26T10:00:00Z"}',
    pg_temp.squares(20)) = 'saved', 'creates a private grid';
end $$;

do $$ begin
  assert (select made_by from public.grids where id = 'a0000000-0000-4000-8000-000000000001') = 'Paulk', 'credited to the username';
  assert (select count(*) from public.grid_squares where grid_id = 'a0000000-0000-4000-8000-000000000001') = 20, 'squares saved';
  assert (select shared_at is not null from public.grids where id = 'a0000000-0000-4000-8000-000000000001'), 'shared_at set';
end $$;

-- Wrong square counts and older writes are refused or ignored; squares never change.
do $$ begin
  begin
    perform public.save_grid('{"id":"a0000000-0000-4000-8000-000000000009","title":"Bad","color":"#2EB08A","theme":"Mind","size":"small","updated_at":"2026-10-26T10:00:00Z"}', pg_temp.squares(20));
    raise exception 'wrong square count accepted';
  exception when raise_exception then
    if sqlerrm = 'wrong square count accepted' then raise; end if;
  end;
  assert public.save_grid('{"id":"a0000000-0000-4000-8000-000000000001","title":"Old name","color":"#9C8CB8","theme":"Making","size":"tiny","is_public":true,"updated_at":"2026-10-26T09:00:00Z"}', '[]') = 'stale';
  assert public.save_grid('{"id":"a0000000-0000-4000-8000-000000000001","title":"Piano, slowly","color":"#9C8CB8","theme":"Making","size":"tiny","is_public":true,"updated_at":"2026-10-26T11:00:00Z"}', '[]') = 'saved';
  assert (select title from public.grids where id = 'a0000000-0000-4000-8000-000000000001') = 'Piano, slowly', 'newer edit applied';
  assert (select count(*) from public.grid_squares where grid_id = 'a0000000-0000-4000-8000-000000000001') = 20, 'squares kept';
end $$;

-- People cannot write grids directly or set admin fields.
do $$ begin
  begin
    insert into public.grids (id, title, color, theme, size, cols, rows) values ('x', 'x', '#000000', 'x', 'tiny', 4, 5);
    raise exception 'direct grid insert accepted';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.users set is_admin = true;
    raise exception 'is_admin update accepted';
  exception when insufficient_privilege then null;
  end;
  update public.users set interests = '{running,chess}', onboarded_at = now();
  assert (select interests from public.users) = '{running,chess}', 'interests saved';
end $$;

-- Own grids can't be reported.
do $$ begin
  begin
    insert into public.reports (grid_id, reason) values ('a0000000-0000-4000-8000-000000000001', 'spam');
    raise exception 'self report accepted';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ----- user two browses and reports -----
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

do $$ begin
  assert (select count(*) from public.atlas_grids()) = 34, 'thirty-two official and two shared';
  assert not exists (select 1 from public.atlas_grids() where title = 'Secret'), 'private grid not listed';
  assert (select starters from public.atlas_grids() where id = 'grid_fall') =
    (select array_agg(prompt order by idx) from public.grid_squares where grid_id = 'grid_fall' and idx in (20, 21, 26, 27)),
    'starters are the centre squares';
  assert (select cardinality(starters) from public.atlas_grids() where id = 'a0000000-0000-4000-8000-000000000001') = 5, 'tiny has five starters';
  begin
    perform public.save_grid('{"id":"a0000000-0000-4000-8000-000000000001","title":"Mine now","color":"#9C8CB8","theme":"Making","size":"tiny","is_public":true,"updated_at":"2026-10-27T10:00:00Z"}', '[]');
    raise exception 'edited someone else''s grid';
  exception when raise_exception then
    if sqlerrm <> 'not your grid' then raise; end if;
  end;
  begin
    insert into public.reports (grid_id, reason) values ('grid_fall', 'spam');
    raise exception 'official report accepted';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.admin_set_grid_hidden('a0000000-0000-4000-8000-000000000001', true);
    raise exception 'non-admin hid a grid';
  exception when insufficient_privilege then null;
  end;
end $$;

insert into public.reports (grid_id, reason, note) values ('a0000000-0000-4000-8000-000000000001', 'spam', 'ads');
insert into public.reports (grid_id, reason) values ('a0000000-0000-4000-8000-000000000002', 'other');

-- Adopting the first grid before it is hidden.
insert into public.user_grids (id, grid_id, freebies_left, started_at, updated_at)
values ('aaaaaaaa-0000-0000-0000-000000000099', 'a0000000-0000-4000-8000-000000000001', 1, now(), now());

do $$ begin
  assert (select count(*) from public.reports) = 2, 'reporter sees own reports';
  begin
    insert into public.reports (grid_id, reason) values ('a0000000-0000-4000-8000-000000000001', 'spam');
    raise exception 'duplicate open report accepted';
  exception when unique_violation then null;
  end;
end $$;

-- ----- the admin -----
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';

do $$
declare r uuid;
begin
  assert public.is_admin(), 'is admin';
  assert (select count(*) from public.users) = 3, 'admin sees everyone';
  assert (select count(*) from public.grids where title = 'Secret') = 1, 'admin sees private grids';
  select id into r from public.reports where grid_id = 'a0000000-0000-4000-8000-000000000001';
  perform public.admin_resolve_report(r, 'hide');
  assert (select status from public.reports where id = r) = 'hidden', 'report resolved';
  assert not (select sharing_suspended from public.users where id = '11111111-1111-1111-1111-111111111111'), 'one hide is not a suspension';
  select id into r from public.reports where grid_id = 'a0000000-0000-4000-8000-000000000002';
  perform public.admin_resolve_report(r, 'hide');
  assert (select sharing_suspended from public.users where id = '11111111-1111-1111-1111-111111111111'), 'two hides in 30 days suspends sharing';
end $$;

-- ----- after moderation -----
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
do $$ begin
  assert (select count(*) from public.atlas_grids()) = 32, 'hidden grids leave the Atlas';
  assert (select count(*) from public.grids where id = 'a0000000-0000-4000-8000-000000000001') = 1, 'adopter keeps the grid';
  assert (select count(*) from public.grid_squares where grid_id = 'a0000000-0000-4000-8000-000000000001') = 20, 'and its squares';
end $$;

set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
do $$ begin
  assert public.save_grid(
    '{"id":"a0000000-0000-4000-8000-000000000003","title":"Secret","color":"#2EB08A","theme":"Mind","size":"tiny","is_public":true,"updated_at":"2026-10-27T10:00:00Z"}',
    '[]') = 'sharing_suspended', 'suspended author cannot share';
  assert not (select is_public from public.grids where id = 'a0000000-0000-4000-8000-000000000003'), 'stays private';
end $$;

reset role;
select 'atlas checks passed';

-- Nothing beyond the grants the app needs, whatever Supabase's defaults say.
set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
do $$ begin
  begin
    truncate public.moments;
    raise exception 'truncate accepted';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.user_grids;
    raise exception 'delete accepted';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.reports set status = 'dismissed';
    raise exception 'report update accepted';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
set role anon;
do $$ begin
  begin
    perform 1 from public.users;
    raise exception 'anon read users';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
select 'grant checks passed';
