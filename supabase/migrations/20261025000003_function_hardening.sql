-- Security advisor fixes: pin search_path on the trigger functions and keep
-- functions callable only by the roles that need them.

alter function public.lww_guard() set search_path = public;
alter function public.touch_server_updated_at() set search_path = public;

-- Only the auth.users trigger calls this.
revoke execute on function public.handle_new_auth_user() from public, anon, authenticated;

-- Signed-in people only.
revoke execute on function public.claim_username(text) from public, anon;
grant execute on function public.claim_username(text) to authenticated;
