import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TestDb, asExpo } from './sqlite';
import { FakeServer, FakeDevice } from './fakeServer';
import { migrate, V1 } from '@/db/schema';
import { ensureStarterShelf } from '@/data/seed';
import { saveMoment, deleteMoment, spendFreebie, listShelf, listMoments, loadBoard, listPages, getChapter } from '@/db/repo';
import { syncOnce, backfill, syncStatus, push } from '@/sync/engine';

const USER = '11111111-1111-4111-8111-111111111111';

async function phone(server: FakeServer) {
  const db = new TestDb();
  await migrate(asExpo(db));
  const device = new FakeDevice();
  const remote = server.remote(device);
  const sync = () => syncOnce(asExpo(db), remote, device.local, USER);
  return { db, x: asExpo(db), device, remote, sync };
}

async function signIn(p: Awaited<ReturnType<typeof phone>>) {
  await p.sync(); // pull first so grids started elsewhere are kept
  await ensureStarterShelf(p.x, USER);
  await backfill(p.x);
  await p.sync();
}

async function revealedSquare(x: ReturnType<typeof asExpo>, gridTitle: string) {
  const g = (await listShelf(x)).find((s) => s.title === gridTitle)!;
  const b = (await loadBoard(x, g.userGridId))!;
  return { ug: g.userGridId, sq: b.squares.find((s) => s.state === 'revealed')! };
}

const moment = (body: string, photos: { id?: string; path: string }[] = []) => ({
  title: 'A prompt', body, happenedOn: '2026-10-25', place: '', weather: '', withPeople: '',
  photos: photos.map((p) => ({ ...p, width: 1600, height: 1200, bytes: 1000 })), coverIndex: 0,
});

