// Runs the app's database code on node:sqlite through the slice of the expo-sqlite API it uses.
import { DatabaseSync } from 'node:sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';

type Param = string | number | null;

export class TestDb {
  raw = new DatabaseSync(':memory:');
  private inTx = false;

  async execAsync(sql: string) { this.raw.exec(sql); }
  async runAsync(sql: string, ...params: Param[]) {
    const r = this.raw.prepare(sql).run(...params);
    return { changes: Number(r.changes), lastInsertRowId: Number(r.lastInsertRowid) };
  }
  async getFirstAsync<T>(sql: string, ...params: Param[]): Promise<T | null> {
    return (this.raw.prepare(sql).get(...params) as T) ?? null;
  }
  async getAllAsync<T>(sql: string, ...params: Param[]): Promise<T[]> {
    return this.raw.prepare(sql).all(...params) as T[];
  }
  async withTransactionAsync(fn: () => Promise<void>) {
    if (this.inTx) throw new Error('nested transaction');
    this.inTx = true;
    this.raw.exec('BEGIN');
    try { await fn(); this.raw.exec('COMMIT'); } catch (e) { this.raw.exec('ROLLBACK'); throw e; } finally { this.inTx = false; }
  }
}

export const asExpo = (db: TestDb) => db as unknown as SQLiteDatabase;

/** Takes a migrated phone back to before group grids (schema v4), for upgrade tests. */
export const BEFORE_GROUPS = `
  ALTER TABLE grids DROP COLUMN starts; ALTER TABLE grids DROP COLUMN reveal_icon; ALTER TABLE moments DROP COLUMN fill;
  ALTER TABLE user_grids DROP COLUMN group_id; ALTER TABLE square_states DROP COLUMN group_id;
  ALTER TABLE moments DROP COLUMN group_id; ALTER TABLE moments DROP COLUMN user_id;
  ALTER TABLE photos DROP COLUMN group_id; ALTER TABLE photos DROP COLUMN user_id; ALTER TABLE photos DROP COLUMN audience;
  DROP TABLE moment_entries; DROP TABLE group_people;
`;
