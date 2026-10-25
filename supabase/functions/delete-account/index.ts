// Deletes the signed-in person's account in one request: their photo files, every row
// they own (via ON DELETE CASCADE from public.users), and the auth user. Grids they
// shared are kept for the people who adopted them and credited to "a former member".
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405, headers: cors });

  const url = Deno.env.get('SUPABASE_URL')!;
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer /, '');
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

  const { data: { user }, error: authError } = await admin.auth.getUser(jwt);
  if (authError || !user) return new Response('not signed in', { status: 401, headers: cors });

  // Photos: everything under photos/{user_id}/, a page at a time.
  for (;;) {
    const { data: files, error } = await admin.storage.from('photos').list(user.id, { limit: 1000 });
    if (error) return new Response(`storage: ${error.message}`, { status: 500, headers: cors });
    if (!files || files.length === 0) break;
    const { error: rmError } = await admin.storage.from('photos').remove(files.map((f) => `${user.id}/${f.name}`));
    if (rmError) return new Response(`storage: ${rmError.message}`, { status: 500, headers: cors });
    if (files.length < 1000) break;
  }

  const { error: gridError } = await admin.from('grids')
    .update({ made_by: 'a former member', author_id: null })
    .eq('author_id', user.id);
  if (gridError) return new Response(`grids: ${gridError.message}`, { status: 500, headers: cors });

  // Removing the auth user cascades to public.users and everything that references it.
  const { error: delError } = await admin.auth.admin.deleteUser(user.id);
  if (delError) return new Response(`auth: ${delError.message}`, { status: 500, headers: cors });

  return new Response(JSON.stringify({ deleted: true }), { headers: { ...cors, 'Content-Type': 'application/json' } });
});
