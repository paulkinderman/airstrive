import type { SQLiteDatabase } from 'expo-sqlite';
import { neighbours } from '@/data/types';
import { newId, nowIso } from '@/lib/ids';
import { photoUri } from '@/lib/files';
import { markDirty } from './queue';

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

export interface MomentPhoto { id: string; uri: string; path: string; isCover: boolean; width: number; height: number }

export interface Moment {
  id: string;
  squareStateId: string;
  userGridId: string;
  title: string;
  body: string;
  happenedOn: string;
  place: string;
  weather: string;
  withPeople: string;
  gridTitle: string;
  gridColor: string;
  prompt: string;
  photos: MomentPhoto[];
}

export interface Suggestion {
  squareStateId: string;
  userGridId: string;
  prompt: string;
  gridTitle: string;
  gridColor: string;
}

/** Saving or removing a moment can finish a grid or leave photo files to clean up. */
export interface WriteResult {
  completedGrid: string | null;
  removedFiles: string[];
}

// ---------- shelf ----------

export async function listShelf(db: SQLiteDatabase): Promise<ShelfGrid[]> {
  const grids = await db.getAllAsync<{
    user_grid_id: string; grid_id: string; title: string; color: string; cols: number; rows: number;
    freebies_left: number; completed_at: string | null;
  }>(`SELECT ug.id AS user_grid_id, g.id AS grid_id, g.title, g.color, g.cols, g.rows,
             ug.freebies_left, ug.completed_at
      FROM user_grids ug JOIN grids g ON g.id = ug.grid_id
      WHERE ug.deleted_at IS NULL
      ORDER BY ug.completed_at IS NOT NULL, ug.started_at DESC`);
  const out: ShelfGrid[] = [];
  for (const g of grids) {
    const rows = await db.getAllAsync<{ idx: number; state: SquareState }>(
      'SELECT idx, state FROM square_states WHERE user_grid_id = ? AND deleted_at IS NULL ORDER BY idx', g.user_grid_id,
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

// ---------- board ----------

export async function loadBoard(db: SQLiteDatabase, userGridId: string) {
  const header = await db.getFirstAsync<{
    title: string; color: string; cols: number; rows: number; freebies_left: number; completed_at: string | null; description: string;
  }>(`SELECT g.title, g.color, g.cols, g.rows, g.description, ug.freebies_left, ug.completed_at
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

// ---------- moments ----------

export interface MomentInput {
  title: string;
  body: string;
  happenedOn: string;
  place: string;
  weather: string;
  withPeople: string;
  /** Existing photos keep their id; new ones have none. `path` is relative to the documents folder. */
  photos: { id?: string; path: string; width: number; height: number; bytes: number }[];
  coverIndex: number;
}

export async function saveMoment(db: SQLiteDatabase, squareStateId: string, input: MomentInput): Promise<WriteResult & { momentId: string }> {
  const sq = await db.getFirstAsync<{ user_grid_id: string; idx: number }>(
    'SELECT user_grid_id, idx FROM square_states WHERE id = ?', squareStateId,
  );
  if (!sq) throw new Error('square not found');
  const now = nowIso();
  const existing = await db.getFirstAsync<{ id: string }>(
    'SELECT id FROM moments WHERE square_state_id = ? AND deleted_at IS NULL', squareStateId,
  );
  const momentId = existing?.id ?? newId();
  const removedFiles: string[] = [];
  let completed = false;

  await db.withTransactionAsync(async () => {
    if (existing) {
      await db.runAsync(
        `UPDATE moments SET title = ?, body = ?, happened_on = ?, place = ?, weather = ?, with_people = ?, updated_at = ? WHERE id = ?`,
        input.title, input.body, input.happenedOn, input.place, input.weather, input.withPeople, now, momentId,
      );
    } else {
      await db.runAsync(
        `INSERT INTO moments (id, square_state_id, title, body, happened_on, place, weather, with_people, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        momentId, squareStateId, input.title, input.body, input.happenedOn, input.place, input.weather, input.withPeople, now, now,
      );
    }
    await markDirty(db, 'moments', momentId);

    // Photos keep their ids across edits so nothing is uploaded twice.
    const before = await db.getAllAsync<{ id: string; local_uri: string; position: number; is_cover: number }>(
      'SELECT id, local_uri, position, is_cover FROM photos WHERE moment_id = ? AND deleted_at IS NULL', momentId,
    );
    const kept = new Set(input.photos.map((p) => p.id).filter(Boolean));
    for (const p of before) {
      if (kept.has(p.id)) continue;
      await db.runAsync('UPDATE photos SET deleted_at = ?, updated_at = ? WHERE id = ?', now, now, p.id);
      await markDirty(db, 'photos', p.id);
      if (p.local_uri) removedFiles.push(p.local_uri);
    }
    for (let i = 0; i < input.photos.length; i++) {
      const p = input.photos[i];
      const isCover = i === input.coverIndex ? 1 : 0;
      if (p.id) {
        const old = before.find((b) => b.id === p.id);
        if (old && old.position === i && old.is_cover === isCover) continue;
        await db.runAsync('UPDATE photos SET position = ?, is_cover = ?, updated_at = ? WHERE id = ?', i, isCover, now, p.id);
        await markDirty(db, 'photos', p.id);
      } else {
        const id = newId();
        await db.runAsync(
          `INSERT INTO photos (id, moment_id, position, local_uri, is_cover, width, height, bytes, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          id, momentId, i, p.path, isCover, p.width, p.height, p.bytes, now, now,
        );
        await markDirty(db, 'photos', id);
      }
    }

    const state = await db.getFirstAsync<{ state: SquareState; via_freebie: number }>(
      'SELECT state, via_freebie FROM square_states WHERE id = ?', squareStateId,
    );
    if (state?.state !== 'done' || state.via_freebie === 1) {
      await db.runAsync(
        "UPDATE square_states SET state = 'done', done_at = COALESCE(done_at, ?), via_freebie = 0, updated_at = ? WHERE id = ?",
        now, now, squareStateId,
      );
      await markDirty(db, 'square_states', squareStateId);
    }
    await revealNeighbours(db, sq.user_grid_id, sq.idx);
    completed = await checkComplete(db, sq.user_grid_id);
  });
  return { momentId, completedGrid: completed ? sq.user_grid_id : null, removedFiles };
}

export async function deleteMoment(db: SQLiteDatabase, momentId: string): Promise<WriteResult> {
  const m = await db.getFirstAsync<{ square_state_id: string; user_grid_id: string }>(
    `SELECT m.square_state_id, ss.user_grid_id FROM moments m JOIN square_states ss ON ss.id = m.square_state_id
     WHERE m.id = ? AND m.deleted_at IS NULL`, momentId,
  );
  if (!m) return { completedGrid: null, removedFiles: [] };
  const now = nowIso();
  const removedFiles: string[] = [];
  await db.withTransactionAsync(async () => {
    const photos = await db.getAllAsync<{ id: string; local_uri: string }>(
      'SELECT id, local_uri FROM photos WHERE moment_id = ? AND deleted_at IS NULL', momentId,
    );
    for (const p of photos) {
      await db.runAsync('UPDATE photos SET deleted_at = ?, updated_at = ? WHERE id = ?', now, now, p.id);
      await markDirty(db, 'photos', p.id);
      if (p.local_uri) removedFiles.push(p.local_uri);
    }
    await db.runAsync('UPDATE moments SET deleted_at = ?, updated_at = ? WHERE id = ?', now, now, momentId);
    await markDirty(db, 'moments', momentId);
    await db.runAsync(
      "UPDATE square_states SET state = 'revealed', done_at = NULL, via_freebie = 0, updated_at = ? WHERE id = ?", now, m.square_state_id,
    );
    await markDirty(db, 'square_states', m.square_state_id);
    await checkComplete(db, m.user_grid_id);
  });
  return { completedGrid: null, removedFiles };
}

const MOMENT_SELECT = `
  SELECT m.id, m.square_state_id, ss.user_grid_id, m.title, m.body, m.happened_on, m.place, m.weather, m.with_people,
         g.title AS grid_title, g.color AS grid_color, gs.prompt
  FROM moments m
  JOIN square_states ss ON ss.id = m.square_state_id
  JOIN user_grids ug ON ug.id = ss.user_grid_id
  JOIN grids g ON g.id = ug.grid_id
  JOIN grid_squares gs ON gs.grid_id = g.id AND gs.idx = ss.idx
  WHERE m.deleted_at IS NULL AND ug.deleted_at IS NULL`;

type MomentRow = {
  id: string; square_state_id: string; user_grid_id: string; title: string; body: string; happened_on: string;
  place: string; weather: string; with_people: string; grid_title: string; grid_color: string; prompt: string;
};

async function hydrate(db: SQLiteDatabase, rows: MomentRow[]): Promise<Moment[]> {
  const out: Moment[] = [];
  for (const r of rows) {
    const photos = await db.getAllAsync<{ id: string; local_uri: string; is_cover: number; width: number; height: number }>(
      `SELECT id, local_uri, is_cover, width, height FROM photos
       WHERE moment_id = ? AND deleted_at IS NULL AND local_uri != '' ORDER BY position`, r.id,
    );
    out.push({
      id: r.id,
      squareStateId: r.square_state_id,
      userGridId: r.user_grid_id,
      title: r.title,
      body: r.body,
      happenedOn: r.happened_on,
      place: r.place,
      weather: r.weather,
      withPeople: r.with_people,
      gridTitle: r.grid_title,
      gridColor: r.grid_color,
      prompt: r.prompt,
      photos: photos.map((p) => ({
        id: p.id, uri: photoUri(p.local_uri), path: p.local_uri, isCover: p.is_cover === 1, width: p.width, height: p.height,
      })),
    });
  }
  return out;
}

export async function listMoments(db: SQLiteDatabase): Promise<Moment[]> {
  const rows = await db.getAllAsync<MomentRow>(`${MOMENT_SELECT} ORDER BY m.happened_on DESC, m.created_at DESC`);
  return hydrate(db, rows);
}

export async function getMoment(db: SQLiteDatabase, momentId: string): Promise<Moment | null> {
  const rows = await db.getAllAsync<MomentRow>(`${MOMENT_SELECT} AND m.id = ?`, momentId);
  const [m] = await hydrate(db, rows);
  return m ?? null;
}

export async function getMomentForSquare(db: SQLiteDatabase, squareStateId: string): Promise<Moment | null> {
  const rows = await db.getAllAsync<MomentRow>(`${MOMENT_SELECT} AND m.square_state_id = ?`, squareStateId);
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

// ---------- Memory Lane pages ----------

export interface Chapter {
  userGridId: string;
  gridTitle: string;
  gridColor: string;
  cols: number;
  rows: number;
  completedAt: string;
  /** YYYY-MM-DD in local time, for ordering among moment pages. */
  completedOn: string;
  momentCount: number;
  firstOn: string | null;
  lastOn: string | null;
  /** One entry per square in index order: a cover photo, or null for a freebie or a photo-less moment. */
  tiles: (string | null)[];
}

export type Page =
  | { kind: 'moment'; key: string; date: string; moment: Moment }
  | { kind: 'chapter'; key: string; date: string; chapter: Chapter };

function localDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export async function getChapter(db: SQLiteDatabase, userGridId: string): Promise<Chapter | null> {
  const g = await db.getFirstAsync<{ title: string; color: string; cols: number; rows: number; completed_at: string | null }>(
    `SELECT g.title, g.color, g.cols, g.rows, ug.completed_at FROM user_grids ug JOIN grids g ON g.id = ug.grid_id
     WHERE ug.id = ? AND ug.deleted_at IS NULL`, userGridId,
  );
  if (!g?.completed_at) return null;
  const squares = await db.getAllAsync<{ idx: number; moment_id: string | null; happened_on: string | null; cover: string | null }>(
    `SELECT ss.idx, m.id AS moment_id, m.happened_on,
            (SELECT p.local_uri FROM photos p WHERE p.moment_id = m.id AND p.deleted_at IS NULL AND p.local_uri != ''
             ORDER BY p.is_cover DESC, p.position LIMIT 1) AS cover
     FROM square_states ss
     LEFT JOIN moments m ON m.square_state_id = ss.id AND m.deleted_at IS NULL
     WHERE ss.user_grid_id = ? AND ss.deleted_at IS NULL ORDER BY ss.idx`, userGridId,
  );
  const dates = squares.map((s) => s.happened_on).filter((d): d is string => !!d).sort();
  return {
    userGridId,
    gridTitle: g.title,
    gridColor: g.color,
    cols: g.cols,
    rows: g.rows,
    completedAt: g.completed_at,
    completedOn: localDate(g.completed_at),
    momentCount: squares.filter((s) => s.moment_id).length,
    firstOn: dates[0] ?? null,
    lastOn: dates[dates.length - 1] ?? null,
    tiles: squares.map((s) => (s.cover ? photoUri(s.cover) : null)),
  };
}

/** Every page in the scrapbook, newest first. A finished grid's chapter cover follows its last moment. */
export async function listPages(db: SQLiteDatabase): Promise<Page[]> {
  const moments = await listMoments(db);
  const done = await db.getAllAsync<{ id: string }>(
    'SELECT id FROM user_grids WHERE completed_at IS NOT NULL AND deleted_at IS NULL',
  );
  const pages: Page[] = moments.map((m) => ({ kind: 'moment', key: m.id, date: m.happenedOn, moment: m }));
  for (const { id } of done) {
    const chapter = await getChapter(db, id);
    if (chapter) pages.push({ kind: 'chapter', key: `chapter:${id}`, date: chapter.completedOn, chapter });
  }
  // Same day: the chapter sits on top of the moments that finished it.
  return pages.sort((a, b) => (a.date === b.date ? (a.kind === 'chapter' ? -1 : b.kind === 'chapter' ? 1 : 0) : a.date < b.date ? 1 : -1));
}
