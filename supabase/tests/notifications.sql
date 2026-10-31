-- Notifications and push. Runs after groups.sql.
\set ON_ERROR_STOP on
reset role;

-- Kai, Lu and Mo, strangers to start with.
insert into auth.users (id) values
  ('90000000-0000-4000-8000-000000000001'), ('90000000-0000-4000-8000-000000000002'),
  ('90000000-0000-4000-8000-000000000003');
update public.users set username = 'Kai' where id = '90000000-0000-4000-8000-000000000001';
update public.users set username = 'Lu' where id = '90000000-0000-4000-8000-000000000002';
update public.users set username = 'Mo' where id = '90000000-0000-4000-8000-000000000003';

set role authenticated;

-- ----- friend requests -----
set request.jwt.claim.sub = '90000000-0000-4000-8000-000000000001';
do $$ begin
  assert public.request_friend('90000000-0000-4000-8000-000000000002') = 'requested', 'Kai asks Lu';
  assert (select count(*) from public.my_notifications()) = 0, 'asking tells the asker nothing';
end $$;
set request.jwt.claim.sub = '90000000-0000-4000-8000-000000000003';
do $$ begin
  perform public.request_friend('90000000-0000-4000-8000-000000000002');
  perform public.cancel_request('90000000-0000-4000-8000-000000000002');
end $$;

set request.jwt.claim.sub = '90000000-0000-4000-8000-000000000002';
do $$
declare n record;
begin
  assert (select count(*) from public.my_notifications()) = 1, 'a withdrawn request drops out';
  select * into n from public.my_notifications();
  assert n.kind = 'friend_request' and n.actor_username = 'Kai' and n.state = 'pending' and n.read_at is null, 'Kai''s request, waiting';
  assert public.unread_notifications() = 1, 'one unread';
  begin
    insert into public.notifications (user_id, kind, actor_id) values (auth.uid(), 'friend_request', auth.uid());
    raise exception 'phone wrote a notification';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.push_payload(n.id);
    raise exception 'phone read a push payload';
  exception when insufficient_privilege then null;
  end;
  perform public.respond_request('90000000-0000-4000-8000-000000000001', true);
  assert (select state from public.my_notifications()) = 'done', 'accepted shows as friends';
  perform public.mark_notifications_read();
  assert public.unread_notifications() = 0, 'all read';
end $$;

set request.jwt.claim.sub = '90000000-0000-4000-8000-000000000001';
do $$ begin
  assert (select kind from public.my_notifications()) = 'friend_accepted', 'Kai hears Lu said yes';
  assert (select actor_username from public.my_notifications()) = 'Lu', 'from Lu';
  assert (select count(*) from public.notifications) = 1, 'Kai reads only his own';
end $$;

-- ----- group grids -----
reset role;
insert into public.user_grids (id, user_id, grid_id, freebies_left, started_at, updated_at)
values ('91000000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-000000000001', 'grid_fall', 2, now(), now());
insert into public.square_states (id, user_id, user_grid_id, idx, state, updated_at) values
  ('92000000-0000-4000-8000-000000000020', '90000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001', 20, 'revealed', now());
set role authenticated;
set request.jwt.claim.sub = '90000000-0000-4000-8000-000000000001';
do $$ begin
  perform public.make_group('91000000-0000-4000-8000-000000000001');
  perform public.invite_to_group('91000000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-000000000002');
end $$;

set request.jwt.claim.sub = '90000000-0000-4000-8000-000000000002';
do $$ begin
  assert (select state from public.my_notifications() where kind = 'group_invite') = 'pending', 'Lu is invited';
  assert (select grid_title from public.my_notifications() where kind = 'group_invite') is not null, 'with the grid''s name';
  perform public.respond_group_invite('91000000-0000-4000-8000-000000000001', true);
  assert (select state from public.my_notifications() where kind = 'group_invite') = 'done', 'joined';
  -- Lu does a square, then writes about it: one notification, not two.
  insert into public.moments (id, square_state_id, title, happened_on, created_at, updated_at)
  values ('93000000-0000-4000-8000-000000000020', '92000000-0000-4000-8000-000000000020', 'Hayride', '2026-10-30', now(), now());
  insert into public.moment_entries (id, moment_id, body, audience, created_at, updated_at)
  values ('94000000-0000-4000-8000-000000000020', '93000000-0000-4000-8000-000000000020', 'So bumpy', 'group', now(), now());
