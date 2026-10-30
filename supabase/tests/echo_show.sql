-- The Echo Show's shelf. Runs after friend_moments.sql and reuses Eve, Fin and Gus.
\set ON_ERROR_STOP on
reset role;
set role authenticated;
set request.jwt.claim.sub = 'e5000000-0000-4000-8000-000000000001';
insert into public.square_states (id, user_grid_id, idx, state, updated_at) values
  ('e5200000-0000-4000-8000-000000000011', 'e5100000-0000-4000-8000-000000000001', 3, 'revealed', now() - interval '1 hour'),
  ('e5200000-0000-4000-8000-000000000012', 'e5100000-0000-4000-8000-000000000001', 4, 'revealed', now()),
  ('e5200000-0000-4000-8000-000000000013', 'e5100000-0000-4000-8000-000000000001', 5, 'hidden', now());

-- Eve sees both her grids, with the board, Next up and the moment behind each done square.
do $$
declare shelf jsonb := public.echo_shelf(); fall jsonb;
begin
  assert jsonb_array_length(shelf) = 2, 'both of Eve''s grids';
  select g into fall from jsonb_array_elements(shelf) g where g->>'user_grid_id' = 'e5100000-0000-4000-8000-000000000001';
  assert (fall->>'done')::int = 2 and (fall->>'total')::int = 5, 'counts';
  assert fall->>'next_up' = (select prompt from public.grid_squares where grid_id = 'grid_fall' and idx = 4), 'the most recently revealed square';
  assert (select s->>'prompt' from jsonb_array_elements(fall->'squares') s where (s->>'idx')::int = 5) = '', 'hidden squares keep their prompt';
  assert (select s->>'title' from jsonb_array_elements(fall->'squares') s where (s->>'idx')::int = 20) = 'Older', 'the moment';
  assert (select s->>'cover_path' from jsonb_array_elements(fall->'squares') s where (s->>'idx')::int = 20)
    = 'e5000000-0000-4000-8000-000000000001/b.webp', 'and its cover photo';
end $$;

-- Fin is Eve's friend but the shelf is only ever your own.
set request.jwt.claim.sub = 'e5000000-0000-4000-8000-000000000002';
do $$ begin assert public.echo_shelf() = '[]'::jsonb, 'nothing of Eve''s'; end $$;

reset role;
set role anon;
do $$ begin
  begin
    perform public.echo_shelf();
    raise exception 'anon called echo_shelf';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
select 'echo show checks passed';
