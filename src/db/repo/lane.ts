import type { SQLiteDatabase } from 'expo-sqlite';
import { photoUri } from '@/lib/files';
import { listMoments } from './moments';
import type { Moment } from './types';

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
  /** The same photos as paths relative to the documents folder, for printing. */
  tilePaths: (string | null)[];
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
    tilePaths: squares.map((s) => s.cover),
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
