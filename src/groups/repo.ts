import type { SQLiteDatabase } from 'expo-sqlite';
import { newId, nowIso } from '@/lib/ids';
import { photoUri } from '@/lib/files';
import { markDirty } from '@/db/queue';
import { checkComplete, revealNeighbours } from '@/db/repo/board';
import type { SquareState, WriteResult } from '@/db/repo/types';

/**
 * Group grids on the phone. The board is shared and works like any other; a square's
 * moment holds what everyone shares (title, date, place, weather, who with), and each
 * person's words and photos are their own: an entry, and photos they added, each seen by
 * the group or kept Private. This person only ever writes their own entry and photos.
 */

export type EntryAudience = 'group' | 'private';
export const asEntryAudience = (v: unknown): EntryAudience => (v === 'private' ? 'private' : 'group');

export interface GroupPerson { id: string; username: string; status: 'member' | 'invited' | 'left' }

export interface GroupEntry {
  id: string;
  userId: string | null;
  name: string;
  mine: boolean;
  body: string;
  audience: EntryAudience;
}

export interface GroupPhoto {
  id: string;
  userId: string | null;
  name: string;
  mine: boolean;
  uri: string;
  path: string;
  width: number;
  height: number;
  audience: EntryAudience;
}

export interface GroupMoment {
  id: string;
  squareStateId: string;
  title: string;
  happenedOn: string;
  place: string;
  weather: string;
  withPeople: string;
  entries: GroupEntry[];
  photos: GroupPhoto[];
}

export async function groupOfGrid(db: SQLiteDatabase, userGridId: string): Promise<string | null> {
  const r = await db.getFirstAsync<{ group_id: string | null }>('SELECT group_id FROM user_grids WHERE id = ?', userGridId);
  return r?.group_id ?? null;
}

export async function groupOfSquare(db: SQLiteDatabase, squareStateId: string): Promise<string | null> {
  const r = await db.getFirstAsync<{ group_id: string | null }>(
    'SELECT ug.group_id FROM square_states ss JOIN user_grids ug ON ug.id = ss.user_grid_id WHERE ss.id = ?', squareStateId,
  );
  return r?.group_id ?? null;
}

/** Everyone the phone knows a name for in a group, members first. Refreshed on each sync. */
export async function listGroupPeople(db: SQLiteDatabase, groupId: string): Promise<GroupPerson[]> {
  const rows = await db.getAllAsync<{ user_id: string; username: string; status: string }>(
    `SELECT user_id, username, status FROM group_people WHERE group_id = ?
     ORDER BY CASE status WHEN 'member' THEN 0 WHEN 'invited' THEN 1 ELSE 2 END, lower(username)`, groupId,
  );
  return rows.map((r) => ({
    id: r.user_id, username: r.username, status: r.status === 'invited' ? 'invited' : r.status === 'left' ? 'left' : 'member',
  }));
}

/** "You", their username, or "A former member" for someone who deleted their account. */
export function nameFor(people: GroupPerson[], userId: string | null, me: string | null): string {
  if (userId && userId === me) return 'You';
  return people.find((p) => p.id === userId)?.username ?? 'A former member';
}

