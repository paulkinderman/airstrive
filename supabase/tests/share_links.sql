-- Share links: join-my-grid, try-this-grid, see-my-grid, and the previews behind them.
-- Runs after notifications.sql.
\set ON_ERROR_STOP on
reset role;

-- Jo shares; Kit and Lou follow her links; Max is blocked by Jo.
insert into auth.users (id) values
  ('70000000-0000-4000-8000-000000000001'), ('70000000-0000-4000-8000-000000000002'),
  ('70000000-0000-4000-8000-000000000003'), ('70000000-0000-4000-8000-000000000004');
update public.users set username = 'Jo' where id = '70000000-0000-4000-8000-000000000001';
update public.users set username = 'Kit' where id = '70000000-0000-4000-8000-000000000002';
update public.users set username = 'Lou' where id = '70000000-0000-4000-8000-000000000003';
update public.users set username = 'Max' where id = '70000000-0000-4000-8000-000000000004';
insert into public.blocks (blocker_id, blocked_id) values ('70000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000004');

set role authenticated;
set request.jwt.claim.sub = '70000000-0000-4000-8000-000000000001';
insert into public.user_grids (id, grid_id, freebies_left, started_at, updated_at, audience) values
  ('71000000-0000-4000-8000-000000000001', 'grid_fall', 2, now(), now(), 'friends'),
  ('71000000-0000-4000-8000-000000000002', 'grid_running', 2, now(), now(), 'private'),
  ('71000000-0000-4000-8000-000000000003', 'grid_chess', 2, now(), now(), 'private');
insert into public.square_states (id, user_grid_id, idx, state, updated_at) values
  ('72000000-0000-4000-8000-000000000020', '71000000-0000-4000-8000-000000000001', 20, 'done', now()),
  ('72000000-0000-4000-8000-000000000021', '71000000-0000-4000-8000-000000000001', 21, 'done', now()),
  ('72000000-0000-4000-8000-000000000022', '71000000-0000-4000-8000-000000000001', 22, 'revealed', now()),
  ('72000000-0000-4000-8000-000000000000', '71000000-0000-4000-8000-000000000001', 0, 'hidden', now());
insert into public.moments (id, square_state_id, title, body, happened_on, place, created_at, updated_at, audience) values
  ('73000000-0000-4000-8000-000000000020', '72000000-0000-4000-8000-000000000020', 'Cider', 'Jo words', '2026-10-20', 'Orchard', now(), now(), 'friends'),
  ('73000000-0000-4000-8000-000000000021', '72000000-0000-4000-8000-000000000021', 'Secret', 'Just Jo', '2026-10-21', '', now(), now(), 'private');

-- ----- see my grid -----
do $$ begin
  begin
    perform public.peek_link('71000000-0000-4000-8000-000000000002');
    raise exception 'peeked a private grid';
  exception when others then
    if sqlerrm <> 'grid is private' then raise; end if;
  end;
end $$;
create temp table peek as select public.peek_link('71000000-0000-4000-8000-000000000001') as c;
grant select on peek to anon;
do $$ begin
  assert public.peek_link('71000000-0000-4000-8000-000000000001') = (select c from peek), 'one live peek link per grid';
end $$;

set request.jwt.claim.sub = '70000000-0000-4000-8000-000000000002';
do $$ begin
  begin
    perform public.peek_link('71000000-0000-4000-8000-000000000001');
    raise exception 'peek link for someone else''s grid';
  exception when others then
    if sqlerrm <> 'grid not found' then raise; end if;
  end;
end $$;

