import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TestDb, asExpo } from './sqlite';
import { FakeServer, FakeDevice } from './fakeServer';
import { migrate } from '@/db/schema';
import { startGrid } from '@/data/seed';
import { loadBoard, listMoments, listShelf, saveMoment } from '@/db/repo';
import { syncOnce, syncStatus } from '@/sync/engine';
import { getGroupMoment, listGroupPeople, removeMyPart, saveGroupMoment, togetherLine, type GroupMomentInput } from '@/groups/repo';

const PAUL = '11111111-1111-4111-8111-111111111111';
const SAM = '22222222-2222-4222-8222-222222222222';

async function phone(server: FakeServer, userId: string) {
  const db = new TestDb();
  const x = asExpo(db);
  await migrate(x);
  const device = new FakeDevice();
  const remote = server.remote(device, userId);
  const sync = async () => {
    const r = await syncOnce(x, remote, device.local, userId);
    // Nothing the server turns away: the phone never writes someone else's rows.
    assert.equal(r.error, undefined, r.error);
    assert.equal((await syncStatus(x)).failed, 0);
    return r;
  };
  return { db, x, device, sync, userId };
}

const part = (body: string, extra: Partial<GroupMomentInput> = {}): GroupMomentInput => ({
  title: 'A prompt', happenedOn: '2026-10-25', place: '', weather: '', withPeople: '', body, audience: 'group', photos: [], ...extra,
});

/** Paul starts a grid, makes it a group grid, and Sam joins. */
async function together() {
  const server = new FakeServer();
  server.usernames.set(PAUL, 'Paul');
  server.usernames.set(SAM, 'Sam');
  const paul = await phone(server, PAUL);
  const sam = await phone(server, SAM);
  const ug = await startGrid(paul.x, 'grid_fall');
  const revealed = (await loadBoard(paul.x, ug))!.squares.filter((s) => s.state === 'revealed').map((s) => s.squareStateId);
  await paul.sync();
  server.makeGroup(ug, PAUL);
  server.join(ug, SAM);
  await paul.sync();
  await sam.sync();
  return { server, paul, sam, ug, revealed };
}

test('a grid made into a group grid keeps what was written, and a friend who joins gets all of it', async () => {
  const server = new FakeServer();
  server.usernames.set(PAUL, 'Paul');
  server.usernames.set(SAM, 'Sam');
  const paul = await phone(server, PAUL);
  const ug = await startGrid(paul.x, 'grid_fall');
  const sq = (await loadBoard(paul.x, ug))!.squares.find((s) => s.state === 'revealed')!;
  paul.device.files.set('photos/apple.webp', 'APPLE');
  await saveMoment(paul.x, sq.squareStateId, {
    title: 'A prompt', body: 'Apple picking', happenedOn: '2026-10-20', place: '', weather: '', withPeople: '',
    photos: [{ path: 'photos/apple.webp', width: 1, height: 1, bytes: 1 }], coverIndex: 0,
  });
  await paul.sync();

  server.makeGroup(ug, PAUL, true);
  await paul.sync();
  const mine = (await getGroupMoment(paul.x, sq.squareStateId, PAUL))!;
  assert.equal(mine.entries.length, 1, 'the words became Paul\'s entry');
  assert.equal(mine.entries[0].body, 'Apple picking');
  assert.ok(mine.entries[0].mine);
  assert.equal(mine.photos.length, 1);

  server.join(ug, SAM);
  const sam = await phone(server, SAM);
  await sam.sync();
  const shelf = await listShelf(sam.x);
  assert.equal(shelf.length, 1, 'the group grid is on Sam\'s shelf');
  assert.equal(shelf[0].done, 1);
  const seen = (await getGroupMoment(sam.x, sq.squareStateId, SAM))!;
  assert.equal(seen.entries[0].name, 'Paul');
  assert.equal(seen.entries[0].body, 'Apple picking');
  assert.equal(seen.photos.length, 1, 'and the photo downloads');
  assert.equal(togetherLine(await listGroupPeople(sam.x, ug), SAM), 'With Paul');
  assert.equal((await listMoments(sam.x))[0].body, 'Apple picking', 'Memory Lane shows the words');
});

test('each person adds their own words and photos to a shared square', async () => {
  const { paul, sam, revealed } = await together();
  await saveGroupMoment(paul.x, revealed[0], PAUL, part('Paul was here', { title: 'Pie night' }));
  await paul.sync();
  await sam.sync();

  sam.device.files.set('photos/pie.webp', 'PIE');
  await saveGroupMoment(sam.x, revealed[0], SAM, part('Sam too', {
    title: 'Pie night', photos: [{ path: 'photos/pie.webp', width: 1, height: 1, bytes: 1, audience: 'group' }],
  }));
  await sam.sync();
  await paul.sync();

  const m = (await getGroupMoment(paul.x, revealed[0], PAUL))!;
  assert.deepEqual(m.entries.map((e) => [e.name, e.body]), [['You', 'Paul was here'], ['Sam', 'Sam too']]);
  assert.equal(m.photos.length, 1);
  assert.equal(m.photos[0].name, 'Sam');
  assert.ok(!m.photos[0].mine);

  // Sam changes the shared title; Paul's words stay his.
  await saveGroupMoment(sam.x, revealed[0], SAM, part('Sam too', {
    title: 'Pie night!', photos: [{ id: (await getGroupMoment(sam.x, revealed[0], SAM))!.photos[0].id, path: 'photos/pie.webp', width: 1, height: 1, bytes: 1, audience: 'group' }],
  }));
  await sam.sync();
  await paul.sync();
  const after = (await getGroupMoment(paul.x, revealed[0], PAUL))!;
  assert.equal(after.title, 'Pie night!');
  assert.equal(after.entries.find((e) => e.mine)!.body, 'Paul was here');
});

