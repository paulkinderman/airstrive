import type { SQLiteDatabase } from 'expo-sqlite';
import { nowIso } from '@/lib/ids';

/** Tables that sync, parents before children. */
export const SYNCED_TABLES = ['user_grids', 'square_states', 'moments', 'moment_entries', 'photos'] as const;
export type SyncedTable = (typeof SYNCED_TABLES)[number];
/** Grids the person made also go through the queue, ahead of everything else. */
export type QueuedTable = SyncedTable | 'grids';

/**
 * Marks a row as changed. The queue holds one entry per row and the pusher reads the
 * row as it is at push time, so repeated edits collapse into one upload. dirty_at
 * changes on every mark, which lets the pusher tell whether the row moved again while
 * its upload was in flight.
 */
export async function markDirty(db: SQLiteDatabase, tbl: QueuedTable, rowId: string) {
  await db.runAsync(
    `INSERT INTO sync_queue (tbl, row_id, dirty_at) VALUES (?, ?, ?)
     ON CONFLICT (tbl, row_id) DO UPDATE SET
       dirty_at = excluded.dirty_at, attempts = 0, next_attempt_at = NULL,
       first_failed_at = NULL, last_error = NULL, failed = 0`,
    tbl, rowId, `${nowIso()}#${Math.random().toString(36).slice(2, 8)}`,
  );
}

export async function getMeta(db: SQLiteDatabase, key: string): Promise<string | null> {
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM meta WHERE key = ?', key);
  return row?.value ?? null;
}

export async function setMeta(db: SQLiteDatabase, key: string, value: string | null) {
  if (value === null) await db.runAsync('DELETE FROM meta WHERE key = ?', key);
  else await db.runAsync('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value', key, value);
}
