-- Profile pictures. One picture per person, kept in a private bucket at
-- avatars/{user_id}/{random}.jpg and named on users.avatar_path.
--
-- Like everything else, a picture isn't shown to just anyone: you see your own, your
-- friends' and the people in a group grid with you, never someone you've blocked or
-- who blocked you. Strangers, search results and friend requests show the initial.
-- Deleting the account removes the file (supabase/functions/delete-account) and the
-- row goes with public.users.

alter table public.users
  add column avatar_path text,
  add constraint avatar_path_own check (avatar_path is null or avatar_path like id::text || '/%');

-- ---------- who can see it ----------

create or replace function public.can_see_avatar(owner uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (
    owner = auth.uid()
    or is_admin()
    or (not is_blocked(auth.uid(), owner) and (
      are_friends(auth.uid(), owner)
      or exists (
        select 1 from group_members a join group_members b on b.group_id = a.group_id
        where a.user_id = auth.uid() and b.user_id = owner
      )
    ))
  )
$$;

/** The current pictures of the people asked about that the viewer may see. Everyone else is left out. */
create or replace function public.avatars(ids uuid[]) returns table (id uuid, avatar_path text)
language sql stable security definer set search_path = public as $$
  select u.id, u.avatar_path from users u
  where u.id = any(ids[1:500]) and u.avatar_path is not null and can_see_avatar(u.id)
$$;

/** Storage: a file is readable while it's someone's current picture and they can see it. */
create or replace function public.can_read_avatar(path text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from users u where u.avatar_path = path and can_see_avatar(u.id))
$$;

-- ---------- setting it ----------

/**
 * Points the person's profile at a file they've uploaded to their own folder, or at
 * nothing. Returns the path it replaced, so the app can remove that file.
 */
create or replace function public.set_avatar(path text) returns text
language plpgsql security definer set search_path = public as $$
declare
  old text;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if path is not null then
    if path !~ ('^' || auth.uid()::text || '/[A-Za-z0-9_-]{1,64}\.(jpg|webp|png)$') then raise exception 'invalid picture'; end if;
    if not exists (select 1 from storage.objects o where o.bucket_id = 'avatars' and o.name = path) then
      raise exception 'picture not uploaded';
    end if;
  end if;
  select avatar_path into old from users where id = auth.uid() for update;
  update users set avatar_path = path, updated_at = now() where id = auth.uid();
  return case when old is distinct from path then old end;
end $$;

/** Moderation: takes a picture down. The file is removed by the admin site. */
create or replace function public.admin_clear_avatar(target uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  old text;
begin
  perform require_admin();
  select avatar_path into old from users where id = target for update;
  if not found then raise exception 'user not found'; end if;
  update users set avatar_path = null where id = target;
  return old;
end $$;

-- ---------- storage ----------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 1048576, array['image/jpeg', 'image/webp', 'image/png'])
on conflict (id) do nothing;

create policy avatars_bucket_own_read on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy avatars_bucket_own_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy avatars_bucket_own_update on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy avatars_bucket_own_delete on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy avatars_bucket_shared_read on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and public.can_read_avatar(name));
create policy avatars_bucket_admin on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and public.is_admin());

-- ---------- grants ----------

do $$
declare f text;
begin
  foreach f in array array[
    'public.can_see_avatar(uuid)', 'public.avatars(uuid[])', 'public.can_read_avatar(text)',
    'public.set_avatar(text)', 'public.admin_clear_avatar(uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
