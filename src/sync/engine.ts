import type { SQLiteDatabase } from 'expo-sqlite';
import { SYNCED_TABLES, getMeta, markDirty, setMeta, type SyncedTable } from '@/db/queue';
import { checkComplete } from '@/db/repo';
import { nowIso } from '@/lib/ids';

/**
 * The sync engine. SQLite on the phone is the source of truth; this moves changes
 * between it and the server and never blocks the UI.
 *
 *  1. upload photo files that have no storage path yet
 *  2. push dirty rows, parents before children, a batch per table
 *  3. pull rows changed on the server since the last pull, per table
 *  4. download photo files this phone doesn't have
 *
 * Conflicts: the newer updated_at wins per row, a deleted row stays deleted, and a
 * row with local changes still queued is never overwritten by a pull.
 */

type Row = Record<string, unknown>;

export interface GridTemplate {
  grid: Row;
  squares: Row[];
}

/** Everything the engine needs from the server. supabaseRemote.ts implements it for real. */
export interface Remote {
  upsert(table: SyncedTable, rows: Row[]): Promise<void>;
  /** Rows with server_updated_at after `after` (all rows when null), oldest first. */
  pull(table: SyncedTable, after: string | null, limit: number): Promise<Row[]>;
  fetchGrids(ids: string[]): Promise<GridTemplate[]>;
  uploadPhoto(storagePath: string, localPath: string, contentType: string): Promise<void>;
  downloadPhoto(storagePath: string, localPath: string): Promise<void>;
  removePhotos(storagePaths: string[]): Promise<void>;
}

export interface LocalFiles {
  exists(path: string): boolean;
  remove(paths: string[]): void;
}

const BATCH = 100;
const PAGE = 500;
/** Pulls start a little before the last cursor so rows committed out of order aren't missed. */
const PULL_OVERLAP_MS = 2 * 60 * 1000;
const BACKOFF_S = [1, 10, 60, 600, 3600];
const GIVE_UP_MS = 7 * 24 * 3600 * 1000;

const TIMESTAMPS = ['started_at', 'completed_at', 'updated_at', 'deleted_at', 'done_at', 'created_at'];
const BOOLEANS: Record<SyncedTable, string[]> = {
  user_grids: ['show_moments'],
  square_states: ['via_freebie'],
  moments: [],
  photos: ['is_cover'],
};
const COLUMNS: Record<SyncedTable, string[]> = {
  user_grids: ['id', 'grid_id', 'freebies_left', 'started_at', 'completed_at', 'show_moments', 'updated_at', 'deleted_at'],
  square_states: ['id', 'user_grid_id', 'idx', 'state', 'done_at', 'via_freebie', 'updated_at', 'deleted_at'],
  moments: ['id', 'square_state_id', 'title', 'body', 'happened_on', 'place', 'weather', 'with_people', 'created_at', 'updated_at', 'deleted_at'],
  photos: ['id', 'moment_id', 'position', 'storage_path', 'is_cover', 'width', 'height', 'bytes', 'created_at', 'updated_at', 'deleted_at'],
};

export function toServer(table: SyncedTable, row: Row): Row {
  const out: Row = {};
  for (const c of COLUMNS[table]) out[c] = BOOLEANS[table].includes(c) ? row[c] === 1 : row[c] ?? null;
  return out;
}

/** Postgres returns "2026-10-25T10:00:00+00:00"; the phone stores "2026-10-25T10:00:00.000Z" so strings compare. */
export function normalizeTs(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  return new Date(String(v)).toISOString();
}

export function fromServer(table: SyncedTable, row: Row): Row {
  const out: Row = {};
  for (const c of COLUMNS[table]) {
    let v = row[c];
    if (TIMESTAMPS.includes(c)) v = normalizeTs(v);
    else if (BOOLEANS[table].includes(c)) v = v ? 1 : 0;
    else if (v === undefined) v = null;
    out[c] = v;
  }
  return out;
}

// ---------- push ----------

export interface PushResult { pushed: number; failed: boolean; error?: string }