test('a v0 phone upgrades without losing moments or photos', async () => {
  const db = new TestDb();
  await db.execAsync('PRAGMA foreign_keys = ON;');
  await db.execAsync(V1);
  await db.execAsync(`
    INSERT INTO grids VALUES ('grid_running','Running','#F5B61C','Movement','medium',8,10,'','AirStrive',1,'2026-10-01T00:00:00.000Z');
    INSERT INTO grid_squares VALUES ('grid_running',0,'Run before sunrise','','Time of day');
    INSERT INTO user_grids VALUES ('ug1','grid_running',4,'2026-10-01T00:00:00.000Z',NULL,0,'2026-10-01T00:00:00.000Z');
    INSERT INTO square_states VALUES ('ss1','ug1',0,'done','2026-10-02T00:00:00.000Z',0,'2026-10-02T00:00:00.000Z');
    INSERT INTO moments VALUES ('m1','ss1','Run before sunrise','Cold!','2026-10-02','','','','2026-10-02T00:00:00.000Z','2026-10-02T00:00:00.000Z');
    INSERT INTO photos VALUES ('p1','m1',0,'file:///var/mobile/Containers/Data/Application/ABC/Documents/photos/abc.webp',NULL,1,1600,1200,1,'2026-10-02T00:00:00.000Z');
    INSERT INTO sync_queue (tbl,row_id,op,payload,created_at) VALUES ('moments','m1','upsert','{}','2026-10-02');
    PRAGMA user_version = 1;
  `);
  await migrate(asExpo(db));
  const photo = await db.getFirstAsync<{ local_uri: string }>('SELECT local_uri FROM photos');
  assert.equal(photo?.local_uri, 'photos/abc.webp');
  const ms = await listMoments(asExpo(db));
  assert.equal(ms.length, 1);
  assert.equal(ms[0].body, 'Cold!');
  assert.equal(ms[0].photos.length, 1);
  assert.equal((await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) n FROM grids'))?.n, 6);
  assert.equal((await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) n FROM sync_queue'))?.n, 0);
  // Running was already started, so signing in adds only the other five.
  await ensureStarterShelf(asExpo(db), USER);
  const shelf = await listShelf(asExpo(db));
  assert.equal(shelf.length, 6);
  assert.equal(shelf.filter((g) => g.title === 'Running').length, 1);
});

test('two phones end up with the same shelf, moments and photos', async () => {
  const server = new FakeServer();
  const a = await phone(server);
  await signIn(a);
  assert.equal((await listShelf(a.x)).length, 6);
  assert.equal((await syncStatus(a.x)).pending, 0);

  const { sq } = await revealedSquare(a.x, 'Fall');
  a.device.files.set('photos/leaf.webp', 'LEAF');
  await saveMoment(a.x, sq.squareStateId, moment('Caught one', [{ path: 'photos/leaf.webp' }]));
  const r = await a.sync();
  assert.equal(r.uploaded, 1);
  assert.equal(server.storage.size, 1);

  const b = await phone(server);
  await signIn(b);
  const shelfB = await listShelf(b.x);
  assert.equal(shelfB.length, 6, 'no duplicate grids on the second phone');
  const msB = await listMoments(b.x);
  assert.equal(msB.length, 1);
  assert.equal(msB[0].body, 'Caught one');
  assert.equal(msB[0].photos.length, 1);
  assert.equal(b.device.files.get(msB[0].photos[0].path), 'LEAF');
  const fallB = shelfB.find((g) => g.title === 'Fall')!;
  assert.equal(fallB.done, 1);
  assert.equal(fallB.revealed, 4 - 1 + 2, 'neighbours revealed on the other phone too');
});

test('the newer edit wins, and deleting wins over editing', async () => {
  const server = new FakeServer();
  const a = await phone(server);
  await signIn(a);
  const b = await phone(server);
  await signIn(b);

  const { sq } = await revealedSquare(a.x, 'Chess');
  const { momentId } = await saveMoment(a.x, sq.squareStateId, moment('first'));
  await a.sync();
  await b.sync();

  await saveMoment(a.x, sq.squareStateId, moment('from A'));
  await new Promise((r) => setTimeout(r, 5));
  await saveMoment(b.x, sq.squareStateId, moment('from B, later'));
  await b.sync();
  await a.sync();
  await b.sync();
  assert.equal((await listMoments(a.x))[0].body, 'from B, later');
  assert.equal((await listMoments(b.x))[0].body, 'from B, later');

  await deleteMoment(a.x, momentId);
  await new Promise((r) => setTimeout(r, 5));
  await saveMoment(b.x, sq.squareStateId, moment('edited after the delete'));
  await a.sync();
  await b.sync();
  await a.sync();
  assert.equal((await listMoments(a.x)).length, 0);
  assert.equal((await listMoments(b.x)).length, 0, 'delete wins');
});

test('the same square logged on two offline phones settles on one moment', async () => {
  const server = new FakeServer();
  const a = await phone(server);
  await signIn(a);
  const b = await phone(server);
  await signIn(b);
  const { sq } = await revealedSquare(a.x, 'Wellness');
  a.device.files.set('photos/a.webp', 'A');
  await saveMoment(a.x, sq.squareStateId, moment('A wrote this', [{ path: 'photos/a.webp' }]));
  await new Promise((r) => setTimeout(r, 5));
  await saveMoment(b.x, sq.squareStateId, moment('B wrote this'));
  await a.sync();
  await b.sync();
  await a.sync();
  await b.sync();
  const ma = await listMoments(a.x);
  const mb = await listMoments(b.x);
  assert.equal(ma.length, 1);
  assert.equal(mb.length, 1);
  assert.equal(ma[0].body, 'B wrote this');
  assert.equal(mb[0].body, 'B wrote this');
  const live = [...server.tables.moments.values()].filter((m) => !m.deleted_at);
  assert.equal(live.length, 1, 'server has one live moment');
  assert.equal(server.storage.size, 0, "the retired moment's photo is removed from storage");
});

test('squares finished on two phones complete the grid and add a chapter', async () => {
  const server = new FakeServer();
  const a = await phone(server);
  await signIn(a);
  const b = await phone(server);
  await signIn(b);
  const fall = (await listShelf(a.x)).find((g) => g.title === 'Fall')!;
  // Finish every square on A but the last, sync, and finish the last on B.
  for (;;) {
    const board = (await loadBoard(a.x, fall.userGridId))!;
    const open = board.squares.filter((s) => s.state !== 'done');
    if (open.length === 1) break;
    const next = open.find((s) => s.state === 'revealed')!;
    await saveMoment(a.x, next.squareStateId, moment(`did ${next.idx}`));
  }
  await a.sync();
  await b.sync();
  const last = (await loadBoard(b.x, fall.userGridId))!.squares.find((s) => s.state === 'revealed')!;
  const res = await saveMoment(b.x, last.squareStateId, moment('the last one'));
  assert.equal(res.completedGrid, fall.userGridId);
  await b.sync();
  await a.sync();
  const chapter = await getChapter(a.x, fall.userGridId);
  assert.ok(chapter, 'A sees the grid complete');
  assert.equal(chapter!.momentCount, 48);
  assert.equal(chapter!.tiles.length, 48);
  const pages = await listPages(a.x);
  assert.equal(pages[0].kind, 'chapter', 'the chapter cover is the newest page');
  assert.equal(pages.length, 49);

  // Removing a moment un-finishes the grid and the chapter goes away.
  await deleteMoment(a.x, (await listMoments(a.x))[0].id);
  assert.equal(await getChapter(a.x, fall.userGridId), null);
});

test('a failed push backs off and keeps the change; an edit during upload stays queued', async () => {
  const server = new FakeServer();
  const a = await phone(server);
  await signIn(a);
  const { sq } = await revealedSquare(a.x, 'Running');
  await saveMoment(a.x, sq.squareStateId, moment('offline'));
  server.failNext = 1;
  const r = await push(a.x, a.remote);
  assert.equal(r.failed, true);
  const q = await a.db.getAllAsync<{ tbl: string; attempts: number; next_attempt_at: string | null }>('SELECT tbl, attempts, next_attempt_at FROM sync_queue');
  assert.ok(q.some((x) => x.tbl === 'moments'), 'the moment is still queued');
  assert.ok(q.some((x) => x.attempts === 1 && x.next_attempt_at), 'the failed batch is scheduled for a retry');
  await a.db.runAsync('UPDATE sync_queue SET next_attempt_at = NULL');

  let edited = false;
  server.onUpsert = async (table) => {
    if (table === 'moments' && !edited) {
      edited = true;
      await saveMoment(a.x, sq.squareStateId, moment('edited mid-flight'));
    }
  };
  await push(a.x, a.remote);
  server.onUpsert = undefined;
  assert.ok((await syncStatus(a.x)).pending > 0, 'mid-flight edit still queued');
  await push(a.x, a.remote);
  const onServer = [...server.tables.moments.values()][0];
  assert.equal(onServer.body, 'edited mid-flight');
});

test('freebies sync and do not refill', async () => {
  const server = new FakeServer();
  const a = await phone(server);
  await signIn(a);
  const { ug, sq } = await revealedSquare(a.x, 'Us and the dog');
  assert.ok(await spendFreebie(a.x, sq.squareStateId));
  await a.sync();
  const b = await phone(server);
  await signIn(b);
  const g = (await listShelf(b.x)).find((s) => s.userGridId === ug)!;
  assert.equal(g.freebiesLeft, 1);
  assert.equal(g.done, 1);
});
