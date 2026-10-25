-- AirStrive v1: accounts, shared grid templates, and everything a person owns.
-- Every per-person table carries user_id so row-level security and pulls stay simple.
-- Clients send their own updated_at; server_updated_at is set here and is what pulls page on.

create extension if not exists pgcrypto;

-- ---------- users ----------

create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  username text,
  bio text not null default '',
  moments_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint username_nfc check (username is null or username = normalize(username, NFC)),
  constraint username_trimmed check (username is null or username = btrim(username)),
  constraint username_length check (username is null or char_length(username) between 1 and 60)
);

create unique index users_username_key on public.users (lower(username)) where username is not null;

create or replace function public.handle_new_auth_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.users (id) values (new.id) on conflict do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- Usernames are validated in full in the app (src/lib/username.ts); the server re-checks
-- the cheap rules and owns uniqueness.
create or replace function public.claim_username(name text) returns text
language plpgsql security definer set search_path = public as $$
declare
  clean text := normalize(btrim(name), NFC);
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if clean = '' or char_length(clean) > 60 then raise exception 'invalid username'; end if;
  if clean ~ '[[:cntrl:]]' or clean ~ '[​‌⁠﻿]' then raise exception 'invalid username'; end if;
  if lower(clean) in ('airstrive', 'admin', 'support', 'moderator', 'help', 'official') then
    raise exception 'username taken';
  end if;
  if exists (select 1 from users where lower(username) = lower(clean) and id <> auth.uid()) then
    raise exception 'username taken';
  end if;
  update users set username = clean, updated_at = now() where id = auth.uid();
  return clean;
end $$;

-- ---------- grids (shared templates) ----------

create table public.grids (
  id text primary key,
  title text not null,
  color text not null,
  theme text not null,
  size text not null check (size in ('tiny', 'small', 'medium', 'full')),
  cols int not null,
  rows int not null,
  description text not null default '',
  made_by text not null default 'AirStrive',
  author_id uuid references public.users(id) on delete set null,
  is_official boolean not null default false,
  is_public boolean not null default true,
  is_hidden boolean not null default false,
  prerequisite_grid_id text references public.grids(id),
  updated_at timestamptz not null default now(),
  server_updated_at timestamptz not null default clock_timestamp()
);

create table public.grid_squares (
  grid_id text not null references public.grids(id) on delete cascade,
  idx int not null,
  prompt text not null,
  hint text not null default '',
  cluster text not null default '',
  primary key (grid_id, idx)
);

-- ---------- per person ----------

create table public.user_grids (
  id uuid primary key,
  user_id uuid not null default auth.uid() references public.users(id) on delete cascade,
  grid_id text not null references public.grids(id),
  freebies_left int not null,
  started_at timestamptz not null,
  completed_at timestamptz,
  show_moments boolean not null default false,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  server_updated_at timestamptz not null default clock_timestamp()
);
create index user_grids_pull on public.user_grids (user_id, server_updated_at);

create table public.square_states (
  id uuid primary key,
  user_id uuid not null default auth.uid() references public.users(id) on delete cascade,
  user_grid_id uuid not null references public.user_grids(id) on delete cascade,
  idx int not null,
  state text not null check (state in ('hidden', 'revealed', 'done')),
  done_at timestamptz,
  via_freebie boolean not null default false,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  server_updated_at timestamptz not null default clock_timestamp(),
  unique (user_grid_id, idx)
);
create index square_states_pull on public.square_states (user_id, server_updated_at);

create table public.moments (
  id uuid primary key,
  user_id uuid not null default auth.uid() references public.users(id) on delete cascade,
  square_state_id uuid not null references public.square_states(id) on delete cascade,
  title text not null,
  body text not null default '',
  happened_on date not null,
  place text not null default '',
  weather text not null default '',
  with_people text not null default '',
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  server_updated_at timestamptz not null default clock_timestamp()
);
create index moments_pull on public.moments (user_id, server_updated_at);
-- Two phones can log the same square while offline. The server keeps both and the app
-- settles on the newer one (and deletes the other), so this is not a unique index.
create index moments_square on public.moments (square_state_id) where deleted_at is null;

