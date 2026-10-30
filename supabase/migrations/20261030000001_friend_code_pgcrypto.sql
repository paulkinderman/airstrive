-- my_friend_code() calls pgcrypto's gen_random_bytes, but on Supabase pgcrypto lives in the
-- extensions schema, which wasn't on the function's search_path, so "My QR code" failed with
-- "function gen_random_bytes(integer) does not exist". No other function calls an extension.
alter function public.my_friend_code() set search_path = public, extensions;
