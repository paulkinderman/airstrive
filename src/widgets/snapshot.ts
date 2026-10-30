import type { Moment, OpenSquare, ShelfGrid } from '@/db/repo';

/**
 * What the home screen widgets read (targets/widget/Snapshot.swift decodes it). Kept small: the
 * widget extension has little memory, and it is rewritten every time the shelf changes.
 */
export interface WidgetSnapshot {
  v: 1;
  /** Revealed squares across the shelf, as the home screen's "squares waiting". */
  waiting: number;
  grids: {
    id: string; title: string; color: string; cols: number; rows: number; done: number; total: number;
    /** One letter per square: h hidden, r revealed, d done. */
    states: string;
    complete: boolean;
    open: { id: string; idx: number; prompt: string }[];
  }[];
  lately: { id: string; caption: string; grid: string; color: string; date: string; photo: string | null }[];
  friends: { name: string; title: string; grid: string }[];
}

export interface FriendLine { username: string; title: string; gridTitle: string }

/** The cover (or first) photo of a moment that gets a widget thumbnail, by where it's stored. */
export interface ThumbJob { momentId: string; photoId: string; uri: string }

const GRIDS = 8;
const OPEN_PER_GRID = 12;
const LATELY = 12;
const FRIENDS = 3;

const LETTER = { hidden: 'h', revealed: 'r', done: 'd' } as const;

/** The file a moment's thumbnail is saved as, under the App Group folder. A new cover gets a new name. */
export function thumbName(job: { momentId: string; photoId: string }) {
  return `lately/${job.momentId}-${job.photoId}.jpg`;
}

export function buildSnapshot(shelf: ShelfGrid[], open: Map<string, OpenSquare[]>, recent: Moment[], friends: FriendLine[]): { snapshot: WidgetSnapshot; thumbs: ThumbJob[] } {
  const thumbs: ThumbJob[] = [];
  const lately = recent.slice(0, LATELY).map((m) => {
    const photo = m.photos.find((p) => p.isCover) ?? m.photos[0];
    const job = photo ? { momentId: m.id, photoId: photo.id, uri: photo.uri } : null;
    if (job) thumbs.push(job);
    return {
      id: m.id,
      caption: m.title || m.prompt,
      grid: m.gridTitle,
      // A moment with no photo shows its square's fill color, like the Lately stack in the app.
      color: m.fill.startsWith('#') ? m.fill : m.gridColor,
      date: m.happenedOn.slice(0, 10),
      photo: job ? thumbName(job) : null,
    };
  });
  return {
    snapshot: {
      v: 1,
      waiting: shelf.reduce((n, g) => n + g.revealed, 0),
      grids: shelf.slice(0, GRIDS).map((g) => ({
        id: g.userGridId, title: g.title, color: g.color, cols: g.cols, rows: g.rows, done: g.done, total: g.total,
        states: g.states.map((s) => LETTER[s]).join(''),
        complete: !!g.completedAt,
        open: (open.get(g.userGridId) ?? []).slice(0, OPEN_PER_GRID).map((s) => ({ id: s.squareStateId, idx: s.idx, prompt: s.prompt })),
      })),
      lately,
      friends: friends.slice(0, FRIENDS).map((f) => ({ name: f.username, title: f.title, grid: f.gridTitle })),
    },
    thumbs,
  };
}
