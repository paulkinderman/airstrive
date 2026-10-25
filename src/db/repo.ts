import type { SQLiteDatabase } from 'expo-sqlite';
import { neighbours } from '@/data/types';
import { newId, nowIso } from '@/lib/ids';

export type SquareState = 'hidden' | 'revealed' | 'done';

export interface ShelfGrid {
  userGridId: string;
  gridId: string;
  title: string;
  color: string;
  cols: number;
  rows: number;
  done: number;
  revealed: number;
  total: number;
  freebiesLeft: number;
  completedAt: string | null;
  states: SquareState[];
}

export interface BoardSquare {
  squareStateId: string;
  idx: number;
  state: SquareState;
  prompt: string;
  hint: string;
  cluster: string;
  viaFreebie: boolean;
  momentId: string | null;
  coverUri: string | null;
  photoUris: string[];
}

export interface Moment {
  id: string;
  squareStateId: string;
  title: string;
  body: string;
  happenedOn: string;
  place: string;
  weather: string;
  withPeople: string;
  gridTitle: string;
  gridColor: string;
  prompt: string;
  photos: { id: string; uri: string; isCover: boolean }[];
}

export interface Suggestion {
  squareStateId: string;
  prompt: string;
  gridTitle: string;
  gridColor: string;
}

// ---------- shelf ----------

export async function listShelf(db: SQLiteDatabase): Promise<ShelfGrid[]> {
  const grids = await db.getAllAsync<{
    user_grid_id: string; grid_id: string; title: string; color: string; cols: number; rows: number;
    freebies_left: number; completed_at: string | null;
  }>(`SELECT ug.id AS user_grid_id, g.id AS grid_id, g.title, g.color, g.cols, g.rows,
             ug.freebies_left, ug.completed_at
      FROM user_grids ug JOIN grids g ON g.id = ug.grid_id
      ORDER BY ug.started_at DESC`);
  const out: ShelfGrid[] = [];
  for (const g of grids) {
    const rows = await db.getAllAsync<{ idx: number; state: SquareState }>(
      'SELECT idx, state FROM square_states WHERE user_grid_id = ? ORDER BY idx', g.user_grid_id,
    );
    const states = rows.map((r) => r.state);
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
  const rows = await db.getAllAsync<{ id: string; prompt: string; title: string; color: string }>(
    `SELECT ss.id, gs.prompt, g.title, g.color
     FROM square_states ss
     JOIN user_grids ug ON ug.id = ss.user_grid_id
     JOIN grids g ON g.id = ug.grid_id
     JOIN grid_squares gs ON gs.grid_id = g.id AND gs.idx = ss.idx
     WHERE ss.state = 'revealed'
     ORDER BY ss.updated_at DESC
     LIMIT ?`, limit,
  );
  return rows.map((r) => ({ squareStateId: r.id, prompt: r.prompt, gridTitle: r.title, gridColor: r.color }));
}

// ---------- board ----------

export async function loadBoard(db: SQLiteDatabase, userGridId: string) {
  const header = await db.getFirstAsync<{
    title: string; color: string; cols: number; rows: number; freebies_left: number; completed_at: string | null; description: string;
  }>(`SELECT g.title, g.color, g.cols, g.rows, g.description, ug.freebies_left, ug.completed_at
      FROM user_grids ug JOIN grids g ON g.id = ug.grid_id WHERE ug.id = ?`, userGridId);
  if (!header) return null;

  const rows = await db.getAllAsync<{
    id: string; idx: number; state: SquareState; via_freebie: number;
    prompt: string; hint: string; cluster: string; moment_id: string | null;
  }>(`SELECT ss.id, ss.idx, ss.state, ss.via_freebie, gs.prompt, gs.hint, gs.cluster, m.id AS moment_id
      FROM square_states ss
      JOIN user_grids ug ON ug.id = ss.user_grid_id
      JOIN grid_squares gs ON gs.grid_id = ug.grid_id AND gs.idx = ss.idx
      LEFT JOIN moments m ON m.square_state_id = ss.id
      WHERE ss.user_grid_id = ?
      ORDER BY ss.idx`, userGridId);

  const photos = await db.getAllAsync<{ moment_id: string; local_uri: string; is_cover: number }>(
    `SELECT p.moment_id, p.local_uri, p.is_cover
     FROM photos p JOIN moments m ON m.id = p.moment_id
     JOIN square_states ss ON ss.id = m.square_state_id
     WHERE ss.user_grid_id = ? ORDER BY p.is_cover DESC, p.position`, userGridId,
  );
  const byMoment = new Map<string, string[]>();
  for (const p of photos) {
    const list = byMoment.get(p.moment_id) ?? [];
    list.push(p.local_uri);
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

async function revealNeighbours(db: SQLiteDatabase, userGridId: string, idx: number) {
  const g = await db.getFirstAsync<{ cols: number; rows: number }>(
    'SELECT g.cols, g.rows FROM user_grids ug JOIN grids g ON g.id = ug.grid_id WHERE ug.id = ?', userGridId,
  );
  if (!g) return;
  const now = nowIso();
  for (const n of neighbours(idx, g.cols, g.rows)) {
    await db.runAsync(
      `UPDATE square_states SET state = 'revealed', updated_at = ?
       WHERE user_grid_id = ? AND idx = ? AND state = 'hidden'`, now, userGridId, n,
    );
  }
}

async function checkComplete(db: SQLiteDatabase, userGridId: string) {
  const left = await db.getFirstAsync<{ n: number }>(
    "SELECT COUNT(*) AS n FROM square_states WHERE user_grid_id = ? AND state != 'done'", userGridId,
  );
  const now = nowIso();
  if (left && left.n === 0) {
    await db.runAsync('UPDATE user_grids SET completed_at = COALESCE(completed_at, ?), updated_at = ? WHERE id = ?', now, now, userGridId);
  } else {
    await db.runAsync('UPDATE user_grids SET completed_at = NULL, updated_at = ? WHERE id = ?', now, userGridId);
  }
}

export async function useFreebie(db: SQLiteDatabase, squareStateId: string) {
  const sq = await db.getFirstAsync<{ user_grid_id: string; idx: number; state: SquareState; freebies_left: number }>(
    `SELECT ss.user_grid_id, ss.idx, ss.state, ug.freebies_left
     FROM square_states ss JOIN user_grids ug ON ug.id = ss.user_grid_id WHERE ss.id = ?`, squareStateId,
  );
  if (!sq || sq.state !== 'revealed' || sq.freebies_left < 1) return false;
  const now = nowIso();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      "UPDATE square_states SET state = 'done', done_at = ?, via_freebie = 1, updated_at = ? WHERE id = ?",
      now, now, squareStateId,
    );
    await db.runAsync('UPDATE user_grids SET freebies_left = freebies_left - 1, updated_at = ? WHERE id = ?', now, sq.user_grid_id);
    await revealNeighbours(db, sq.user_grid_id, sq.idx);
    await checkComplete(db, sq.user_grid_id);
  });
  return true;
}