async function scheduleRetry(db: SQLiteDatabase, ids: number[], error: string) {
  const now = Date.now();
  for (const id of ids) {
    const q = await db.getFirstAsync<{ attempts: number; first_failed_at: string | null }>(
      'SELECT attempts, first_failed_at FROM sync_queue WHERE id = ?', id,
    );
    if (!q) continue;
    const firstFailed = q.first_failed_at ?? new Date(now).toISOString();
    const delay = BACKOFF_S[Math.min(q.attempts, BACKOFF_S.length - 1)] * 1000;
    const giveUp = now - Date.parse(firstFailed) > GIVE_UP_MS ? 1 : 0;
    await db.runAsync(
      'UPDATE sync_queue SET attempts = attempts + 1, next_attempt_at = ?, first_failed_at = ?, last_error = ?, failed = ? WHERE id = ?',
      new Date(now + delay).toISOString(), firstFailed, error.slice(0, 500), giveUp, id,
    );
  }
}

export async function push(db: SQLiteDatabase, remote: Remote): Promise<PushResult> {
  const now = nowIso();
  let pushed = 0;
  for (const table of SYNCED_TABLES) {
    for (;;) {
      const queued = await db.getAllAsync<{ id: number; row_id: string; dirty_at: string }>(
        `SELECT id, row_id, dirty_at FROM sync_queue
         WHERE tbl = ? AND failed = 0 AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
         ORDER BY id LIMIT ?`, table, now, BATCH,
      );
      if (queued.length === 0) break;

      const rows: Row[] = [];
      const sent: typeof queued = [];
      for (const q of queued) {
        const row = await db.getFirstAsync<Row>(`SELECT * FROM ${table} WHERE id = ?`, q.row_id);
        if (!row) { await db.runAsync('DELETE FROM sync_queue WHERE id = ?', q.id); continue; }
        rows.push(toServer(table, row));
        sent.push(q);
      }
      if (rows.length === 0) continue;

      try {
        await remote.upsert(table, rows);
      } catch (e) {
        // Children of a row that didn't make it would fail too, so stop here and retry later.
        const msg = e instanceof Error ? e.message : String(e);
        await scheduleRetry(db, sent.map((q) => q.id), msg);
        return { pushed, failed: true, error: msg };
      }

      for (const q of sent) {
        // A row edited again while its upload was in flight stays queued.
        await db.runAsync('DELETE FROM sync_queue WHERE id = ? AND dirty_at = ?', q.id, q.dirty_at);
      }
      pushed += rows.length;

      if (table === 'photos') {
        const gone = rows.filter((r) => r.deleted_at && r.storage_path).map((r) => String(r.storage_path));
        if (gone.length) await remote.removePhotos(gone).catch(() => {});
      }
      if (queued.length < BATCH) break;
    }
  }
  return { pushed, failed: false };
}

// ---------- pull ----------

async function hasPending(db: SQLiteDatabase, table: SyncedTable, id: string) {
  return !!(await db.getFirstAsync('SELECT 1 AS x FROM sync_queue WHERE tbl = ? AND row_id = ?', table, id));
}

