import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TestDb, asExpo } from './sqlite';
import { migrate } from '@/db/schema';
import { SYNCED_TABLES } from '@/db/queue';
import { GRID_PUSH, columnNames } from '@/sync/tables';

async function phoneColumns(table: string) {
  const db = new TestDb();
  await migrate(asExpo(db));
  return (await asExpo(db).getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`)).map((r) => r.name);
}

test('every synced column exists in the phone schema', async () => {
  for (const table of SYNCED_TABLES) {
    const have = await phoneColumns(table);
    for (const c of columnNames(table)) assert.ok(have.includes(c), `${table}.${c} is synced but missing from src/db/schema.ts`);
  }
});

test('every column save_grid takes exists on the phone grids table', async () => {
  const have = await phoneColumns('grids');
  for (const c of GRID_PUSH) assert.ok(have.includes(c.name), `grids.${c.name}`);
});
