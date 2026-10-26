import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TestDb, asExpo, BEFORE_GROUPS } from './sqlite';
import { FakeServer, FakeDevice } from './fakeServer';
import { migrate } from '@/db/schema';
import { adoptGrid } from '@/data/seed';
import {
  getMomentForSquare, hasNarrowerMoments, listSharedGrids, listShelf, loadBoard, saveMoment, setGridAudience,
} from '@/db/repo';
import { fromServer, syncOnce, backfill } from '@/sync/engine';
import { isWider, narrower } from '@/friends/audience';
import { codeFrom, friendLink } from '@/friends/links';

const USER = '11111111-1111-4111-8111-111111111111';

async function phone(server: FakeServer) {
  const db = new TestDb();
  await migrate(asExpo(db));
  const device = new FakeDevice();
  const remote = server.remote(device);
  const sync = () => syncOnce(asExpo(db), remote, device.local, USER);
  return { db, x: asExpo(db), device, remote, sync };
}

const moment = (body: string, audience?: 'private' | 'friends' | 'public') => ({
  title: 'A prompt', body, happenedOn: '2026-10-25', place: '', weather: '', withPeople: '', photos: [], coverIndex: 0, audience,
});

async function fallGrid(x: ReturnType<typeof asExpo>) {
  const ug = await adoptGrid(x, USER, 'grid_fall');
  const board = (await loadBoard(x, ug))!;
  const revealed = board.squares.filter((s) => s.state === 'revealed');
  return { ug, squares: revealed.map((s) => s.squareStateId) };
}

test('audiences order private < friends < public', () => {
  assert.equal(narrower('public', 'friends'), 'friends');
  assert.equal(narrower('private', 'public'), 'private');
  assert.equal(narrower('public', 'public'), 'public');
  assert.ok(isWider('public', 'friends'));
  assert.ok(!isWider('friends', 'friends'));
});

test('everything starts private, and a new moment takes its grid audience', async () => {
  const a = await phone(new FakeServer());
  const { ug, squares } = await fallGrid(a.x);
  assert.equal((await loadBoard(a.x, ug))!.audience, 'private');

  await saveMoment(a.x, squares[0], moment('first'));
  assert.equal((await getMomentForSquare(a.x, squares[0]))!.audience, 'private');

  await setGridAudience(a.x, ug, 'friends');
  await saveMoment(a.x, squares[1], moment('second'));
  assert.equal((await getMomentForSquare(a.x, squares[1]))!.audience, 'friends');
  // Widening the grid alone leaves older moments where they were.
  assert.equal((await getMomentForSquare(a.x, squares[0]))!.audience, 'private');
});

test("a moment can't be wider than its grid", async () => {
  const a = await phone(new FakeServer());
  const { ug, squares } = await fallGrid(a.x);
  await setGridAudience(a.x, ug, 'friends');
  await saveMoment(a.x, squares[0], moment('too wide', 'public'));
  assert.equal((await getMomentForSquare(a.x, squares[0]))!.audience, 'friends');
});

test('narrowing a grid narrows its moments; widening can bring them along', async () => {
  const a = await phone(new FakeServer());
  const { ug, squares } = await fallGrid(a.x);
  await setGridAudience(a.x, ug, 'public');
  await saveMoment(a.x, squares[0], moment('public'));
  await saveMoment(a.x, squares[1], moment('just me', 'private'));

  await setGridAudience(a.x, ug, 'friends');
  assert.equal((await getMomentForSquare(a.x, squares[0]))!.audience, 'friends');
  assert.equal((await getMomentForSquare(a.x, squares[1]))!.audience, 'private');

  assert.ok(await hasNarrowerMoments(a.x, ug, 'public'));
  await setGridAudience(a.x, ug, 'public', true);
  assert.equal((await getMomentForSquare(a.x, squares[0]))!.audience, 'public');
  assert.equal((await getMomentForSquare(a.x, squares[1]))!.audience, 'public');
  assert.ok(!(await hasNarrowerMoments(a.x, ug, 'public')));
});

test('shared grids are listed for the Profile', async () => {
  const a = await phone(new FakeServer());
  const { ug } = await fallGrid(a.x);
  await adoptGrid(a.x, USER, 'grid_running');
  assert.equal((await listSharedGrids(a.x)).length, 0);
  await setGridAudience(a.x, ug, 'public');
  const shared = await listSharedGrids(a.x);
  assert.equal(shared.length, 1);
  assert.equal(shared[0].audience, 'public');
  assert.equal((await listShelf(a.x)).length, 2);
});

test('audiences sync to the other phone', async () => {
  const server = new FakeServer();
  const a = await phone(server);
  const b = await phone(server);
  const { ug, squares } = await fallGrid(a.x);
  await setGridAudience(a.x, ug, 'public');
  await saveMoment(a.x, squares[0], moment('hello', 'friends'));
  await a.sync();
  assert.equal(server.tables.user_grids.get(ug)?.audience, 'public');
  await backfill(b.x);
  await b.sync();
  assert.equal((await loadBoard(b.x, ug))!.audience, 'public');
  assert.equal((await getMomentForSquare(b.x, squares[0]))!.audience, 'friends');
});

test('a row from a server without audiences reads as private', () => {
  const r = fromServer('moments', { id: 'm', square_state_id: 's', title: 't', happened_on: '2026-10-25', updated_at: '2026-10-25T00:00:00Z' });
  assert.equal(r.audience, 'private');
});

test('a v3 phone upgrades and its unused show-moments switch becomes friends', async () => {
  const db = new TestDb();
  await migrate(asExpo(db));
  const { ug } = await fallGrid(asExpo(db));
  await db.execAsync(BEFORE_GROUPS);
  await db.execAsync(`ALTER TABLE user_grids DROP COLUMN audience; ALTER TABLE moments DROP COLUMN audience;
    UPDATE user_grids SET show_moments = 1; PRAGMA user_version = 3;`);
  await migrate(asExpo(db));
  assert.equal((await loadBoard(asExpo(db), ug))!.audience, 'friends');
});

test('friend links carry a code that scans back out', () => {
  const link = friendLink('ABCDEFGH2345');
  assert.match(link, /\/f\/ABCDEFGH2345$/);
  assert.equal(codeFrom(link), 'ABCDEFGH2345');
  assert.equal(codeFrom('abcdefgh2345'), 'ABCDEFGH2345');
  assert.equal(codeFrom('https://airstrive.vercel.app/app/f/ABCDEFGH2345?x=1'), 'ABCDEFGH2345');
  assert.equal(codeFrom('https://example.com/something'), null);
  assert.equal(codeFrom('short'), null);
});
