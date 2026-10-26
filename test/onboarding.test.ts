import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TestDb, asExpo } from './sqlite';
import { migrate } from '@/db/schema';
import { getMeta, setMeta } from '@/db/queue';
import { STARTERS } from '@/data/starters';
import { adoptGrid } from '@/data/seed';
import { listShelf, saveMoment } from '@/db/repo';
import { accountStatus, completeOnboarding, isOnboarded, loadAccount } from '@/auth/onboarding';

const USER = '11111111-1111-4111-8111-111111111111';
const always = async () => true;

async function phone() {
  const db = asExpo(new TestDb());
  await migrate(db);
  return db;
}

test('a fresh phone needs a username, then onboarding', async () => {
  const db = await phone();
  assert.equal(await accountStatus(db, null), 'needsUsername');
  assert.equal(await accountStatus(db, 'paul'), 'onboarding');
});

test('a v1 account with a moment counts as onboarded', async () => {
  const db = await phone();
  const ug = await adoptGrid(db, USER, STARTERS[0].id);
  const square = await db.getFirstAsync<{ id: string }>("SELECT id FROM square_states WHERE user_grid_id = ? AND state = 'revealed'", ug);
  await saveMoment(db, square!.id, { title: 'First', body: '', happenedOn: '2026-10-01', place: '', weather: '', withPeople: '', photos: [], coverIndex: 0 });
  assert.equal(await isOnboarded(db), true);
});

test('loadAccount brings the username and onboarding over from the server', async () => {
  const db = await phone();
  const r = await loadAccount(db, async () => ({ username: 'paul', interests: ['chess'], onboarded_at: '2026-10-20T00:00:00.000Z' }));
  assert.deepEqual(r, { username: 'paul', status: 'ready' });
  assert.equal(await getMeta(db, 'username'), 'paul');
  assert.equal(await getMeta(db, 'interests'), '["chess"]');
});

test('loadAccount skips the server once the phone knows everything', async () => {
  const db = await phone();
  await setMeta(db, 'username', 'paul');
  await setMeta(db, 'onboarded_at', '2026-10-20T00:00:00.000Z');
  const r = await loadAccount(db, async () => { throw new Error('should not be called'); });
  assert.deepEqual(r, { username: 'paul', status: 'ready' });
});

test('loadAccount without a backend uses what the phone has', async () => {
  const db = await phone();
  assert.deepEqual(await loadAccount(db, null), { username: null, status: 'needsUsername' });
});

test('completing onboarding shelves the picks, drops the rest, and queues the interests', async () => {
  const db = await phone();
  const [keep, drop, pick] = STARTERS;
  await adoptGrid(db, USER, keep.id);
  await adoptGrid(db, USER, drop.id);
  await completeOnboarding(db, USER, ['running'], [keep.id, pick.id], always);
  const shelf = (await listShelf(db)).map((g) => g.gridId).sort();
  assert.deepEqual(shelf, [keep.id, pick.id].sort());
  assert.equal(await getMeta(db, 'interests'), '["running"]');
  assert.equal(await getMeta(db, 'profile_dirty'), '1');
  assert.equal(await accountStatus(db, 'paul'), 'ready');
});

test('a pick that cannot be fetched is left off the shelf', async () => {
  const db = await phone();
  await completeOnboarding(db, USER, [], [STARTERS[0].id], async () => false);
  assert.deepEqual(await listShelf(db), []);
});
