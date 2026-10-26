// Deletes the signed-in person's account in one request: their photo files, every row
// they own (via ON DELETE CASCADE from public.users), and the auth user. Grids they
// shared are kept for the people who adopted them and credited to "a former member".
// What they added to group grids stays with the group (release_group_rows in the
// group grids migration), so those photo files move to groups/{group_id}/ first.
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

  // Group photos the others can see move out of the person's folder. In a group they're
  // the last one in, the grid goes with them, so its folder is cleared instead.
  const { data: memberships, error: memberError } = await admin.from('group_members').select('group_id').eq('user_id', user.id);
  if (memberError) return new Response(`groups: ${memberError.message}`, { status: 500, headers: cors });
  const alone = new Set<string>();
  for (const m of memberships ?? []) {
    const { count } = await admin.from('group_members').select('user_id', { count: 'exact', head: true }).eq('group_id', m.group_id);
    if ((count ?? 0) <= 1) alone.add(m.group_id);
  }
  for (const groupId of alone) {
    const { data: files } = await admin.storage.from('photos').list(`groups/${groupId}`, { limit: 1000 });
    if (files?.length) await admin.storage.from('photos').remove(files.map((f) => `groups/${groupId}/${f.name}`));
  }
  const { data: kept, error: keptError } = await admin.from('photos')
    .select('id, group_id, storage_path')
    .eq('user_id', user.id).eq('audience', 'group').not('group_id', 'is', null).is('deleted_at', null)
    .like('storage_path', `${user.id}/%`);
  if (keptError) return new Response(`photos: ${keptError.message}`, { status: 500, headers: cors });
  for (const p of kept ?? []) {
    if (alone.has(p.group_id)) continue;
    const to = `groups/${p.group_id}/${p.storage_path.slice(user.id.length + 1)}`;
    const { error: moveError } = await admin.storage.from('photos').move(p.storage_path, to);
    if (moveError) return new Response(`storage: ${moveError.message}`, { status: 500, headers: cors });
    const { error: rowError } = await admin.from('photos')
      .update({ storage_path: to, updated_at: new Date().toISOString() }).eq('id', p.id);
    if (rowError) return new Response(`photos: ${rowError.message}`, { status: 500, headers: cors });
  }

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