// ---------- moments ----------

export interface MomentInput {
  title: string;
  body: string;
  happenedOn: string;
  place: string;
  weather: string;
  withPeople: string;
  photos: { uri: string; width: number; height: number; bytes: number }[];
  coverIndex: number;
}

export async function saveMoment(db: SQLiteDatabase, squareStateId: string, input: MomentInput) {
  const sq = await db.getFirstAsync<{ user_grid_id: string; idx: number }>(
    'SELECT user_grid_id, idx FROM square_states WHERE id = ?', squareStateId,
  );
  if (!sq) throw new Error('square not found');
  const now = nowIso();
  const existing = await db.getFirstAsync<{ id: string }>('SELECT id FROM moments WHERE square_state_id = ?', squareStateId);
  const momentId = existing?.id ?? newId();

  await db.withTransactionAsync(async () => {
    if (existing) {
      await db.runAsync(
        `UPDATE moments SET title = ?, body = ?, happened_on = ?, place = ?, weather = ?, with_people = ?, updated_at = ? WHERE id = ?`,
        input.title, input.body, input.happenedOn, input.place, input.weather, input.withPeople, now, momentId,
      );
      await db.runAsync('DELETE FROM photos WHERE moment_id = ?', momentId);
    } else {
      await db.runAsync(
        `INSERT INTO moments (id, square_state_id, title, body, happened_on, place, weather, with_people, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        momentId, squareStateId, input.title, input.body, input.happenedOn, input.place, input.weather, input.withPeople, now, now,
      );
    }
    for (let i = 0; i < input.photos.length; i++) {
      const p = input.photos[i];
      await db.runAsync(
        `INSERT INTO photos (id, moment_id, position, local_uri, is_cover, width, height, bytes, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        newId(), momentId, i, p.uri, i === input.coverIndex ? 1 : 0, p.width, p.height, p.bytes, now,
      );
    }
    await db.runAsync(
      "UPDATE square_states SET state = 'done', done_at = COALESCE(done_at, ?), via_freebie = 0, updated_at = ? WHERE id = ?",
      now, now, squareStateId,
    );
    await revealNeighbours(db, sq.user_grid_id, sq.idx);
    await checkComplete(db, sq.user_grid_id);
    await db.runAsync(
      "INSERT INTO sync_queue (tbl, row_id, op, payload, created_at) VALUES ('moments', ?, 'upsert', '{}', ?)", momentId, now,
    );
  });
  return momentId;
}

export async function deleteMoment(db: SQLiteDatabase, momentId: string) {
  const m = await db.getFirstAsync<{ square_state_id: string; user_grid_id: string }>(
    `SELECT m.square_state_id, ss.user_grid_id FROM moments m JOIN square_states ss ON ss.id = m.square_state_id WHERE m.id = ?`, momentId,
  );
  if (!m) return;
  const now = nowIso();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM moments WHERE id = ?', momentId);
    await db.runAsync(
      "UPDATE square_states SET state = 'revealed', done_at = NULL, via_freebie = 0, updated_at = ? WHERE id = ?", now, m.square_state_id,
    );
    await checkComplete(db, m.user_grid_id);
    await db.runAsync(
      "INSERT INTO sync_queue (tbl, row_id, op, payload, created_at) VALUES ('moments', ?, 'delete', '{}', ?)", momentId, now,
    );
  });
}

