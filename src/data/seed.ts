import type { SQLiteDatabase } from 'expo-sqlite';
import { running } from './running';
import { SIZES, placeClusters, startingSquares, type StarterGrid } from './types';
import { newId, nowIso } from '@/lib/ids';

const STARTERS: StarterGrid[] = [running];

export async function seedStarterGrids(db: SQLiteDatabase) {
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

  // v0 ships with Running already on the shelf so the first screen is never empty.
  const started = await db.getFirstAsync('SELECT id FROM user_grids WHERE grid_id = ?', running.id);
  if (!started) await startGrid(db, running.id);
}

export async function startGrid(db: SQLiteDatabase, gridId: string) {
  const grid = await db.getFirstAsync<{ size: keyof typeof SIZES; cols: number; rows: number }>(
    'SELECT size, cols, rows FROM grids WHERE id = ?', gridId,
  );
  if (!grid) throw new Error('grid not found');
  const now = nowIso();
  const userGridId = newId();
  const revealed = new Set(startingSquares(grid.size));
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'INSERT INTO user_grids (id, grid_id, freebies_left, started_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      userGridId, gridId, SIZES[grid.size].freebies, now, now,
    );
    for (let i = 0; i < grid.cols * grid.rows; i++) {
      await db.runAsync(
        'INSERT INTO square_states (id, user_grid_id, idx, state, updated_at) VALUES (?, ?, ?, ?, ?)',
        newId(), userGridId, i, revealed.has(i) ? 'revealed' : 'hidden', now,
      );
    }
  });
  return userGridId;
}
