import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TestDb, asExpo } from './sqlite';
import { migrate } from '@/db/schema';
import { STARTERS } from '@/data/starters';
import { adoptGrid } from '@/data/seed';
import { listShelf, spendFreebie } from '@/db/repo';

const USER = '11111111-1111-4111-8111-111111111111';

test('the shelf gives each grid its own squares in board order', async () => {
  const db = asExpo(new TestDb());
  await migrate(db);
  const a = await adoptGrid(db, USER, STARTERS[0].id);
  const b = await adoptGrid(db, USER, STARTERS[1].id);
  const first = await db.getFirstAsync<{ id: string }>("SELECT id FROM square_states WHERE user_grid_id = ? AND state = 'revealed' ORDER BY idx", a);
  await spendFreebie(db, first!.id);

  const shelf = await listShelf(db);
  for (const ug of [a, b]) {
    const g = shelf.find((s) => s.userGridId === ug)!;
    const expected = await db.getAllAsync<{ state: string }>('SELECT state FROM square_states WHERE user_grid_id = ? AND deleted_at IS NULL ORDER BY idx', ug);
    assert.deepEqual(g.states, expected.map((r) => r.state));
    assert.equal(g.total, g.cols * g.rows);
    assert.equal(g.done, g.states.filter((s) => s === 'done').length);
  }
  assert.equal(shelf.find((s) => s.userGridId === a)!.done, 1);
  assert.equal(shelf.find((s) => s.userGridId === b)!.done, 0);
});
