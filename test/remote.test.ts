import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TestDb, asExpo } from './sqlite';
import { migrate } from '@/db/schema';
import { cachedFetch } from '@/lib/remote';

async function db() {
  const d = asExpo(new TestDb());
  await migrate(d);
  return d;
}

const down = async (): Promise<string[]> => { throw new Error('offline'); };

test('a fetched answer is kept and returned online', async () => {
  const d = await db();
  const r = await cachedFetch(d, 'k', async () => ['a', 'b'], () => ['fallback']);
  assert.deepEqual(r, { data: ['a', 'b'], offline: false });
});

test('offline returns the kept copy', async () => {
  const d = await db();
  await cachedFetch(d, 'k', async () => ['a'], () => []);
  assert.deepEqual(await cachedFetch(d, 'k', down, () => ['fallback']), { data: ['a'], offline: true });
});

test('offline with nothing kept returns the fallback', async () => {
  const d = await db();
  assert.deepEqual(await cachedFetch(d, 'k', down, () => ['fallback']), { data: ['fallback'], offline: true });
});

test('with no backend the fallback answers and nothing is offline', async () => {
  const d = await db();
  assert.deepEqual(await cachedFetch(d, 'k', null, () => ['fallback']), { data: ['fallback'], offline: false });
});

test('copies are kept per key', async () => {
  const d = await db();
  await cachedFetch(d, 'one', async () => ['1'], () => []);
  await cachedFetch(d, 'two', async () => ['2'], () => []);
  assert.deepEqual((await cachedFetch(d, 'one', down, () => [])).data, ['1']);
  assert.deepEqual((await cachedFetch(d, 'two', down, () => [])).data, ['2']);
});
