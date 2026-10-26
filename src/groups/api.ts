import type { SQLiteDatabase } from 'expo-sqlite';
import { supabase } from '@/lib/supabase';
import type { Database } from '@/db/database.types';
import { purgeGroup, type LocalFiles } from '@/sync/engine';

/**
 * Starting a group grid, inviting friends into it, and leaving it. These need a
 * connection and go straight to the server (supabase/migrations/20261028000001_group_grids.sql);
 * the grid's rows then reach the phone through sync.
 */

export interface GroupInvite {
  groupId: string;
  from: string;
  title: string;
  color: string;
  cols: number;
  rows: number;
  createdAt: string;
}

type Row = Record<string, unknown>;

function client() {
  if (!supabase) throw new Error('Group grids need a connection.');
  return supabase;
}

/** Function names are checked against the generated types; arguments and results are cast here. */
async function rpc<T>(fn: keyof Database['public']['Functions'], args?: Row): Promise<T> {
  const { data, error } = await client().rpc(fn, args as never);
  if (error) throw new Error(error.message);
  return data as T;
}

/**
 * Turns one of the person's grids into a group grid. What they've already written is
 * shared with the group if `shareExisting`, and kept Private otherwise. The grid has to
 * be on the server first, so `syncNow` runs before asking, and once more if the server
 * hasn't got it yet. Syncs again after, so the phone has the group grid's rows.
 */
export async function makeGroup(userGridId: string, shareExisting: boolean, syncNow: () => Promise<void>): Promise<string> {
  await syncNow();
  const args = { user_grid: userGridId, share_existing: shareExisting };
  let groupId: string;
  try {
    groupId = await rpc<string>('make_group', args);
  } catch (e) {
    if (!(e instanceof Error && /grid not found/.test(e.message))) throw e;
    await syncNow();
    groupId = await rpc<string>('make_group', args);
  }
  await syncNow();
  return groupId;
}

export const inviteToGroup = (groupId: string, friendId: string) =>
  rpc<'invited' | 'member'>('invite_to_group', { grp: groupId, friend: friendId });

export const cancelGroupInvite = (groupId: string, friendId: string) =>
  rpc<void>('cancel_group_invite', { grp: groupId, friend: friendId });

export const respondGroupInvite = (groupId: string, accept: boolean) =>
  rpc<void>('respond_group_invite', { grp: groupId, accept });

export async function listGroupInvites(): Promise<GroupInvite[]> {
  const rows = await rpc<Row[]>('my_group_invites');
  return (rows ?? []).map((r) => ({
    groupId: String(r.group_id), from: String(r.from_username), title: String(r.title), color: String(r.color),
    cols: Number(r.cols), rows: Number(r.rows), createdAt: String(r.created_at),
  }));
}

/**
 * Leaves a group grid and takes it off this phone. What the person added stays for the
 * others. The last one out also clears the photo files the group kept from people who
 * deleted their accounts, and their own.
 */
export async function leaveGroup(db: SQLiteDatabase, groupId: string, files: LocalFiles): Promise<void> {
  const mine = await db.getAllAsync<{ storage_path: string }>(
    `SELECT p.storage_path FROM photos p WHERE p.group_id = ? AND p.storage_path IS NOT NULL
     AND p.user_id = (SELECT value FROM meta WHERE key = 'owner')`, groupId,
  );
  const result = await rpc<'left' | 'deleted'>('leave_group', { grp: groupId });
  if (result === 'deleted') {
    const storage = client().storage.from('photos');
    const { data } = await storage.list(`groups/${groupId}`, { limit: 1000 });
    const paths = [...(data ?? []).map((f) => `groups/${groupId}/${f.name}`), ...mine.map((p) => p.storage_path)];
    if (paths.length) await storage.remove(paths).catch(() => {});
  }
  await purgeGroup(db, groupId, files);
}