-- Signed out, the website sees squares and the titles friends could see, nothing more.
reset role;
set role anon;
set request.jwt.claim.sub = '';
do $$
declare p jsonb := public.invite_preview('p', (select c from peek));
begin
  assert p->>'owner' = 'Jo', 'peek names the owner';
  assert p->'grid'->>'id' = 'grid_fall', 'and the grid';
  assert p->>'owner_id' is null and p->>'user_grid_id' is null, 'no ids signed out';
  assert (select s->>'title' from jsonb_array_elements(p->'squares') s where (s->>'idx')::int = 20) = 'Cider', 'friends moment title';
  assert (select s->>'state' from jsonb_array_elements(p->'squares') s where (s->>'idx')::int = 21) = 'revealed', 'private moment looks undone';
  assert (select s->>'title' from jsonb_array_elements(p->'squares') s where (s->>'idx')::int = 21) is null, 'and has no title';
  assert (select s->>'prompt' from jsonb_array_elements(p->'squares') s where (s->>'idx')::int = 0) = '', 'hidden squares stay hidden';
  assert p::text not like '%Jo words%' and p::text not like '%Orchard%', 'no words or places';
  begin
    perform public.peek_link('71000000-0000-4000-8000-000000000001');
    raise exception 'anon made a peek link';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.accept_peek_link((select c from peek));
    raise exception 'anon accepted a peek link';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.peek_links;
    assert not found, 'anon reads no peek links';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
set role authenticated;

set request.jwt.claim.sub = '70000000-0000-4000-8000-000000000004';
do $$ begin
  assert public.invite_preview('p', (select c from peek)) is null, 'blocked: no peek';
  assert public.accept_peek_link((select c from peek)) = 'invalid', 'and no friendship';
end $$;

set request.jwt.claim.sub = '70000000-0000-4000-8000-000000000002';
do $$ begin
  assert public.invite_preview('p', (select c from peek))->>'relation' = 'none', 'Kit sees where she stands';
  assert public.accept_peek_link((select c from peek)) = 'friends', 'peek link makes friends';
  assert (select count(*) from public.my_friends() where username = 'Jo') = 1, 'Kit and Jo';
end $$;

-- Making the grid Private turns its link off; stopping it does too.
set request.jwt.claim.sub = '70000000-0000-4000-8000-000000000001';
update public.user_grids set audience = 'private', updated_at = now() + interval '1 second' where id = '71000000-0000-4000-8000-000000000001';
do $$ begin
  assert public.invite_preview('p', (select c from peek)) is null, 'private grid: link off';
end $$;
update public.user_grids set audience = 'public', updated_at = now() + interval '2 seconds' where id = '71000000-0000-4000-8000-000000000001';
do $$ begin
  assert public.invite_preview('p', (select c from peek)) is not null, 'back on when shared again';
end $$;
select public.stop_peek_link('71000000-0000-4000-8000-000000000001');
do $$ begin
  assert public.invite_preview('p', (select c from peek)) is null, 'stopped';
  assert public.peek_link('71000000-0000-4000-8000-000000000001') <> (select c from peek), 'a new link after stopping';
end $$;

-- ----- join my grid -----
select public.make_group('71000000-0000-4000-8000-000000000003');
create temp table glink as select public.group_link('71000000-0000-4000-8000-000000000003') as c;
grant select on glink to anon;
do $$ begin
  assert public.group_link('71000000-0000-4000-8000-000000000003') = (select c from glink), 'one live link per group';
end $$;

set request.jwt.claim.sub = '70000000-0000-4000-8000-000000000003';
do $$ begin
  begin
    perform public.group_link('71000000-0000-4000-8000-000000000003');
    raise exception 'outsider made a group link';
  exception when others then
    if sqlerrm <> 'not in this group' then raise; end if;
  end;
end $$;

reset role;
set role anon;
set request.jwt.claim.sub = '';
do $$
declare p jsonb := public.invite_preview('g', (select c from glink));
begin
  assert p->>'from' = 'Jo', 'group preview names who shared it';
  assert p->'grid'->>'id' = 'grid_chess', 'and the grid';
  assert p->'members' = '["Jo"]'::jsonb, 'and who is in it';
  assert (p->>'member')::boolean = false, 'not a member signed out';
end $$;
reset role;
set role authenticated;

