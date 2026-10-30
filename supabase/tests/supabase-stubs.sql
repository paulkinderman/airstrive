-- Minimal stand-ins for the parts of Supabase the migrations touch, so they can be
-- tested on plain Postgres. Not deployed.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
-- Supabase installs extensions such as pgcrypto in their own schema, not public, so a
-- function needs `extensions` on its search_path to call them.
create schema extensions;
create extension pgcrypto schema extensions;
create schema auth;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as
  $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
grant usage on schema public, auth, storage to authenticated;
grant select, insert, update, delete on storage.objects to authenticated;
grant execute on function auth.uid() to authenticated;
-- Supabase grants everything on new public tables to anon and authenticated by default.
-- Mirror that so the tests catch a table that relies on its column grants alone.
alter default privileges in schema public grant all on tables to anon, authenticated;
