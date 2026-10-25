import type { SQLiteDatabase } from 'expo-sqlite';
import { seedStarterGrids } from '@/data/seed';

export const SCHEMA_VERSION = 1;

export async function migrate(db: SQLiteDatabase) {
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const current = row?.user_version ?? 0;
  if (current >= SCHEMA_VERSION) return;

  await db.execAsync(`
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
  `);

  await seedStarterGrids(db);
  await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION}`);
}
