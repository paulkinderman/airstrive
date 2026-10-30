import type { SyncedTable } from '@/db/queue';
import type { Tables } from '@/db/database.types';

/**
 * The columns each synced table sends and receives, in one place. Adding a field means
 * adding it here, to the phone's schema (src/db/schema.ts) and to a Postgres migration.
 * The compiler checks each name against the server's generated types
 * (src/db/database.types.ts), and test/tables.test.ts checks it against the phone's schema.
 *
 *  - text and number go across as they are
 *  - bool is 0/1 on the phone and true/false on the server
 *  - timestamp is normalized so the phone's ISO strings compare as text
 *  - `missing` is used when the server doesn't send the column at all (an older server)
 *  - `pull` columns come from the server and are never sent: the server sets them itself
 *    (who added a row, and which group grid it belongs to)
 */
export type ColumnKind = 'text' | 'number' | 'bool' | 'timestamp';
export interface Column<N extends string = string> { name: N; kind: ColumnKind; missing?: string | number | null; pull?: boolean }

const text = <N extends string>(name: N, missing: string | null = null): Column<N> => ({ name, kind: 'text', missing });
const num = <N extends string>(name: N): Column<N> => ({ name, kind: 'number' });
const bool = <N extends string>(name: N): Column<N> => ({ name, kind: 'bool' });
const ts = <N extends string>(name: N): Column<N> => ({ name, kind: 'timestamp' });
const fromServer = <N extends string>(name: N): Column<N> => ({ name, kind: 'text', missing: null, pull: true });

/** Only accepts columns the server's `table` has, so a typo or a missing migration fails to compile. */
const on = <T extends SyncedTable | 'grids'>(_table: T, columns: Column<keyof Tables<T> & string>[]): Column[] => columns;

export const TABLES: Record<SyncedTable, Column[]> = {
  user_grids: on('user_grids', [
    text('id'), text('grid_id'), num('freebies_left'), ts('started_at'), ts('completed_at'), bool('show_moments'),
    // A server from before friends has no audience; everything was private then.
    text('audience', 'private'),
    ts('updated_at'), ts('deleted_at'), fromServer('group_id'),
  ]),
  square_states: on('square_states', [
    text('id'), text('user_grid_id'), num('idx'), text('state'), ts('done_at'), bool('via_freebie'),
    ts('updated_at'), ts('deleted_at'), fromServer('group_id'),
  ]),
  moments: on('moments', [
    text('id'), text('square_state_id'), text('title'), text('body'), text('happened_on'), text('place'), text('weather'),
    text('with_people'), text('audience', 'private'),
    // A server from before square looks has no fill; the square takes the grid's color.
    text('fill', ''),
    ts('created_at'), ts('updated_at'), ts('deleted_at'), fromServer('group_id'), fromServer('user_id'),
  ]),
  // Group moments only: one person's words, seen by the group or by them alone.
  moment_entries: on('moment_entries', [
    text('id'), text('moment_id'), text('body'), text('audience', 'group'),
    ts('created_at'), ts('updated_at'), ts('deleted_at'), fromServer('group_id'), fromServer('user_id'),
  ]),
  photos: on('photos', [
    text('id'), text('moment_id'), num('position'), text('storage_path'), bool('is_cover'), num('width'), num('height'),
    num('bytes'), text('audience', 'group'),
    ts('created_at'), ts('updated_at'), ts('deleted_at'), fromServer('group_id'), fromServer('user_id'),
  ]),
};

/** What save_grid() takes for a grid the person made. Squares go separately; starts is '9,10,12' or ''. */
export const GRID_PUSH: Column[] = on('grids', [
  text('id'), text('title'), text('color'), text('theme'), text('size'), text('description'), text('reveal_icon'), text('starts'),
  bool('is_public'), ts('updated_at'),
]);

export const columnNames = (table: SyncedTable) => TABLES[table].map((c) => c.name);
