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