/** "With Hal" / "With Hal and Ivy" / "With Hal, Ivy and Jo": the other members. */
export function togetherLine(people: GroupPerson[], me: string | null): string {
  const names = people.filter((p) => p.status === 'member' && p.id !== me).map((p) => p.username);
  if (names.length === 0) return 'Just you so far';
  if (names.length === 1) return `With ${names[0]}`;
  return `With ${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

export async function getGroupMoment(db: SQLiteDatabase, squareStateId: string, me: string | null): Promise<GroupMoment | null> {
  const m = await db.getFirstAsync<{
    id: string; title: string; happened_on: string; place: string; weather: string; with_people: string; group_id: string;
  }>(
    `SELECT id, title, happened_on, place, weather, with_people, group_id FROM moments
     WHERE square_state_id = ? AND deleted_at IS NULL`, squareStateId,
  );
  if (!m) return null;
  const people = await listGroupPeople(db, m.group_id ?? '');
  const entries = await db.getAllAsync<{ id: string; user_id: string | null; body: string; audience: string }>(
    `SELECT id, user_id, body, audience FROM moment_entries WHERE moment_id = ? AND deleted_at IS NULL
     ORDER BY user_id = ? DESC, created_at`, m.id, me,
  );
  const photos = await db.getAllAsync<{ id: string; user_id: string | null; local_uri: string; width: number; height: number; audience: string }>(
    `SELECT id, user_id, local_uri, width, height, audience FROM photos
     WHERE moment_id = ? AND deleted_at IS NULL AND local_uri != '' ORDER BY created_at, position`, m.id,
  );
  return {
    id: m.id,
    squareStateId,
    title: m.title,
    happenedOn: m.happened_on,
    place: m.place,
    weather: m.weather,
    withPeople: m.with_people,
    entries: entries.map((e) => ({
      id: e.id, userId: e.user_id, name: nameFor(people, e.user_id, me), mine: !!me && e.user_id === me,
      body: e.body, audience: asEntryAudience(e.audience),
    })),
    photos: photos.map((p) => ({
      id: p.id, userId: p.user_id, name: nameFor(people, p.user_id, me), mine: !!me && p.user_id === me,
      uri: photoUri(p.local_uri), path: p.local_uri, width: p.width, height: p.height, audience: asEntryAudience(p.audience),
    })),
  };
}

export interface GroupMomentInput {
  title: string;
  happenedOn: string;
  place: string;
  weather: string;
  withPeople: string;
  /** This person's words. Empty removes their entry. */
  body: string;
  audience: EntryAudience;
  /** This person's photos only. Existing ones keep their id. */
  photos: { id?: string; path: string; width: number; height: number; bytes: number; audience: EntryAudience }[];
}

/**
 * Saves this person's part of a group square. The shared details are written only when
 * they changed, so two people adding their own words don't overwrite each other's edits.
 */
export async function saveGroupMoment(
  db: SQLiteDatabase, squareStateId: string, me: string, input: GroupMomentInput,
): Promise<WriteResult & { momentId: string }> {
  const sq = await db.getFirstAsync<{ user_grid_id: string; idx: number; group_id: string | null }>(
    `SELECT ss.user_grid_id, ss.idx, ug.group_id FROM square_states ss JOIN user_grids ug ON ug.id = ss.user_grid_id WHERE ss.id = ?`,
    squareStateId,
  );
  if (!sq?.group_id) throw new Error('not a group square');
  const groupId = sq.group_id;
  const now = nowIso();
  const existing = await db.getFirstAsync<{ id: string; title: string; happened_on: string; place: string; weather: string; with_people: string }>(
    'SELECT id, title, happened_on, place, weather, with_people FROM moments WHERE square_state_id = ? AND deleted_at IS NULL', squareStateId,
  );
  const momentId = existing?.id ?? newId();
  const removedFiles: string[] = [];
  let completed = false;

  await db.withTransactionAsync(async () => {
    if (!existing) {
      await db.runAsync(
        `INSERT INTO moments (id, square_state_id, title, body, happened_on, place, weather, with_people, audience, group_id, user_id, created_at, updated_at)
         VALUES (?, ?, ?, '', ?, ?, ?, ?, 'private', ?, ?, ?, ?)`,
        momentId, squareStateId, input.title, input.happenedOn, input.place, input.weather, input.withPeople, groupId, me, now, now,
      );
      await markDirty(db, 'moments', momentId);
    } else if (
      existing.title !== input.title || existing.happened_on !== input.happenedOn || existing.place !== input.place
      || existing.weather !== input.weather || existing.with_people !== input.withPeople
    ) {
      await db.runAsync(
        'UPDATE moments SET title = ?, happened_on = ?, place = ?, weather = ?, with_people = ?, updated_at = ? WHERE id = ?',
        input.title, input.happenedOn, input.place, input.weather, input.withPeople, now, momentId,
      );
      await markDirty(db, 'moments', momentId);
    }

    const entry = await db.getFirstAsync<{ id: string; body: string; audience: string }>(
      'SELECT id, body, audience FROM moment_entries WHERE moment_id = ? AND user_id = ? AND deleted_at IS NULL', momentId, me,
    );
    const body = input.body.trim();
    if (entry && !body) {
      await db.runAsync('UPDATE moment_entries SET deleted_at = ?, updated_at = ? WHERE id = ?', now, now, entry.id);
      await markDirty(db, 'moment_entries', entry.id);
    } else if (entry && (entry.body !== body || entry.audience !== input.audience)) {
      await db.runAsync('UPDATE moment_entries SET body = ?, audience = ?, updated_at = ? WHERE id = ?', body, input.audience, now, entry.id);
      await markDirty(db, 'moment_entries', entry.id);
    } else if (!entry && body) {
      const id = newId();
      await db.runAsync(
        `INSERT INTO moment_entries (id, moment_id, group_id, user_id, body, audience, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, id, momentId, groupId, me, body, input.audience, now, now,
      );
      await markDirty(db, 'moment_entries', id);
    }

    const before = await db.getAllAsync<{ id: string; local_uri: string; position: number; audience: string }>(
      'SELECT id, local_uri, position, audience FROM photos WHERE moment_id = ? AND user_id = ? AND deleted_at IS NULL', momentId, me,
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
      if (p.id) {
        const old = before.find((b) => b.id === p.id);
        if (old && old.position === i && old.audience === p.audience) continue;
        await db.runAsync('UPDATE photos SET position = ?, audience = ?, updated_at = ? WHERE id = ?', i, p.audience, now, p.id);
        await markDirty(db, 'photos', p.id);
      } else {
        const id = newId();
        await db.runAsync(
          `INSERT INTO photos (id, moment_id, position, local_uri, is_cover, width, height, bytes, audience, group_id, user_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?)`,
          id, momentId, i, p.path, p.width, p.height, p.bytes, p.audience, groupId, me, now, now,
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

/**
 * Takes this person's entry and photos off a group square. When nobody else has added
 * anything this phone can see, the moment goes too and the square is unchecked.
 * Returns whether the square was unchecked.
 */
export async function removeMyPart(db: SQLiteDatabase, momentId: string, me: string): Promise<WriteResult & { unchecked: boolean }> {
  const m = await db.getFirstAsync<{ square_state_id: string; user_grid_id: string }>(
    `SELECT m.square_state_id, ss.user_grid_id FROM moments m JOIN square_states ss ON ss.id = m.square_state_id
     WHERE m.id = ? AND m.deleted_at IS NULL`, momentId,
  );
  if (!m) return { completedGrid: null, removedFiles: [], unchecked: false };
  const now = nowIso();
  const removedFiles: string[] = [];
  let unchecked = false;
  await db.withTransactionAsync(async () => {
    const photos = await db.getAllAsync<{ id: string; local_uri: string }>(
      'SELECT id, local_uri FROM photos WHERE moment_id = ? AND user_id = ? AND deleted_at IS NULL', momentId, me,
    );
    for (const p of photos) {
      await db.runAsync('UPDATE photos SET deleted_at = ?, updated_at = ? WHERE id = ?', now, now, p.id);
      await markDirty(db, 'photos', p.id);
      if (p.local_uri) removedFiles.push(p.local_uri);
    }
    const entries = await db.getAllAsync<{ id: string }>(
      'SELECT id FROM moment_entries WHERE moment_id = ? AND user_id = ? AND deleted_at IS NULL', momentId, me,
    );
    for (const e of entries) {
      await db.runAsync('UPDATE moment_entries SET deleted_at = ?, updated_at = ? WHERE id = ?', now, now, e.id);
      await markDirty(db, 'moment_entries', e.id);
    }
    const others = await db.getFirstAsync<{ n: number }>(
      `SELECT (SELECT COUNT(*) FROM photos WHERE moment_id = ? AND deleted_at IS NULL AND user_id IS NOT ?)
            + (SELECT COUNT(*) FROM moment_entries WHERE moment_id = ? AND deleted_at IS NULL AND user_id IS NOT ?) AS n`,
      momentId, me, momentId, me,
    );
    if ((others?.n ?? 0) > 0) return;
    unchecked = true;
    await db.runAsync('UPDATE moments SET deleted_at = ?, updated_at = ? WHERE id = ?', now, now, momentId);
    await markDirty(db, 'moments', momentId);
    await db.runAsync(
      "UPDATE square_states SET state = 'revealed', done_at = NULL, via_freebie = 0, updated_at = ? WHERE id = ?", now, m.square_state_id,
    );
    await markDirty(db, 'square_states', m.square_state_id);
    await checkComplete(db, m.user_grid_id);
  });
  return { completedGrid: null, removedFiles, unchecked };
}
