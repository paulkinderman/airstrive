import type { SQLiteDatabase } from 'expo-sqlite';
import { STARTERS } from './starters';
import { SIZES, placeClusters, startingSquares } from './types';
import { markDirty } from '@/db/queue';
import { newId, nowIso } from '@/lib/ids';
import { starterSquareId, starterUserGridId } from '@/lib/uuid5';

/** Puts the six starter templates on the phone. Templates are shared, not personal, and never sync up. */
export async function seedGridTemplates(db: SQLiteDatabase) {
  const now = nowIso();
  for (const g of STARTERS) {
    const exists = await db.getFirstAsync('SELECT id FROM grids WHERE id = ?', g.id);
    if (exists) continue;
    const { cols, rows } = SIZES[g.size];
    await db.withTransactionAsync(async () => {
      await db.runAsync(
        `INSERT INTO grids (id, title, color, theme, size, cols, rows, description, made_by, is_public, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'AirStrive', 1, ?)`,
        g.id, g.title, g.color, g.theme, g.size, cols, rows, g.description, now,
      );
      for (const sq of placeClusters(g)) {
        await db.runAsync(
          'INSERT INTO grid_squares (grid_id, idx, prompt, hint, cluster) VALUES (?, ?, ?, ?, ?)',
          g.id, sq.idx, sq.prompt, '', sq.cluster,
        );
      }
    });
  }
}

/**
 * Makes sure every starter grid is on the person's shelf. Ids are derived from the
 * person and the grid, so two phones that both do this before syncing end up with the
 * same rows. Run it after the first pull so grids already started elsewhere are kept.
 */
export async function ensureStarterShelf(db: SQLiteDatabase, userId: string) {
  const base = Date.now();
  for (let i = 0; i < STARTERS.length; i++) {
    const g = STARTERS[i];
    const started = await db.getFirstAsync(
      'SELECT id FROM user_grids WHERE grid_id = ? AND deleted_at IS NULL', g.id,
    );
    if (started) continue;
    // Earlier starters get later timestamps so the shelf reads in STARTERS order.
    await startGrid(db, g.id, {
      id: starterUserGridId(userId, g.id),
      squareId: (ugId, idx) => starterSquareId(ugId, idx),
      startedAt: new Date(base - i).toISOString(),
    });
  }
}

export async function startGrid(
  db: SQLiteDatabase,
  gridId: string,
  opts: { id?: string; squareId?: (userGridId: string, idx: number) => string; startedAt?: string } = {},
) {
  const grid = await db.getFirstAsync<{ size: keyof typeof SIZES; cols: number; rows: number }>(
    'SELECT size, cols, rows FROM grids WHERE id = ?', gridId,
  );
  if (!grid) throw new Error('grid not found');
  const now = nowIso();
  const userGridId = opts.id ?? newId();
  const revealed = new Set(startingSquares(grid.size));
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'INSERT INTO user_grids (id, grid_id, freebies_left, started_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      userGridId, gridId, SIZES[grid.size].freebies, opts.startedAt ?? now, now,
    );
    await markDirty(db, 'user_grids', userGridId);
    for (let i = 0; i < grid.cols * grid.rows; i++) {
      const id = opts.squareId ? opts.squareId(userGridId, i) : newId();
      await db.runAsync(
        'INSERT INTO square_states (id, user_grid_id, idx, state, updated_at) VALUES (?, ?, ?, ?, ?)',
        id, userGridId, i, revealed.has(i) ? 'revealed' : 'hidden', now,
      );
      await markDirty(db, 'square_states', id);
    }
  });
  return userGridId;
}
