import type { SQLiteDatabase } from 'expo-sqlite';
import { newId, nowIso } from '@/lib/ids';
import { photoUri } from '@/lib/files';
import { asAudience, narrower, type Audience } from '@/friends/audience';
import { markDirty } from '../queue';
import { checkComplete, revealNeighbours } from './board';
import type { Moment, SquareState, WriteResult } from './types';

export interface MomentInput {
  title: string;
  body: string;
  happenedOn: string;
  place: string;
  weather: string;
  withPeople: string;
  /** Left out, a new moment fills with the grid's color and an edit keeps its fill. */
  fill?: string;
  /** Left out, a new moment takes its grid's audience and an edit keeps the moment's own. */
  audience?: Audience;
  /** Existing photos keep their id; new ones have none. `path` is relative to the documents folder. */
  photos: { id?: string; path: string; width: number; height: number; bytes: number }[];
  coverIndex: number;
}

export async function saveMoment(db: SQLiteDatabase, squareStateId: string, input: MomentInput): Promise<WriteResult & { momentId: string }> {
  const sq = await db.getFirstAsync<{ user_grid_id: string; idx: number; grid_audience: string }>(
    `SELECT ss.user_grid_id, ss.idx, ug.audience AS grid_audience
     FROM square_states ss JOIN user_grids ug ON ug.id = ss.user_grid_id WHERE ss.id = ?`, squareStateId,
  );
  if (!sq) throw new Error('square not found');
  const now = nowIso();
  const existing = await db.getFirstAsync<{ id: string; audience: string; fill: string }>(
    'SELECT id, audience, fill FROM moments WHERE square_state_id = ? AND deleted_at IS NULL', squareStateId,
  );
  const gridAudience = asAudience(sq.grid_audience);
  const audience = narrower(input.audience ?? (existing ? asAudience(existing.audience) : gridAudience), gridAudience);
  const fill = (input.fill ?? existing?.fill ?? '').trim().slice(0, 16);
  const momentId = existing?.id ?? newId();
  const removedFiles: string[] = [];
  let completed = false;

  await db.withTransactionAsync(async () => {
    if (existing) {
      await db.runAsync(
        `UPDATE moments SET title = ?, body = ?, happened_on = ?, place = ?, weather = ?, with_people = ?, audience = ?, fill = ?, updated_at = ? WHERE id = ?`,
        input.title, input.body, input.happenedOn, input.place, input.weather, input.withPeople, audience, fill, now, momentId,
      );
    } else {
      await db.runAsync(
        `INSERT INTO moments (id, square_state_id, title, body, happened_on, place, weather, with_people, audience, fill, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        momentId, squareStateId, input.title, input.body, input.happenedOn, input.place, input.weather, input.withPeople, audience, fill, now, now,
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

// A group moment's words are in its entries; the first one stands in for the body here.
const MOMENT_SELECT = `
  SELECT m.id, m.square_state_id, ss.user_grid_id, m.title, m.happened_on, m.place, m.weather, m.with_people, m.fill, m.group_id,
         CASE WHEN m.group_id IS NULL THEN m.body ELSE COALESCE((
           SELECT e.body FROM moment_entries e WHERE e.moment_id = m.id AND e.deleted_at IS NULL AND e.body != ''
           ORDER BY e.created_at LIMIT 1), '') END AS body,
         m.audience, ug.audience AS grid_audience, g.title AS grid_title, g.color AS grid_color, gs.prompt
  FROM moments m
  JOIN square_states ss ON ss.id = m.square_state_id
  JOIN user_grids ug ON ug.id = ss.user_grid_id
  JOIN grids g ON g.id = ug.grid_id
  JOIN grid_squares gs ON gs.grid_id = g.id AND gs.idx = ss.idx
  WHERE m.deleted_at IS NULL AND ug.deleted_at IS NULL`;

type MomentRow = {
  id: string; square_state_id: string; user_grid_id: string; title: string; body: string; happened_on: string;
  place: string; weather: string; with_people: string; fill: string; audience: string; grid_audience: string; group_id: string | null;
  grid_title: string; grid_color: string; prompt: string;
};

async function hydrate(db: SQLiteDatabase, rows: MomentRow[]): Promise<Moment[]> {
  const out: Moment[] = [];
  const me = rows.some((r) => r.group_id)
    ? (await db.getFirstAsync<{ value: string }>("SELECT value FROM meta WHERE key = 'owner'"))?.value ?? null
    : null;
  for (const r of rows) {
    const entries = r.group_id
      ? await db.getAllAsync<{ user_id: string | null; body: string; username: string | null }>(
        `SELECT e.user_id, e.body, gp.username FROM moment_entries e
         LEFT JOIN group_people gp ON gp.group_id = e.group_id AND gp.user_id = e.user_id
         WHERE e.moment_id = ? AND e.deleted_at IS NULL AND e.body != '' ORDER BY e.created_at`, r.id,
      )
      : [];
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
      fill: r.fill,
      groupId: r.group_id,
      entries: entries.map((e) => ({
        userId: e.user_id, name: e.user_id && e.user_id === me ? 'You' : e.username ?? 'A former member', body: e.body, mine: !!me && e.user_id === me,
      })),
      audience: narrower(asAudience(r.audience), asAudience(r.grid_audience)),
      gridAudience: asAudience(r.grid_audience),
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

/** The newest moments logged, newest first, for the Lately stack on the wide home screen. */
export async function listRecentMoments(db: SQLiteDatabase, limit = 100): Promise<Moment[]> {
  const rows = await db.getAllAsync<MomentRow>(`${MOMENT_SELECT} ORDER BY m.created_at DESC LIMIT ?`, limit);
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
  const r = await db.getFirstAsync<{ prompt: string; hint: string; idx: number; title: string; color: string; user_grid_id: string; audience: string }>(
    `SELECT gs.prompt, gs.hint, ss.idx, g.title, g.color, ss.user_grid_id, ug.audience
     FROM square_states ss
     JOIN user_grids ug ON ug.id = ss.user_grid_id
     JOIN grids g ON g.id = ug.grid_id
     JOIN grid_squares gs ON gs.grid_id = g.id AND gs.idx = ss.idx
     WHERE ss.id = ?`, squareStateId,
  );
  return r ? { ...r, audience: asAudience(r.audience) } : null;
}