const MOMENT_SELECT = `
  SELECT m.id, m.square_state_id, m.title, m.body, m.happened_on, m.place, m.weather, m.with_people,
         g.title AS grid_title, g.color AS grid_color, gs.prompt
  FROM moments m
  JOIN square_states ss ON ss.id = m.square_state_id
  JOIN user_grids ug ON ug.id = ss.user_grid_id
  JOIN grids g ON g.id = ug.grid_id
  JOIN grid_squares gs ON gs.grid_id = g.id AND gs.idx = ss.idx`;

type MomentRow = {
  id: string; square_state_id: string; title: string; body: string; happened_on: string;
  place: string; weather: string; with_people: string; grid_title: string; grid_color: string; prompt: string;
};

async function hydrate(db: SQLiteDatabase, rows: MomentRow[]): Promise<Moment[]> {
  const out: Moment[] = [];
  for (const r of rows) {
    const photos = await db.getAllAsync<{ id: string; local_uri: string; is_cover: number }>(
      'SELECT id, local_uri, is_cover FROM photos WHERE moment_id = ? ORDER BY position', r.id,
    );
    out.push({
      id: r.id,
      squareStateId: r.square_state_id,
      title: r.title,
      body: r.body,
      happenedOn: r.happened_on,
      place: r.place,
      weather: r.weather,
      withPeople: r.with_people,
      gridTitle: r.grid_title,
      gridColor: r.grid_color,
      prompt: r.prompt,
      photos: photos.map((p) => ({ id: p.id, uri: p.local_uri, isCover: p.is_cover === 1 })),
    });
  }
  return out;
}

export async function listMoments(db: SQLiteDatabase): Promise<Moment[]> {
  const rows = await db.getAllAsync<MomentRow>(`${MOMENT_SELECT} ORDER BY m.happened_on DESC, m.created_at DESC`);
  return hydrate(db, rows);
}

export async function getMoment(db: SQLiteDatabase, momentId: string): Promise<Moment | null> {
  const rows = await db.getAllAsync<MomentRow>(`${MOMENT_SELECT} WHERE m.id = ?`, momentId);
  const [m] = await hydrate(db, rows);
  return m ?? null;
}

export async function getMomentForSquare(db: SQLiteDatabase, squareStateId: string): Promise<Moment | null> {
  const rows = await db.getAllAsync<MomentRow>(`${MOMENT_SELECT} WHERE m.square_state_id = ?`, squareStateId);
  const [m] = await hydrate(db, rows);
  return m ?? null;
}

export async function getSquarePrompt(db: SQLiteDatabase, squareStateId: string) {
  return db.getFirstAsync<{ prompt: string; hint: string; idx: number; title: string; color: string; user_grid_id: string }>(
    `SELECT gs.prompt, gs.hint, ss.idx, g.title, g.color, ss.user_grid_id
     FROM square_states ss
     JOIN user_grids ug ON ug.id = ss.user_grid_id
     JOIN grids g ON g.id = ug.grid_id
     JOIN grid_squares gs ON gs.grid_id = g.id AND gs.idx = ss.idx
     WHERE ss.id = ?`, squareStateId,
  );
}
