import type { SQLiteDatabase } from 'expo-sqlite';
import { SYNCED_TABLES, getMeta, markDirty, setMeta, type SyncedTable } from '@/db/queue';
import { checkComplete } from '@/db/repo';
import { nowIso } from '@/lib/ids';
import { GRID_PUSH, TABLES, columnNames, type Column } from './tables';

/**
 * The sync engine. SQLite on the phone is the source of truth; this moves changes
 * between it and the server and never blocks the UI.
 *
 *  1. upload photo files that have no storage path yet
 *  2. push grids the person made, then dirty rows, parents before children, a batch per table
 *  3. catch up on group grids: fetch the whole of a group just joined, drop one just left
 *  4. pull rows changed on the server since the last pull, per table
 *  5. download photo files this phone doesn't have
 *
 * Conflicts: the newer updated_at wins per row, a deleted row stays deleted, and a
 * row with local changes still queued is never overwritten by a pull.
 *
 * In a group grid the phone only ever queues rows the server lets this person write: the
 * shared board and moments, and their own entries and photos. Someone else's entry or
 * photo is never changed here, since the server would turn it away and hold up the queue.
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
  /** Creates or updates a grid the person made. Squares are only used when it is created. */
  saveGrid(grid: Row, squares: Row[]): Promise<SaveGridResult>;
  saveProfile(profile: { interests: string[]; onboarded_at: string | null }): Promise<void>;
  /** The group grids this person is in, with everyone the phone needs a name for. */
  myGroups(): Promise<GroupInfo[]>;
  /** Like pull, for one group's rows only. Used to fetch a group just joined. */
  pullGroup(table: SyncedTable, groupId: string, after: string | null, limit: number): Promise<Row[]>;
  /** Group entries and photos that became Private since `after`. */
  pullUnshares(after: string | null, limit: number): Promise<Unshare[]>;
}

export interface GroupPerson { id: string; username: string; status: 'member' | 'invited' | 'left' }
export interface GroupInfo { group_id: string; people: GroupPerson[] }
export interface Unshare { group_id: string; row_table: 'moment_entries' | 'photos'; row_id: string; server_updated_at: string }

export type SaveGridResult = 'saved' | 'stale' | 'sharing_suspended';

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

/** A phone row as the server takes it. */
export function toServer(table: SyncedTable, row: Row): Row {
  return outgoing(TABLES[table], row);
}

function outgoing(columns: Column[], row: Row): Row {
  const out: Row = {};
  for (const c of columns) {
    if (c.pull) continue;
    out[c.name] = c.kind === 'bool' ? row[c.name] === 1 : row[c.name] ?? null;
  }
  return out;
}

/** Postgres returns "2026-10-25T10:00:00+00:00"; the phone stores "2026-10-25T10:00:00.000Z" so strings compare. */
export function normalizeTs(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  return new Date(String(v)).toISOString();
}