create table public.photos (
  id uuid primary key,
  user_id uuid not null default auth.uid() references public.users(id) on delete cascade,
  moment_id uuid not null references public.moments(id) on delete cascade,
  position int not null,
  storage_path text,
  is_cover boolean not null default false,
  width int not null default 0,
  height int not null default 0,
  bytes int not null default 0,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  server_updated_at timestamptz not null default clock_timestamp()
);
create index photos_pull on public.photos (user_id, server_updated_at);

-- ---------- last write wins ----------
-- Applies to every update, including the update half of an upsert:
--  * a deleted row stays deleted (deleting always wins over editing);
--  * an older client write never overwrites a newer one;
--  * the owner never changes.

create or replace function public.lww_guard() returns trigger
language plpgsql as $$
begin
  if old.deleted_at is not null then
    return old;
  end if;
  if new.updated_at < old.updated_at and new.deleted_at is null then
    return old;
  end if;
  new.user_id := old.user_id;
  new.server_updated_at := clock_timestamp();
  return new;
end $$;

create or replace function public.touch_server_updated_at() returns trigger
language plpgsql as $$
begin
  new.server_updated_at := clock_timestamp();
  return new;
end $$;

create trigger user_grids_lww before update on public.user_grids for each row execute function public.lww_guard();
create trigger square_states_lww before update on public.square_states for each row execute function public.lww_guard();
create trigger moments_lww before update on public.moments for each row execute function public.lww_guard();
create trigger photos_lww before update on public.photos for each row execute function public.lww_guard();
create trigger grids_touch before update on public.grids for each row execute function public.touch_server_updated_at();

-- ---------- row-level security ----------

alter table public.users enable row level security;
alter table public.grids enable row level security;
alter table public.grid_squares enable row level security;
alter table public.user_grids enable row level security;
alter table public.square_states enable row level security;
alter table public.moments enable row level security;
alter table public.photos enable row level security;

create policy users_self_read on public.users for select to authenticated using (id = auth.uid());
-- Username changes go through claim_username(); the rest of the row is the person's own.
create policy users_self_update on public.users for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy grids_read on public.grids for select to authenticated using (
  (is_public and not is_hidden)
  or author_id = auth.uid()
  or exists (select 1 from public.user_grids ug where ug.grid_id = grids.id and ug.user_id = auth.uid())
);
create policy grid_squares_read on public.grid_squares for select to authenticated using (
  exists (select 1 from public.grids g where g.id = grid_squares.grid_id)
);

create policy user_grids_own on public.user_grids for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy square_states_own on public.square_states for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.user_grids ug where ug.id = user_grid_id and ug.user_id = auth.uid())
  );

create policy moments_own on public.moments for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.square_states s where s.id = square_state_id and s.user_id = auth.uid())
  );

create policy photos_own on public.photos for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.moments m where m.id = moment_id and m.user_id = auth.uid())
    and (storage_path is null or storage_path like auth.uid()::text || '/%')
  );

grant select on public.users to authenticated;
grant update (bio, moments_public, updated_at) on public.users to authenticated;
grant select on public.grids, public.grid_squares to authenticated;
grant select, insert, update on public.user_grids, public.square_states, public.moments, public.photos to authenticated;
grant execute on function public.claim_username(text) to authenticated;

-- ---------- photo storage ----------
-- Private bucket; objects live at photos/{user_id}/{photo_id}.webp.

insert into storage.buckets (id, name, public)
values ('photos', 'photos', false)
on conflict (id) do nothing;

create policy photos_bucket_own_read on storage.objects for select to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy photos_bucket_own_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy photos_bucket_own_update on storage.objects for update to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy photos_bucket_own_delete on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