async function ensureGrids(db: SQLiteDatabase, remote: Remote, gridIds: string[]) {
  const missing: string[] = [];
  for (const id of new Set(gridIds)) {
    if (!(await db.getFirstAsync('SELECT 1 AS x FROM grids WHERE id = ?', id))) missing.push(id);
  }
  if (missing.length === 0) return;
  for (const t of await remote.fetchGrids(missing)) {
    const g = t.grid;
    await db.runAsync(
      `INSERT OR REPLACE INTO grids (id, title, color, theme, size, cols, rows, description, made_by, is_public, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      g.id as string, g.title as string, g.color as string, g.theme as string, g.size as string, g.cols as number, g.rows as number,
      (g.description as string) ?? '', (g.made_by as string) ?? '', g.is_public ? 1 : 0, normalizeTs(g.updated_at) ?? nowIso(),
    );
    for (const s of t.squares) {
      await db.runAsync(
        'INSERT OR REPLACE INTO grid_squares (grid_id, idx, prompt, hint, cluster) VALUES (?, ?, ?, ?, ?)',
        s.grid_id as string, s.idx as number, s.prompt as string, (s.hint as string) ?? '', (s.cluster as string) ?? '',
      );
    }
  }
}

/** Applies one server row. Returns true if the phone's copy changed. */
async function applyRow(db: SQLiteDatabase, table: SyncedTable, remoteRow: Row, files: LocalFiles): Promise<boolean> {
  const r = fromServer(table, remoteRow);
  const id = r.id as string;
  if (await hasPending(db, table, id)) return false;
  const local = await db.getFirstAsync<Row>(`SELECT * FROM ${table} WHERE id = ?`, id);
  if (local) {
    if (local.deleted_at) return false;
    if (!r.deleted_at && String(r.updated_at) < String(local.updated_at)) return false;
    if (!r.deleted_at && COLUMNS[table].every((c) => (local[c] ?? null) === (r[c] ?? null))) return false;
  }

  if (table === 'moments' && !r.deleted_at) {
    // Two phones logged this square while apart: keep the newer moment, retire the other.
    const rival = await db.getFirstAsync<{ id: string; updated_at: string }>(
      'SELECT id, updated_at FROM moments WHERE square_state_id = ? AND deleted_at IS NULL AND id != ?', r.square_state_id as string, id,
    );
    if (rival) {
      const now = nowIso();
      if (rival.updated_at > String(r.updated_at)) {
        r.deleted_at = now;
        r.updated_at = now;
        await upsertLocal(db, table, r, local);
        await markDirty(db, 'moments', id);
        return true;
      }
      await retireMoment(db, rival.id, files);
    }
  }

  await upsertLocal(db, table, r, local);

  if (table === 'photos' && r.deleted_at && local?.local_uri) files.remove([String(local.local_uri)]);
  if (table === 'moments' && r.deleted_at) {
    const photos = await db.getAllAsync<{ local_uri: string }>(
      "SELECT local_uri FROM photos WHERE moment_id = ? AND local_uri != ''", id,
    );
    files.remove(photos.map((p) => p.local_uri));
  }
  return true;
}

async function retireMoment(db: SQLiteDatabase, momentId: string, files: LocalFiles) {
  const now = nowIso();
  const photos = await db.getAllAsync<{ id: string; local_uri: string }>(
    'SELECT id, local_uri FROM photos WHERE moment_id = ? AND deleted_at IS NULL', momentId,
  );
  for (const p of photos) {
    await db.runAsync('UPDATE photos SET deleted_at = ?, updated_at = ? WHERE id = ?', now, now, p.id);
    await markDirty(db, 'photos', p.id);
  }
  files.remove(photos.map((p) => p.local_uri).filter(Boolean));
  await db.runAsync('UPDATE moments SET deleted_at = ?, updated_at = ? WHERE id = ?', now, now, momentId);
  await markDirty(db, 'moments', momentId);
}

async function upsertLocal(db: SQLiteDatabase, table: SyncedTable, r: Row, local: Row | null) {
  const cols = [...COLUMNS[table]];
  const values = cols.map((c) => r[c] as string | number | null);
  if (table === 'photos') {
    // local_uri is this phone's own; a downloaded file is filled in later.
    cols.push('local_uri');
    values.push((local?.local_uri as string) ?? '');
  }
  const set = cols.filter((c) => c !== 'id').map((c) => `${c} = excluded.${c}`).join(', ');
  await db.runAsync(
    `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})
     ON CONFLICT (id) DO UPDATE SET ${set}`,
    ...values,
  );
}

export async function pull(db: SQLiteDatabase, remote: Remote, files: LocalFiles): Promise<number> {
  let changed = 0;
  const touchedGrids = new Set<string>();
  for (const table of SYNCED_TABLES) {
    const key = `pull:${table}`;
    const cursor = await getMeta(db, key);
    let after = cursor ? new Date(Date.parse(cursor) - PULL_OVERLAP_MS).toISOString() : null;
    for (;;) {
      const rows = await remote.pull(table, after, PAGE);
      if (rows.length === 0) break;
      if (table === 'user_grids') await ensureGrids(db, remote, rows.map((r) => String(r.grid_id)));
      await db.withTransactionAsync(async () => {
        for (const row of rows) {
          if (await applyRow(db, table, row, files)) {
            changed++;
            if (table === 'square_states') touchedGrids.add(String(row.user_grid_id));
          }
        }
      });
      after = String(rows[rows.length - 1].server_updated_at);
      if (!cursor || after > cursor) await setMeta(db, key, after);
      if (rows.length < PAGE) break;
    }
  }
  // Squares finished on two different phones can complete a grid that neither saw complete.
  for (const ug of touchedGrids) await checkComplete(db, ug);
  return changed;
}

// ---------- photo files ----------

function extOf(path: string) {
  const m = /\.(\w+)$/.exec(path);
  return m ? m[1].toLowerCase() : 'webp';
}

export async function uploadPhotos(db: SQLiteDatabase, remote: Remote, files: LocalFiles, userId: string): Promise<number> {
  const pending = await db.getAllAsync<{ id: string; local_uri: string }>(
    "SELECT id, local_uri FROM photos WHERE storage_path IS NULL AND deleted_at IS NULL AND local_uri != ''",
  );
  let n = 0;
  for (const p of pending) {
    if (!files.exists(p.local_uri)) continue;
    const ext = extOf(p.local_uri);
    const storagePath = `${userId}/${p.id}.${ext}`;
    await remote.uploadPhoto(storagePath, p.local_uri, ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/webp');
    await db.runAsync('UPDATE photos SET storage_path = ?, updated_at = ? WHERE id = ?', storagePath, nowIso(), p.id);
    await markDirty(db, 'photos', p.id);
    n++;
  }
  return n;
}

export async function downloadPhotos(db: SQLiteDatabase, remote: Remote, files: LocalFiles): Promise<number> {
  const rows = await db.getAllAsync<{ id: string; local_uri: string; storage_path: string }>(
    `SELECT p.id, p.local_uri, p.storage_path FROM photos p JOIN moments m ON m.id = p.moment_id
     WHERE p.storage_path IS NOT NULL AND p.deleted_at IS NULL AND m.deleted_at IS NULL`,
  );
  let n = 0;
  for (const p of rows) {
    if (p.local_uri && files.exists(p.local_uri)) continue;
    const path = `photos/${p.id}.${extOf(p.storage_path)}`;
    try {
      await remote.downloadPhoto(p.storage_path, path);
    } catch {
      continue; // try again next sync
    }
    await db.runAsync('UPDATE photos SET local_uri = ? WHERE id = ?', path, p.id);
    n++;
  }
  return n;
}

// ---------- whole passes ----------

/** Queues every row on the phone. Used once, when data made before an account first meets it. */
export async function backfill(db: SQLiteDatabase) {
  for (const table of SYNCED_TABLES) {
    const rows = await db.getAllAsync<{ id: string }>(
      `SELECT id FROM ${table} WHERE id NOT IN (SELECT row_id FROM sync_queue WHERE tbl = ?)`, table,
    );
    await db.withTransactionAsync(async () => {
      for (const r of rows) await markDirty(db, table, r.id);
    });
  }
}

export interface SyncResult { pushed: number; pulled: number; uploaded: number; downloaded: number; error?: string }

export async function syncOnce(db: SQLiteDatabase, remote: Remote, files: LocalFiles, userId: string): Promise<SyncResult> {
  let uploaded = 0;
  let error: string | undefined;
  try {
    uploaded = await uploadPhotos(db, remote, files, userId);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  const p = await push(db, remote);
  if (p.error) error = p.error;
  const pulled = await pull(db, remote, files);
  // Pulling can queue work of its own (a retired duplicate moment, a newly completed grid).
  const p2 = await push(db, remote);
  const downloaded = await downloadPhotos(db, remote, files);
  await setMeta(db, 'last_synced_at', nowIso());
  return { pushed: p.pushed + p2.pushed, pulled, uploaded, downloaded, error: error ?? p2.error };
}

export async function syncStatus(db: SQLiteDatabase) {
  const pending = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM sync_queue WHERE failed = 0');
  const failed = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM sync_queue WHERE failed = 1');
  const unuploaded = await db.getFirstAsync<{ n: number }>(
    "SELECT COUNT(*) AS n FROM photos WHERE storage_path IS NULL AND deleted_at IS NULL AND local_uri != ''",
  );
  return {
    pending: (pending?.n ?? 0) + (unuploaded?.n ?? 0),
    failed: failed?.n ?? 0,
    lastSyncedAt: await getMeta(db, 'last_synced_at'),
  };
}

export async function retryFailed(db: SQLiteDatabase) {
  await db.runAsync('UPDATE sync_queue SET failed = 0, attempts = 0, next_attempt_at = NULL, first_failed_at = NULL');
}

/** Empties every personal table. Grid templates stay. Used on sign-out and account deletion. */
export async function wipeLocal(db: SQLiteDatabase) {
  await db.withTransactionAsync(async () => {
    await db.execAsync(`
      DELETE FROM photos; DELETE FROM moments; DELETE FROM square_states; DELETE FROM user_grids;
      DELETE FROM sync_queue; DELETE FROM meta;
    `);
  });
}