export function fromServer(table: SyncedTable, row: Row): Row {
  const out: Row = {};
  for (const c of TABLES[table]) {
    let v = row[c.name];
    if (v === undefined || (v === null && c.missing != null)) v = c.missing ?? null;
    if (c.kind === 'timestamp') v = normalizeTs(v);
    else if (c.kind === 'bool') v = v ? 1 : 0;
    out[c.name] = v;
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

/** Grids the person made, one call each. A grid that won't save doesn't hold up the rest. */
async function pushGrids(db: SQLiteDatabase, remote: Remote, now: string): Promise<PushResult> {
  const queued = await db.getAllAsync<{ id: number; row_id: string; dirty_at: string }>(
    `SELECT id, row_id, dirty_at FROM sync_queue
     WHERE tbl = 'grids' AND failed = 0 AND (next_attempt_at IS NULL OR next_attempt_at <= ?) ORDER BY id`, now,
  );
  let pushed = 0;
  let error: string | undefined;
  for (const q of queued) {
    const grid = await db.getFirstAsync<Row>('SELECT * FROM grids WHERE id = ?', q.row_id);
    if (!grid) { await db.runAsync('DELETE FROM sync_queue WHERE id = ?', q.id); continue; }
    const squares = await db.getAllAsync<Row>('SELECT idx, prompt, cluster FROM grid_squares WHERE grid_id = ? ORDER BY idx', q.row_id);
    const out = outgoing(GRID_PUSH, grid);
    let result: SaveGridResult;
    try {
      result = await remote.saveGrid(out, squares);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      await scheduleRetry(db, [q.id], error);
      continue;
    }
    if (result === 'sharing_suspended') {
      await db.runAsync('UPDATE grids SET is_public = 0 WHERE id = ?', q.row_id);
      await setMeta(db, 'sharing_suspended', '1');
    }
    await db.runAsync('DELETE FROM sync_queue WHERE id = ? AND dirty_at = ?', q.id, q.dirty_at);
    pushed++;
  }
  return { pushed, failed: !!error, error };
}

export async function push(db: SQLiteDatabase, remote: Remote): Promise<PushResult> {
  const now = nowIso();
  const grids = await pushGrids(db, remote, now);
  let pushed = grids.pushed;
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
  return { pushed, failed: grids.failed, error: grids.error };
}

// ---------- pull ----------

async function hasPending(db: SQLiteDatabase, table: SyncedTable, id: string) {
  return !!(await db.getFirstAsync('SELECT 1 AS x FROM sync_queue WHERE tbl = ? AND row_id = ?', table, id));
}

/** Copies grid templates this phone doesn't have yet from the server. */
export async function ensureGrids(db: SQLiteDatabase, remote: Remote, gridIds: string[]) {
  const missing: string[] = [];
  for (const id of new Set(gridIds)) {
    if (!(await db.getFirstAsync('SELECT 1 AS x FROM grids WHERE id = ?', id))) missing.push(id);
  }
  if (missing.length === 0) return;
  for (const t of await remote.fetchGrids(missing)) {
    const g = t.grid;
    await db.runAsync(
      `INSERT OR REPLACE INTO grids (id, title, color, theme, size, cols, rows, description, reveal_icon, made_by, is_public, is_official, author_id, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      g.id as string, g.title as string, g.color as string, g.theme as string, g.size as string, g.cols as number, g.rows as number,
      (g.description as string) ?? '', (g.reveal_icon as string) ?? '', (g.made_by as string) ?? '', g.is_public ? 1 : 0, g.is_official ? 1 : 0,
      (g.author_id as string) ?? null, normalizeTs(g.updated_at) ?? nowIso(),
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
async function applyRow(db: SQLiteDatabase, table: SyncedTable, remoteRow: Row, files: LocalFiles, me: string | null): Promise<boolean> {
  const r = fromServer(table, remoteRow);
  const id = r.id as string;
  const local = await db.getFirstAsync<Row>(`SELECT * FROM ${table} WHERE id = ?`, id);
  // A grid just made into a group grid: the server rewrote its rows (words into entries,
  // who can see each photo), and its version stands whatever this phone holds.
  const regrouped = !!local && !local.deleted_at && (local.group_id ?? null) !== (r.group_id ?? null);
  if (!regrouped && (await hasPending(db, table, id))) return false;
  if (local && !regrouped) {
    if (local.deleted_at) return false;
    if (!r.deleted_at && String(r.updated_at) < String(local.updated_at)) return false;
    if (!r.deleted_at && columnNames(table).every((c) => (local[c] ?? null) === (r[c] ?? null))) return false;
  }

  if (table === 'moments' && !r.deleted_at) {
    const rival = await db.getFirstAsync<Row>(
      'SELECT * FROM moments WHERE square_state_id = ? AND deleted_at IS NULL AND id != ?', r.square_state_id as string, id,
    );
    if (rival && r.group_id) {
      // Two people in a group logged this square while apart: the first moment stays, and
      // everyone moves their own words and photos onto it.
      if (firstOf(rival, r) === rival) {
        r.deleted_at = nowIso();
        await upsertLocal(db, table, r, local);
        // Anyone in the group may retire it; the first phone to settle tells the others.
        await markDirty(db, 'moments', id);
        await moveMine(db, id, String(rival.id), me);
        return true;
      }
      await retireGroupMoment(db, String(rival.id));
      await upsertLocal(db, table, r, local);
      await moveMine(db, String(rival.id), id, me);
      return true;
    } else if (rival) {
      // Two phones logged this square while apart: keep the newer moment, retire the other.
      const now = nowIso();
      if (String(rival.updated_at) > String(r.updated_at)) {
        r.deleted_at = now;
        r.updated_at = now;
        await upsertLocal(db, table, r, local);
        await markDirty(db, 'moments', id);
        return true;
      }
      await retireMoment(db, String(rival.id), files);
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
  // Something of this person's that arrived after its moment was settled into another.
  if ((table === 'photos' || table === 'moment_entries') && r.group_id && r.user_id === me && !r.deleted_at) {
    const parent = await db.getFirstAsync<{ deleted_at: string | null; square_state_id: string }>(
      'SELECT deleted_at, square_state_id FROM moments WHERE id = ?', r.moment_id as string,
    );
    if (parent?.deleted_at) {
      const live = await db.getFirstAsync<{ id: string }>(
        'SELECT id FROM moments WHERE square_state_id = ? AND deleted_at IS NULL', parent.square_state_id,
      );
      if (live) await moveMine(db, r.moment_id as string, live.id, me);
    }
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

/** The moment that was made first, so every phone settles on the same one. */
function firstOf(a: Row, b: Row): Row {
  const ca = String(a.created_at);
  const cb = String(b.created_at);
  if (ca !== cb) return ca < cb ? a : b;
  return String(a.id) < String(b.id) ? a : b;
}

/** Retires a group moment that lost to another. Anyone in the group may; the first phone to settle tells the rest. */
async function retireGroupMoment(db: SQLiteDatabase, momentId: string) {
  const now = nowIso();
  await db.runAsync('UPDATE moments SET deleted_at = ?, updated_at = ? WHERE id = ?', now, now, momentId);
  await markDirty(db, 'moments', momentId);
}

/**
 * Moves this person's entry and photos from one group moment to another. Their words join
 * any entry they already have there, since a person has one entry per square.
 */
async function moveMine(db: SQLiteDatabase, fromId: string, toId: string, me: string | null) {
  if (!me) return;
  const now = nowIso();
  const photos = await db.getAllAsync<{ id: string }>(
    'SELECT id FROM photos WHERE moment_id = ? AND user_id = ? AND deleted_at IS NULL', fromId, me,
  );
  for (const p of photos) {
    await db.runAsync('UPDATE photos SET moment_id = ?, is_cover = 0, updated_at = ? WHERE id = ?', toId, now, p.id);
    await markDirty(db, 'photos', p.id);
  }
  const entries = await db.getAllAsync<{ id: string; body: string }>(
    'SELECT id, body FROM moment_entries WHERE moment_id = ? AND user_id = ? AND deleted_at IS NULL ORDER BY created_at', fromId, me,
  );
  for (const e of entries) {
    const there = await db.getFirstAsync<{ id: string; body: string }>(
      'SELECT id, body FROM moment_entries WHERE moment_id = ? AND user_id = ? AND deleted_at IS NULL', toId, me,
    );
    if (there) {
      const body = [there.body, e.body].filter((b) => b.trim()).join('\n\n');
      await db.runAsync('UPDATE moment_entries SET body = ?, updated_at = ? WHERE id = ?', body, now, there.id);
      await db.runAsync('UPDATE moment_entries SET deleted_at = ?, updated_at = ? WHERE id = ?', now, now, e.id);
      await markDirty(db, 'moment_entries', there.id);
    } else {
      await db.runAsync('UPDATE moment_entries SET moment_id = ?, updated_at = ? WHERE id = ?', toId, now, e.id);
    }
    await markDirty(db, 'moment_entries', e.id);
  }
}

async function upsertLocal(db: SQLiteDatabase, table: SyncedTable, r: Row, local: Row | null) {
  const cols = columnNames(table);
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

async function applyPage(db: SQLiteDatabase, table: SyncedTable, rows: Row[], files: LocalFiles, me: string | null, touched: Set<string>) {
  let changed = 0;
  await db.withTransactionAsync(async () => {
    for (const row of rows) {
      if (await applyRow(db, table, row, files, me)) {
        changed++;
        if (table === 'square_states') touched.add(String(row.user_grid_id));
      }
    }
  });
  return changed;
}

export async function pull(db: SQLiteDatabase, remote: Remote, files: LocalFiles, userId?: string): Promise<number> {
  const me = userId ?? (await getMeta(db, 'owner'));
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
      changed += await applyPage(db, table, rows, files, me, touchedGrids);
      after = String(rows[rows.length - 1].server_updated_at);
      if (!cursor || after > cursor) await setMeta(db, key, after);
      if (rows.length < PAGE) break;
    }
  }
  changed += await pullUnshares(db, remote, files, me);
  // Squares finished on two different phones can complete a grid that neither saw complete.
  for (const ug of touchedGrids) await checkComplete(db, ug);
  return changed;
}

// ---------- group grids ----------

/**
 * Brings the phone in line with the groups this person is in: everything in a group they
 * just joined (its rows are older than the pull cursors), and nothing of one they left.
 * Also refreshes the names shown on entries. Skipped when the server can't be asked.
 */
export async function syncGroups(db: SQLiteDatabase, remote: Remote, files: LocalFiles, me: string): Promise<number> {
  let groups: GroupInfo[];
  try {
    groups = await remote.myGroups();
  } catch {
    return 0;
  }
  const ids = new Set(groups.map((g) => g.group_id));
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM group_people');
    for (const g of groups) {
      for (const p of g.people) {
        await db.runAsync(
          'INSERT OR REPLACE INTO group_people (group_id, user_id, username, status) VALUES (?, ?, ?, ?)', g.group_id, p.id, p.username, p.status,
        );
      }
    }
  });

  const known = new Set<string>(JSON.parse((await getMeta(db, 'groups')) ?? '[]'));
  let changed = 0;
  for (const id of ids) {
    if (known.has(id)) continue;
    changed += await fetchGroup(db, remote, files, me, id);
    known.add(id);
    await setMeta(db, 'groups', JSON.stringify([...known]));
  }
  const local = await db.getAllAsync<{ group_id: string }>('SELECT DISTINCT group_id FROM user_grids WHERE group_id IS NOT NULL');
  for (const id of new Set([...known, ...local.map((r) => r.group_id)])) {
    if (ids.has(id)) continue;
    await purgeGroup(db, id, files);
    changed++;
  }
  await setMeta(db, 'groups', JSON.stringify([...ids]));
  return changed;
}

async function fetchGroup(db: SQLiteDatabase, remote: Remote, files: LocalFiles, me: string, groupId: string) {
  let changed = 0;
  const touched = new Set<string>();
  for (const table of SYNCED_TABLES) {
    let after: string | null = null;
    for (;;) {
      const rows = await remote.pullGroup(table, groupId, after, PAGE);
      if (rows.length === 0) break;
      if (table === 'user_grids') await ensureGrids(db, remote, rows.map((r) => String(r.grid_id)));
      changed += await applyPage(db, table, rows, files, me, touched);
      after = String(rows[rows.length - 1].server_updated_at);
      if (rows.length < PAGE) break;
    }
  }
  return changed;
}

/** Removes a group grid from the phone, after leaving it or being the last one out. */
export async function purgeGroup(db: SQLiteDatabase, groupId: string, files: LocalFiles) {
  const photos = await db.getAllAsync<{ local_uri: string }>(
    "SELECT local_uri FROM photos WHERE group_id = ? AND local_uri != ''", groupId,
  );
  await db.withTransactionAsync(async () => {
    for (const table of [...SYNCED_TABLES].reverse()) {
      const where = table === 'user_grids' ? '(group_id = ? OR id = ?)' : 'group_id = ?';
      const args = table === 'user_grids' ? [groupId, groupId] : [groupId];
      await db.runAsync(`DELETE FROM sync_queue WHERE tbl = ? AND row_id IN (SELECT id FROM ${table} WHERE ${where})`, table, ...args);
      await db.runAsync(`DELETE FROM ${table} WHERE ${where}`, ...args);
    }
    await db.runAsync('DELETE FROM group_people WHERE group_id = ?', groupId);
  });
  files.remove(photos.map((p) => p.local_uri));
}

/** Drops copies of others' entries and photos that they've since made Private. */
async function pullUnshares(db: SQLiteDatabase, remote: Remote, files: LocalFiles, me: string | null) {
  const key = 'pull:group_unshares';
  const cursor = await getMeta(db, key);
  let after = cursor ? new Date(Date.parse(cursor) - PULL_OVERLAP_MS).toISOString() : null;
  let changed = 0;
  for (;;) {
    let rows: Unshare[];
    try {
      rows = await remote.pullUnshares(after, PAGE);
    } catch {
      return changed;
    }
    if (rows.length === 0) break;
    for (const u of rows) {
      const table = u.row_table === 'photos' ? 'photos' : 'moment_entries';
      const row = await db.getFirstAsync<{ user_id: string | null; local_uri?: string }>(`SELECT * FROM ${table} WHERE id = ?`, u.row_id);
      if (!row || row.user_id === me) continue;
      await db.runAsync(`DELETE FROM ${table} WHERE id = ?`, u.row_id);
      if (row.local_uri) files.remove([row.local_uri]);
      changed++;
    }
    after = normalizeTs(rows[rows.length - 1].server_updated_at);
    if (after && (!cursor || after > cursor)) await setMeta(db, key, after);
    if (rows.length < PAGE) break;
  }
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

/** Interests from onboarding, saved on the phone first and sent when there is a connection. */
async function pushProfile(db: SQLiteDatabase, remote: Remote) {
  if ((await getMeta(db, 'profile_dirty')) !== '1') return;
  const interests = JSON.parse((await getMeta(db, 'interests')) ?? '[]') as string[];
  await remote.saveProfile({ interests, onboarded_at: await getMeta(db, 'onboarded_at') });
  await setMeta(db, 'profile_dirty', null);
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
  try {
    await pushProfile(db, remote);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  const p = await push(db, remote);
  if (p.error) error = p.error;
  const grouped = await syncGroups(db, remote, files, userId);
  const pulled = grouped + await pull(db, remote, files, userId);
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

/** Empties every personal table. Official grid templates stay; grids made by people go. Used on sign-out and account deletion. */
export async function wipeLocal(db: SQLiteDatabase) {
  await db.withTransactionAsync(async () => {
    await db.execAsync(`
      DELETE FROM photos; DELETE FROM moment_entries; DELETE FROM moments; DELETE FROM square_states; DELETE FROM user_grids;
      DELETE FROM group_people;
      DELETE FROM grid_squares WHERE grid_id IN (SELECT id FROM grids WHERE is_official = 0);
      DELETE FROM grids WHERE is_official = 0;
      DELETE FROM sync_queue; DELETE FROM meta;
    `);
  });
}
