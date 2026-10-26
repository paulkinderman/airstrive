import type { SQLiteDatabase } from 'expo-sqlite';
import type { ShelfGrid, SquareState, Suggestion } from './types';

export async function listShelf(db: SQLiteDatabase): Promise<ShelfGrid[]> {
  const grids = await db.getAllAsync<{
    user_grid_id: string; grid_id: string; title: string; color: string; cols: number; rows: number;
    freebies_left: number; completed_at: string | null;
  }>(`SELECT ug.id AS user_grid_id, g.id AS grid_id, g.title, g.color, g.cols, g.rows,
             ug.freebies_left, ug.completed_at
      FROM user_grids ug JOIN grids g ON g.id = ug.grid_id
      WHERE ug.deleted_at IS NULL
      ORDER BY ug.completed_at IS NOT NULL, ug.started_at DESC`);
  // Every square on the shelf in one query, rather than one query per grid.
  const squares = await db.getAllAsync<{ user_grid_id: string; state: SquareState }>(
    `SELECT ss.user_grid_id, ss.state FROM square_states ss
     JOIN user_grids ug ON ug.id = ss.user_grid_id
     WHERE ss.deleted_at IS NULL AND ug.deleted_at IS NULL
     ORDER BY ss.user_grid_id, ss.idx`,
  );
  const statesOf = new Map<string, SquareState[]>();
  for (const sq of squares) {
    const list = statesOf.get(sq.user_grid_id);
    if (list) list.push(sq.state);
    else statesOf.set(sq.user_grid_id, [sq.state]);
  }
  const out: ShelfGrid[] = [];
  for (const g of grids) {
    const states = statesOf.get(g.user_grid_id) ?? [];
    out.push({
      userGridId: g.user_grid_id,
      gridId: g.grid_id,
      title: g.title,
      color: g.color,
      cols: g.cols,
      rows: g.rows,
      total: states.length,
      done: states.filter((s) => s === 'done').length,
      revealed: states.filter((s) => s === 'revealed').length,
      freebiesLeft: g.freebies_left,
      completedAt: g.completed_at,
      states,
    });
  }
  return out;
}

export async function listSuggestions(db: SQLiteDatabase, limit = 8): Promise<Suggestion[]> {
  // One revealed square from each grid first, so the strip isn't all one grid.
  const rows = await db.getAllAsync<{ id: string; user_grid_id: string; prompt: string; title: string; color: string; rn: number }>(
    `SELECT * FROM (
       SELECT ss.id, ss.user_grid_id, gs.prompt, g.title, g.color,
              ROW_NUMBER() OVER (PARTITION BY ss.user_grid_id ORDER BY ss.updated_at DESC, ss.idx) AS rn
       FROM square_states ss
       JOIN user_grids ug ON ug.id = ss.user_grid_id
       JOIN grids g ON g.id = ug.grid_id
       JOIN grid_squares gs ON gs.grid_id = g.id AND gs.idx = ss.idx
       WHERE ss.state = 'revealed' AND ss.deleted_at IS NULL AND ug.deleted_at IS NULL
     ) ORDER BY rn, title LIMIT ?`, limit,
  );
  return rows.map((r) => ({ squareStateId: r.id, userGridId: r.user_grid_id, prompt: r.prompt, gridTitle: r.title, gridColor: r.color }));
}