end $$;

set request.jwt.claim.sub = '90000000-0000-4000-8000-000000000001';
do $$
declare n record;
begin
  assert (select count(*) from public.my_notifications() where kind = 'group_joined') = 1, 'Kai hears Lu joined';
  assert (select count(*) from public.my_notifications() where kind = 'group_moment') = 1, 'and about the moment, once';
  select * into n from public.my_notifications() where kind = 'group_moment';
  assert n.square_state_id = '92000000-0000-4000-8000-000000000020', 'pointing at the square';
  assert n.group_id = '91000000-0000-4000-8000-000000000001' and n.moment_title = 'Hayride', 'in the grid';
  perform public.register_push_token('ExponentPushToken[kai-phone-1]', 'ios');
end $$;

-- ----- what send-push gets -----
reset role;
do $$
declare
  n uuid := (select id from public.notifications where user_id = '90000000-0000-4000-8000-000000000001' and kind = 'group_moment');
  p jsonb;
begin
  p := public.push_payload(n);
  assert p->'tokens' = '["ExponentPushToken[kai-phone-1]"]'::jsonb, 'Kai''s phone';
  assert p->>'body' = 'Lu added “Hayride”', p->>'body';
  assert p->'data'->>'squareStateId' = '92000000-0000-4000-8000-000000000020', 'tap opens the square';
  assert (p->>'badge')::int = 3, 'badge counts the unread';
  assert public.push_payload((select id from public.notifications where user_id = '90000000-0000-4000-8000-000000000002' limit 1)) is null, 'no phone, nothing to send';
end $$;

set role authenticated;
set request.jwt.claim.sub = '90000000-0000-4000-8000-000000000001';
do $$ begin
  assert public.set_push_kind('group_moment', false) = array['group_moment'], 'turned off';
  assert public.my_push_off() = array['group_moment'], 'remembered';
end $$;
reset role;
do $$ begin
  assert public.push_payload((select id from public.notifications where user_id = '90000000-0000-4000-8000-000000000001' and kind = 'group_moment')) is null, 'off means no push';
  assert public.push_payload((select id from public.notifications where user_id = '90000000-0000-4000-8000-000000000001' and kind = 'group_joined')) is not null, 'other kinds still push';
end $$;
set role authenticated;
do $$ begin
  assert public.set_push_kind('group_moment', true) = '{}', 'back on';
  -- The phone signs in as Lu: the token moves to Lu.
end $$;
set request.jwt.claim.sub = '90000000-0000-4000-8000-000000000002';
do $$ begin
  perform public.register_push_token('ExponentPushToken[kai-phone-1]', 'ios');
end $$;
reset role;
do $$ begin
  assert (select user_id from public.push_tokens) = '90000000-0000-4000-8000-000000000002', 'token follows the sign-in';
end $$;

-- ----- blocks hide everything -----
set role authenticated;
set request.jwt.claim.sub = '90000000-0000-4000-8000-000000000002';
do $$ begin
  perform public.unregister_push_token('ExponentPushToken[kai-phone-1]');
  perform public.block_user('90000000-0000-4000-8000-000000000001');
  assert (select count(*) from public.my_notifications() where actor_id = '90000000-0000-4000-8000-000000000001') = 0, 'nothing from Kai after a block';
end $$;
reset role;
do $$ begin
  assert (select count(*) from public.push_tokens) = 0, 'signed out phone is forgotten';
end $$;
select 'notification checks passed';
