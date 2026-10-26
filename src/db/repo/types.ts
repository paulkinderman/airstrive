import type { Audience } from '@/friends/audience';

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
  audience: Audience;
  /** The grid's audience; the moment's can't be wider. */
  gridAudience: Audience;
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