-- Lou isn't Jo's friend, and joins by link: in the group, and friends with Jo.
set request.jwt.claim.sub = '70000000-0000-4000-8000-000000000003';
do $$ begin
  assert public.join_group_link(lower((select c from glink))) = '71000000-0000-4000-8000-000000000003', 'joined, any case';
  assert public.is_group_member('71000000-0000-4000-8000-000000000003'), 'Lou is in';
  assert (select count(*) from public.my_friends() where username = 'Jo') = 1, 'and friends with Jo';
  assert (public.invite_preview('g', (select c from glink))->>'member')::boolean, 'preview says so';
  assert public.join_group_link((select c from glink)) = '71000000-0000-4000-8000-000000000003', 'joining twice is harmless';
  assert exists (select 1 from public.user_grids where id = '71000000-0000-4000-8000-000000000003'), 'the grid syncs to Lou';
end $$;
-- Lou can share the same link.
do $$ begin
  assert public.group_link('71000000-0000-4000-8000-000000000003') = (select c from glink), 'members share one link';
end $$;

reset role;
do $$ begin
  assert exists (select 1 from public.notifications where user_id = '70000000-0000-4000-8000-000000000001'
                 and kind = 'group_joined' and actor_id = '70000000-0000-4000-8000-000000000003'), 'Jo hears Lou joined';
end $$;
set role authenticated;

set request.jwt.claim.sub = '70000000-0000-4000-8000-000000000004';
do $$ begin
  assert public.invite_preview('g', (select c from glink)) is null, 'blocked: no group preview';
  assert public.join_group_link((select c from glink)) is null, 'and no joining';
end $$;

set request.jwt.claim.sub = '70000000-0000-4000-8000-000000000001';
select public.stop_group_link('71000000-0000-4000-8000-000000000003');
set request.jwt.claim.sub = '70000000-0000-4000-8000-000000000002';
do $$ begin
  assert public.join_group_link((select c from glink)) is null, 'a stopped link joins nobody';
  assert not public.is_group_member('71000000-0000-4000-8000-000000000003'), 'Kit stays out';
end $$;

-- ----- try this grid, and be my friend -----
set request.jwt.claim.sub = '70000000-0000-4000-8000-000000000001';
create temp table fcode as select public.my_friend_code() as c;
grant select on fcode to anon;
reset role;
set role anon;
set request.jwt.claim.sub = '';
do $$
declare p jsonb := public.invite_preview('a', 'grid_fall', (select c from fcode));
begin
  assert p->'grid'->>'title' is not null, 'Atlas grid preview';
  assert p->>'from' = 'Jo', 'with who sent it';
  assert public.invite_preview('a', 'grid_fall')->>'from' is null, 'or nobody';
  assert public.invite_preview('a', 'grid_fall', 'NOTACODE2345')->>'from' is null, 'or nobody, for a bad code';
  assert public.invite_preview('f', (select c from fcode))->>'username' = 'Jo', 'friend link preview';
  assert public.invite_preview('f', (select c from fcode))->>'user_id' is null, 'no id signed out';
  assert public.invite_preview('f', 'NOTACODE2345') is null, 'bad friend code';
  assert public.invite_preview('x', 'anything') is null, 'unknown kind';
end $$;
reset role;
-- A grid that isn't in the Atlas doesn't preview.
insert into public.grids (id, title, color, theme, size, cols, rows, author_id, is_public, made_by)
values ('74000000-0000-4000-8000-000000000001', 'Jo private', '#336699', 'Family', 'tiny', 4, 5,
        '70000000-0000-4000-8000-000000000001', false, 'Jo');
set role authenticated;
set request.jwt.claim.sub = '70000000-0000-4000-8000-000000000002';
do $$ begin
  assert public.invite_preview('a', '74000000-0000-4000-8000-000000000001') is null, 'private template: nothing';
  assert public.invite_preview('a', 'grid_fall', (select c from fcode))->>'relation' = 'friends', 'Kit is already friends with Jo';
  assert public.invite_preview('f', (select c from fcode))->>'relation' = 'friends', 'on the friend link too';
end $$;

reset role;
select 'share link checks passed';
