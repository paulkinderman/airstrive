-- Supabase gives anon and authenticated every privilege on new public tables by default,
-- which made the column grants in earlier migrations meaningless: a signed-in person
-- could update their own username or is_admin directly, or TRUNCATE a table (which
-- skips row-level security). Start from nothing and grant only what the app uses.

revoke all on all tables in schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;

grant select on public.users to authenticated;
grant update (bio, moments_public, updated_at, interests, onboarded_at) on public.users to authenticated;

grant select on public.grids, public.grid_squares to authenticated;

grant select, insert, update on public.user_grids, public.square_states, public.moments, public.photos to authenticated;

grant select on public.reports to authenticated;
grant insert (grid_id, reason, note) on public.reports to authenticated;
