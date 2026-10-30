import type { SQLiteDatabase } from 'expo-sqlite';
import { SIZES, type GridSize } from '@/data/types';
import { startGrid } from '@/data/seed';
import { newId, nowIso } from '@/lib/ids';
import { asAudience, isWider, narrower, type Audience } from '@/friends/audience';
import { markDirty } from '../queue';
import { listShelf } from './shelf';
import type { ShelfGrid } from './types';

export interface NewGrid {
  title: string;
  color: string;
  theme: string;
  size: GridSize;
  description: string;
  /** The icon on revealed squares; left out or '' is the dot in the grid's color. */
  revealIcon?: string;
  isPublic: boolean;
  squares: { idx: number; prompt: string; cluster: string }[];
}

/** Saves a grid the person made and puts it on their shelf. Returns the shelf copy's id. */
export async function createGrid(db: SQLiteDatabase, userId: string, made: NewGrid): Promise<string> {
  const { cols, rows } = SIZES[made.size];
  if (made.squares.length !== cols * rows) throw new Error('every square needs a prompt');
  const id = newId();
  const now = nowIso();
  const username = (await db.getFirstAsync<{ value: string }>("SELECT value FROM meta WHERE key = 'username'"))?.value ?? 'you';
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO grids (id, title, color, theme, size, cols, rows, description, reveal_icon, made_by, author_id, is_public, is_official, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
      id, made.title.trim(), made.color, made.theme, made.size, cols, rows, made.description.trim(), made.revealIcon?.trim() ?? '', username, userId,
      made.isPublic ? 1 : 0, now,
    );
    for (const s of made.squares) {
      await db.runAsync(
        'INSERT INTO grid_squares (grid_id, idx, prompt, hint, cluster) VALUES (?, ?, ?, ?, ?)', id, s.idx, s.prompt.trim(), '', s.cluster,
      );
    }
    await markDirty(db, 'grids', id);
  });
  return startGrid(db, id);
}

/** Shares a grid the person made to the Atlas, or takes it back out. People who added it keep it. */
export async function setGridShared(db: SQLiteDatabase, gridId: string, shared: boolean) {
  await db.runAsync('UPDATE grids SET is_public = ?, updated_at = ? WHERE id = ? AND author_id IS NOT NULL', shared ? 1 : 0, nowIso(), gridId);
  await markDirty(db, 'grids', gridId);
}

/**
 * Sets who can see a grid. Narrowing it narrows every moment in it. Widening it leaves the
 * moments where they were unless `moments` is true, which brings them all to the new audience.
 */
export async function setGridAudience(db: SQLiteDatabase, userGridId: string, audience: Audience, moments = false) {
  const now = nowIso();
  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE user_grids SET audience = ?, updated_at = ? WHERE id = ?', audience, now, userGridId);
    await markDirty(db, 'user_grids', userGridId);
    const rows = await db.getAllAsync<{ id: string; audience: string }>(
      `SELECT m.id, m.audience FROM moments m JOIN square_states ss ON ss.id = m.square_state_id
       WHERE ss.user_grid_id = ? AND m.deleted_at IS NULL`, userGridId,
    );
    for (const m of rows) {
      const current = asAudience(m.audience);
      const next = moments ? audience : narrower(current, audience);
      if (next === current) continue;
      await db.runAsync('UPDATE moments SET audience = ?, updated_at = ? WHERE id = ?', next, now, m.id);
      await markDirty(db, 'moments', m.id);
    }
  });
}

/** Whether a grid has moments narrower than `audience`, i.e. whether widening it should ask about them. */
export async function hasNarrowerMoments(db: SQLiteDatabase, userGridId: string, audience: Audience): Promise<boolean> {
  const rows = await db.getAllAsync<{ audience: string }>(
    `SELECT DISTINCT m.audience FROM moments m JOIN square_states ss ON ss.id = m.square_state_id
     WHERE ss.user_grid_id = ? AND m.deleted_at IS NULL`, userGridId,
  );
  return rows.some((r) => isWider(audience, asAudience(r.audience)));
}

/** Grids on the shelf that someone other than the person can see, for their Profile. */
export async function listSharedGrids(db: SQLiteDatabase): Promise<(ShelfGrid & { audience: Audience })[]> {
  const shared = await db.getAllAsync<{ id: string; audience: string }>(
    "SELECT id, audience FROM user_grids WHERE deleted_at IS NULL AND audience != 'private'",
  );
  const byId = new Map(shared.map((r) => [r.id, asAudience(r.audience)]));
  return (await listShelf(db)).filter((g) => byId.has(g.userGridId)).map((g) => ({ ...g, audience: byId.get(g.userGridId)! }));
}

/**
 * Takes a grid off the shelf. Only grids with no moments can go, so nothing in Memory
 * Lane is ever lost this way. Returns false if the grid has moments.
 */
export async function removeFromShelf(db: SQLiteDatabase, userGridId: string): Promise<boolean> {
  const has = await db.getFirstAsync(
    `SELECT 1 AS x FROM moments m JOIN square_states ss ON ss.id = m.square_state_id
     WHERE ss.user_grid_id = ? AND m.deleted_at IS NULL`, userGridId,
  );
  if (has) return false;
  const now = nowIso();
  await db.withTransactionAsync(async () => {
    const squares = await db.getAllAsync<{ id: string }>(
      'SELECT id FROM square_states WHERE user_grid_id = ? AND deleted_at IS NULL', userGridId,
    );
    for (const s of squares) {
      await db.runAsync('UPDATE square_states SET deleted_at = ?, updated_at = ? WHERE id = ?', now, now, s.id);
      await markDirty(db, 'square_states', s.id);
    }
    await db.runAsync('UPDATE user_grids SET deleted_at = ?, updated_at = ? WHERE id = ?', now, now, userGridId);
    await markDirty(db, 'user_grids', userGridId);
  });
  return true;
}

export async function hasMoments(db: SQLiteDatabase, userGridId: string): Promise<boolean> {
  return !!(await db.getFirstAsync(
    `SELECT 1 AS x FROM moments m JOIN square_states ss ON ss.id = m.square_state_id
     WHERE ss.user_grid_id = ? AND m.deleted_at IS NULL`, userGridId,
  ));
}

/** The person's live copy of a grid, if it is on their shelf. */
export async function shelfCopyOf(db: SQLiteDatabase, gridId: string): Promise<string | null> {
  const r = await db.getFirstAsync<{ id: string }>('SELECT id FROM user_grids WHERE grid_id = ? AND deleted_at IS NULL', gridId);
  return r?.id ?? null;
}

export interface GridTemplateRow {
  id: string; title: string; color: string; theme: string; size: GridSize; cols: number; rows: number;
  description: string; reveal_icon: string; made_by: string; author_id: string | null; is_official: number; is_public: number;
}

export async function getTemplate(db: SQLiteDatabase, gridId: string) {
  const grid = await db.getFirstAsync<GridTemplateRow>('SELECT * FROM grids WHERE id = ?', gridId);
  if (!grid) return null;
  const squares = await db.getAllAsync<{ idx: number; prompt: string; cluster: string }>(
    'SELECT idx, prompt, cluster FROM grid_squares WHERE grid_id = ? ORDER BY idx', gridId,
  );
  return { grid, squares };
}

/** Templates already on the phone: the official grids and anything adopted or made. */
export async function listTemplates(db: SQLiteDatabase): Promise<GridTemplateRow[]> {
  return db.getAllAsync<GridTemplateRow>('SELECT * FROM grids ORDER BY is_official DESC, title');
}
