import type { SQLiteDatabase } from 'expo-sqlite';
import { seedGridTemplates } from '@/data/seed';

export const SCHEMA_VERSION = 3;

/** v0's schema, kept as-is so phones that ran v0 upgrade through the same path. */
export const V1 = `
  CREATE TABLE IF NOT EXISTS grids (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    color TEXT NOT NULL,
    theme TEXT NOT NULL,
    size TEXT NOT NULL,
    cols INTEGER NOT NULL,
    rows INTEGER NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    made_by TEXT NOT NULL DEFAULT 'AirStrive',
    is_public INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS grid_squares (
    grid_id TEXT NOT NULL REFERENCES grids(id) ON DELETE CASCADE,
    idx INTEGER NOT NULL,
    prompt TEXT NOT NULL,
    hint TEXT NOT NULL DEFAULT '',
    cluster TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (grid_id, idx)
  );

  CREATE TABLE IF NOT EXISTS user_grids (
    id TEXT PRIMARY KEY,
    grid_id TEXT NOT NULL REFERENCES grids(id),
    freebies_left INTEGER NOT NULL,
    started_at TEXT NOT NULL,
    completed_at TEXT,
    show_moments INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS square_states (
    id TEXT PRIMARY KEY,
    user_grid_id TEXT NOT NULL REFERENCES user_grids(id) ON DELETE CASCADE,
    idx INTEGER NOT NULL,
    state TEXT NOT NULL CHECK (state IN ('hidden','revealed','done')),
    done_at TEXT,
    via_freebie INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL,
    UNIQUE (user_grid_id, idx)
  );

  CREATE TABLE IF NOT EXISTS moments (
    id TEXT PRIMARY KEY,
    square_state_id TEXT NOT NULL UNIQUE REFERENCES square_states(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    body TEXT NOT NULL DEFAULT '',
    happened_on TEXT NOT NULL,
    place TEXT NOT NULL DEFAULT '',
    weather TEXT NOT NULL DEFAULT '',
    with_people TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS photos (
    id TEXT PRIMARY KEY,
    moment_id TEXT NOT NULL REFERENCES moments(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    local_uri TEXT NOT NULL,
    storage_path TEXT,
    is_cover INTEGER NOT NULL DEFAULT 0,
    width INTEGER NOT NULL DEFAULT 0,
    height INTEGER NOT NULL DEFAULT 0,
    bytes INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sync_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tbl TEXT NOT NULL,
    row_id TEXT NOT NULL,
    op TEXT NOT NULL,
    payload TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_states_grid ON square_states(user_grid_id, state);
  CREATE INDEX IF NOT EXISTS idx_moments_date ON moments(happened_on DESC);
  CREATE INDEX IF NOT EXISTS idx_photos_moment ON photos(moment_id, position);
`;

/**
 * v1: soft deletes for sync, one live moment per square instead of a hard UNIQUE,
 * photo paths stored relative to the app's documents folder, a dirty-row sync queue,
 * and a small key-value table for sync cursors and the signed-in owner.
 */
const V2 = `
  ALTER TABLE user_grids ADD COLUMN deleted_at TEXT;
  ALTER TABLE square_states ADD COLUMN deleted_at TEXT;

  CREATE TABLE moments_v2 (
    id TEXT PRIMARY KEY,
    square_state_id TEXT NOT NULL REFERENCES square_states(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    body TEXT NOT NULL DEFAULT '',
    happened_on TEXT NOT NULL,
    place TEXT NOT NULL DEFAULT '',
    weather TEXT NOT NULL DEFAULT '',
    with_people TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );
  INSERT INTO moments_v2 (id, square_state_id, title, body, happened_on, place, weather, with_people, created_at, updated_at)
    SELECT id, square_state_id, title, body, happened_on, place, weather, with_people, created_at, updated_at FROM moments;
  DROP TABLE moments;
  ALTER TABLE moments_v2 RENAME TO moments;
  CREATE UNIQUE INDEX idx_moments_live ON moments(square_state_id) WHERE deleted_at IS NULL;
  CREATE INDEX idx_moments_date ON moments(happened_on DESC);

  ALTER TABLE photos ADD COLUMN updated_at TEXT NOT NULL DEFAULT '';
  ALTER TABLE photos ADD COLUMN deleted_at TEXT;
  UPDATE photos SET updated_at = created_at;
  UPDATE photos SET local_uri = 'photos/' || replace(local_uri, rtrim(local_uri, replace(local_uri, '/', '')), '')
    WHERE local_uri LIKE 'file:%';

  DROP TABLE sync_queue;
  CREATE TABLE sync_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tbl TEXT NOT NULL,
    row_id TEXT NOT NULL,
    dirty_at TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    next_attempt_at TEXT,
    first_failed_at TEXT,
    last_error TEXT,
    failed INTEGER NOT NULL DEFAULT 0,
    UNIQUE (tbl, row_id)
  );

  CREATE TABLE meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`;

/**
 * v2: grids people make. A grid knows its author and whether it is official, and a grid
 * the person made syncs up through the queue like their other rows.
 */
const V3 = `
  ALTER TABLE grids ADD COLUMN author_id TEXT;
  ALTER TABLE grids ADD COLUMN is_official INTEGER NOT NULL DEFAULT 0;
  UPDATE grids SET is_official = 1 WHERE made_by = 'AirStrive' AND author_id IS NULL;
`;

export async function migrate(db: SQLiteDatabase) {
  await db.execAsync('PRAGMA journal_mode = WAL;');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let current = row?.user_version ?? 0;

  if (current < 1) {
    await db.execAsync('PRAGMA foreign_keys = ON;');
    await db.execAsync(V1);
    await db.execAsync('PRAGMA user_version = 1');
    current = 1;
  }

  if (current < 2) {
    // Rebuilding moments must not cascade into photos, and foreign_keys can only be
    // toggled outside a transaction.
    await db.execAsync('PRAGMA foreign_keys = OFF;');
    await db.withTransactionAsync(async () => {
      await db.execAsync(V2);
      await db.execAsync('PRAGMA user_version = 2');
    });
    current = 2;
  }

  if (current < 3) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(V3);
      await db.execAsync('PRAGMA user_version = 3');
    });
  }

  await db.execAsync('PRAGMA foreign_keys = ON;');
  await seedGridTemplates(db);
}