test('a square two people log while apart settles on the first moment and keeps both parts', async () => {
  const { paul, sam, revealed } = await together();
  await saveGroupMoment(sam.x, revealed[1], SAM, part('Sam first', { title: 'First title' }));
  await new Promise((r) => setTimeout(r, 5));
  paul.device.files.set('photos/p.webp', 'P');
  await saveGroupMoment(paul.x, revealed[1], PAUL, part('Paul later', {
    title: 'Later title', photos: [{ path: 'photos/p.webp', width: 1, height: 1, bytes: 1, audience: 'group' }],
  }));
  await paul.sync();
  await sam.sync();
  await paul.sync();
  await sam.sync();

  for (const [p, me] of [[paul, PAUL], [sam, SAM]] as const) {
    const m = (await getGroupMoment(p.x, revealed[1], me))!;
    assert.equal(m.title, 'First title', 'the first moment\'s details stay');
    assert.deepEqual(m.entries.map((e) => e.body).sort(), ['Paul later', 'Sam first'], 'both entries');
    assert.equal(m.photos.length, 1, 'and Paul\'s photo');
    const live = await p.db.getFirstAsync<{ n: number }>(
      'SELECT COUNT(*) AS n FROM moments WHERE square_state_id = ? AND deleted_at IS NULL', revealed[1],
    );
    assert.equal(live?.n, 1);
  }
});

test('Private words stay with their author, and words made Private later leave the others\' phones', async () => {
  const { paul, sam, revealed } = await together();
  await saveGroupMoment(sam.x, revealed[0], SAM, part('just for me', { audience: 'private' }));
  await saveGroupMoment(sam.x, revealed[1], SAM, part('for both of us'));
  await sam.sync();
  await paul.sync();

  const board = (await loadBoard(paul.x, (await listShelf(paul.x))[0].userGridId))!;
  assert.equal(board.squares.find((s) => s.squareStateId === revealed[0])!.state, 'done', 'a Private square still shows as done');
  assert.equal((await getGroupMoment(paul.x, revealed[0], PAUL))!.entries.length, 0, 'without its words');
  assert.equal((await getGroupMoment(paul.x, revealed[1], PAUL))!.entries.length, 1);

  await saveGroupMoment(sam.x, revealed[1], SAM, part('for both of us', { audience: 'private' }));
  await sam.sync();
  await paul.sync();
  assert.equal((await getGroupMoment(paul.x, revealed[1], PAUL))!.entries.length, 0, 'gone from Paul\'s phone');
  assert.equal((await getGroupMoment(sam.x, revealed[1], SAM))!.entries.length, 1, 'still on Sam\'s');
});

test('leaving takes the grid off the phone and leaves your words for the others', async () => {
  const { server, paul, sam, ug, revealed } = await together();
  await saveGroupMoment(sam.x, revealed[0], SAM, part('Sam was here'));
  await sam.sync();
  server.leave(ug, SAM);
  await sam.sync();
  assert.equal((await listShelf(sam.x)).length, 0, 'off Sam\'s shelf');
  assert.equal((await sam.db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM moment_entries'))?.n, 0);

  await paul.sync();
  const m = (await getGroupMoment(paul.x, revealed[0], PAUL))!;
  assert.equal(m.entries[0].body, 'Sam was here', 'Paul keeps Sam\'s words');
});

test('removing your part keeps a square someone else added to', async () => {
  const { paul, sam, revealed } = await together();
  await saveGroupMoment(paul.x, revealed[0], PAUL, part('Paul'));
  await paul.sync();
  await sam.sync();
  await saveGroupMoment(sam.x, revealed[0], SAM, part('Sam'));
  await sam.sync();

  const momentId = (await getGroupMoment(sam.x, revealed[0], SAM))!.id;
  const r = await removeMyPart(sam.x, momentId, SAM);
  assert.ok(!r.unchecked, 'Paul\'s words keep the square done');
  await sam.sync();
  await paul.sync();
  const m = (await getGroupMoment(paul.x, revealed[0], PAUL))!;
  assert.deepEqual(m.entries.map((e) => e.body), ['Paul']);

  const r2 = await removeMyPart(paul.x, momentId, PAUL);
  assert.ok(r2.unchecked, 'the last part out unchecks it');
  await paul.sync();
  await sam.sync();
  const board = (await loadBoard(sam.x, (await listShelf(sam.x))[0].userGridId))!;
  assert.equal(board.squares.find((s) => s.squareStateId === revealed[0])!.state, 'revealed');
});
