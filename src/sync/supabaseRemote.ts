import type { SupabaseClient } from '@supabase/supabase-js';
import { downloadTo, readBytes } from '@/lib/files';
import type { GroupInfo, Remote, SaveGridResult, Unshare } from './engine';

const BUCKET = 'photos';

export function supabaseRemote(client: SupabaseClient): Remote {
  return {
    async upsert(table, rows) {
      const { error } = await client.from(table).upsert(rows, { onConflict: 'id' });
      if (error) throw new Error(`${table}: ${error.message}`);
    },
    async pull(table, after, limit) {
      let q = client.from(table).select('*').order('server_updated_at', { ascending: true }).limit(limit);
      if (after) q = q.gt('server_updated_at', after);
      const { data, error } = await q;
      if (error) throw new Error(`${table}: ${error.message}`);
      return data ?? [];
    },
    async fetchGrids(ids) {
      const { data: grids, error } = await client.from('grids').select('*').in('id', ids);
      if (error) throw new Error(`grids: ${error.message}`);
      const { data: squares, error: e2 } = await client.from('grid_squares').select('*').in('grid_id', ids);
      if (e2) throw new Error(`grid_squares: ${e2.message}`);
      return (grids ?? []).map((grid) => ({ grid, squares: (squares ?? []).filter((s) => s.grid_id === grid.id) }));
    },
    async uploadPhoto(storagePath, localPath, contentType) {
      const bytes = await readBytes(localPath);
      const { error } = await client.storage.from(BUCKET).upload(storagePath, bytes, { contentType, upsert: true });
      if (error) throw new Error(`upload: ${error.message}`);
    },
    async downloadPhoto(storagePath, localPath) {
      const { data, error } = await client.storage.from(BUCKET).createSignedUrl(storagePath, 300);
      if (error || !data) throw new Error(`download: ${error?.message}`);
      await downloadTo(data.signedUrl, localPath);
    },
    async removePhotos(paths) {
      await client.storage.from(BUCKET).remove(paths);
    },
    async saveGrid(grid, squares) {
      const { data, error } = await client.rpc('save_grid', { g: grid, squares });
      if (error) throw new Error(`grids: ${error.message}`);
      return data as SaveGridResult;
    },
    async myGroups() {
      const { data, error } = await client.rpc('my_groups');
      if (error) throw new Error(`groups: ${error.message}`);
      return (data ?? []) as GroupInfo[];
    },
    async pullGroup(table, groupId, after, limit) {
      let q = client.from(table).select('*').eq('group_id', groupId).order('server_updated_at', { ascending: true }).limit(limit);
      if (after) q = q.gt('server_updated_at', after);
      const { data, error } = await q;
      if (error) throw new Error(`${table}: ${error.message}`);
      return data ?? [];
    },
    async pullUnshares(after, limit) {
      let q = client.from('group_unshares').select('group_id, row_table, row_id, server_updated_at')
        .order('server_updated_at', { ascending: true }).limit(limit);
      if (after) q = q.gt('server_updated_at', after);
      const { data, error } = await q;
      if (error) throw new Error(`group_unshares: ${error.message}`);
      return (data ?? []) as Unshare[];
    },
    async saveProfile(profile) {
      const { data: auth } = await client.auth.getUser();
      if (!auth.user) throw new Error('not signed in');
      const { error } = await client.from('users').update(profile).eq('id', auth.user.id);
      if (error) throw new Error(`users: ${error.message}`);
    },
  };
}
