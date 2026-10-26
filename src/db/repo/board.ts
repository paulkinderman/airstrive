import type { SQLiteDatabase } from 'expo-sqlite';
import { neighbours } from '@/data/types';
import { nowIso } from '@/lib/ids';
import { photoUri } from '@/lib/files';
import { asAudience } from '@/friends/audience';
import { markDirty } from '../queue';
import type { BoardSquare, SquareState, WriteResult } from './types';

export async function loadBoard(db: SQLiteDatabase, userGridId: string) {
  const header = await db.getFirstAsync<{
    title: string; color: string; cols: number; rows: number; freebies_left: number; completed_at: string | null; description: string;
    grid_id: string; author_id: string | null; is_public: number; is_official: number; audience: string;
  }>(`SELECT g.title, g.color, g.cols, g.rows, g.description, ug.freebies_left, ug.completed_at,
             g.id AS grid_id, g.author_id, g.is_public, g.is_official, ug.audience
      FROM user_grids ug JOIN grids g ON g.id = ug.grid_id WHERE ug.id = ? AND ug.deleted_at IS NULL`, userGridId);
  if (!header) return null;

  const rows = await db.getAllAsync<{
    id: string; idx: number; state: SquareState; via_freebie: number;
    prompt: string; hint: string; cluster: string; moment_id: string | null;
  }>(`SELECT ss.id, ss.idx, ss.state, ss.via_freebie, gs.prompt, gs.hint, gs.cluster, m.id AS moment_id
      FROM square_states ss
      JOIN user_grids ug ON ug.id = ss.user_grid_id
      JOIN grid_squares gs ON gs.grid_id = ug.grid_id AND gs.idx = ss.idx
      LEFT JOIN moments m ON m.square_state_id = ss.id AND m.deleted_at IS NULL
      WHERE ss.user_grid_id = ? AND ss.deleted_at IS NULL
      ORDER BY ss.idx`, userGridId);

  const photos = await db.getAllAsync<{ moment_id: string; local_uri: string }>(
    `SELECT p.moment_id, p.local_uri
     FROM photos p JOIN moments m ON m.id = p.moment_id
     JOIN square_states ss ON ss.id = m.square_state_id
     WHERE ss.user_grid_id = ? AND p.deleted_at IS NULL AND m.deleted_at IS NULL AND p.local_uri != ''
     ORDER BY p.is_cover DESC, p.position`, userGridId,
  );
  const byMoment = new Map<string, string[]>();
  for (const p of photos) {
    const list = byMoment.get(p.moment_id) ?? [];
    list.push(photoUri(p.local_uri));
    byMoment.set(p.moment_id, list);
  }

  const squares: BoardSquare[] = rows.map((r) => {
    const uris = r.moment_id ? byMoment.get(r.moment_id) ?? [] : [];
    return {
      squareStateId: r.id,
      idx: r.idx,
      state: r.state,
      prompt: r.prompt,
      hint: r.hint,
      cluster: r.cluster,
      viaFreebie: r.via_freebie === 1,
      momentId: r.moment_id,
      coverUri: uris[0] ?? null,
      photoUris: uris,
    };
  });

  return {
    gridId: header.grid_id,
    authorId: header.author_id,
    isPublic: header.is_public === 1,
    isOfficial: header.is_official === 1,
    audience: asAudience(header.audience),
    title: header.title,
    color: header.color,
    cols: header.cols,
    rows: header.rows,
    description: header.description,
    freebiesLeft: header.freebies_left,
    completedAt: header.completed_at,
    squares,
  };
}

export async function revealNeighbours(db: SQLiteDatabase, userGridId: string, idx: number) {
  const g = await db.getFirstAsync<{ cols: number; rows: number }>(
    'SELECT g.cols, g.rows FROM user_grids ug JOIN grids g ON g.id = ug.grid_id WHERE ug.id = ?', userGridId,
  );
  if (!g) return;
  const now = nowIso();
  for (const n of neighbours(idx, g.cols, g.rows)) {
    const hidden = await db.getFirstAsync<{ id: string }>(
      "SELECT id FROM square_states WHERE user_grid_id = ? AND idx = ? AND state = 'hidden'", userGridId, n,
    );
    if (!hidden) continue;
    await db.runAsync("UPDATE square_states SET state = 'revealed', updated_at = ? WHERE id = ?", now, hidden.id);
    await markDirty(db, 'square_states', hidden.id);
  }
}

/** Sets or clears completed_at. Returns true when this call finished the grid. */
export async function checkComplete(db: SQLiteDatabase, userGridId: string): Promise<boolean> {
  const left = await db.getFirstAsync<{ n: number }>(
    "SELECT COUNT(*) AS n FROM square_states WHERE user_grid_id = ? AND state != 'done' AND deleted_at IS NULL", userGridId,
  );
  const ug = await db.getFirstAsync<{ completed_at: string | null }>('SELECT completed_at FROM user_grids WHERE id = ?', userGridId);
  if (!left || !ug) return false;
  const complete = left.n === 0;
  if (complete === (ug.completed_at !== null)) return false;
  const now = nowIso();
  await db.runAsync('UPDATE user_grids SET completed_at = ?, updated_at = ? WHERE id = ?', complete ? now : null, now, userGridId);
  await markDirty(db, 'user_grids', userGridId);
  return complete;
}

export async function spendFreebie(db: SQLiteDatabase, squareStateId: string): Promise<WriteResult | null> {
  const sq = await db.getFirstAsync<{ user_grid_id: string; idx: number; state: SquareState; freebies_left: number }>(
    `SELECT ss.user_grid_id, ss.idx, ss.state, ug.freebies_left
     FROM square_states ss JOIN user_grids ug ON ug.id = ss.user_grid_id WHERE ss.id = ?`, squareStateId,
  );
  if (!sq || sq.state !== 'revealed' || sq.freebies_left < 1) return null;
  const now = nowIso();
  let completed = false;
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      "UPDATE square_states SET state = 'done', done_at = ?, via_freebie = 1, updated_at = ? WHERE id = ?",
      now, now, squareStateId,
    );
    await markDirty(db, 'square_states', squareStateId);
    await db.runAsync('UPDATE user_grids SET freebies_left = freebies_left - 1, updated_at = ? WHERE id = ?', now, sq.user_grid_id);
    await markDirty(db, 'user_grids', sq.user_grid_id);
    await revealNeighbours(db, sq.user_grid_id, sq.idx);
    completed = await checkComplete(db, sq.user_grid_id);
  });
  return { completedGrid: completed ? sq.user_grid_id : null, removedFiles: [] };
}
