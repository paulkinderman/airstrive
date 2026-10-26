import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TestDb, asExpo, BEFORE_GROUPS } from './sqlite';
import { FakeServer, FakeDevice } from './fakeServer';
import { migrate } from '@/db/schema';
import { adoptGrid } from '@/data/seed';
import { SIZES, neighbours, spiralOrder, startingSquares, type GridSize } from '@/data/types';
import { STARTERS } from '@/data/starters';
import { createGrid, listShelf, loadBoard, removeFromShelf, setGridShared, saveMoment } from '@/db/repo';
import { setMeta } from '@/db/queue';
import { syncOnce, backfill, wipeLocal, pull } from '@/sync/engine';
import { INTERESTS, rankThemes } from '@/atlas/themes';
import { byTheme, featured, picksFor, searchAtlas, startersFrom, type AtlasGrid } from '@/atlas/picks';
import { layOut, similar, suggestRest } from '@/suggest/suggest';

const USER = '11111111-1111-4111-8111-111111111111';

async function phone(server: FakeServer) {
  const db = new TestDb();
  await migrate(asExpo(db));
  const device = new FakeDevice();
  const remote = server.remote(device);
  const sync = () => syncOnce(asExpo(db), remote, device.local, USER);
  return { db, x: asExpo(db), device, remote, sync };
}

const atlas: AtlasGrid[] = STARTERS.map((g) => ({
  id: g.id, title: g.title, color: g.color, theme: g.theme, size: g.size, cols: SIZES[g.size].cols, rows: SIZES[g.size].rows,
  description: g.description, madeBy: 'AirStrive', authorId: null, isOfficial: true, sharedAt: null, starters: [],
}));

const board = (size: GridSize, n = SIZES[size].cols * SIZES[size].rows) =>
  Array.from({ length: n }, (_, i) => `Square number ${String.fromCharCode(65 + (i % 26))}${Math.floor(i / 26)}`);

// ---------- interests and picks ----------

test('interest ids are unique and every interest maps to a theme', () => {
  assert.equal(new Set(INTERESTS.map((i) => i.id)).size, INTERESTS.length);
  for (const i of INTERESTS) assert.ok(i.themes.length > 0, i.id);
});

test('themes rank by interests, first theme counting most', () => {
  const r = rankThemes(['running', 'cycling', 'walking']);
  assert.equal(r[0].theme, 'Movement');
  assert.deepEqual(r[0].because, ['Running', 'Cycling', 'Walking and hiking']);
  assert.ok(r.some((t) => t.theme === 'Outdoors'));
  assert.deepEqual(rankThemes([]), []);
  assert.deepEqual(rankThemes(['not-an-interest']), []);
});

test('onboarding picks lead with the matching categories and skip empty ones', () => {
  const p = picksFor(['pets', 'chess', 'cooking'], atlas);
  assert.deepEqual(p.map((x) => x.theme), ['Games', 'Family'], 'Food has no grids yet, so it is left out');
  assert.equal(p[1].grids[0].id, 'grid_us_and_the_dog');
  assert.deepEqual(picksFor([], atlas), []);
  assert.ok(picksFor(INTERESTS.map((i) => i.id), atlas).length <= 4);
});

test('atlas rows, search and the season strip', () => {
  const rows = byTheme(atlas);
  assert.equal(rows.reduce((n, r) => n + r.grids.length, 0), STARTERS.length);
  assert.deepEqual(searchAtlas(atlas, 'york').map((g) => g.id), ['grid_new_york_city']);
  assert.equal(searchAtlas(atlas, '').length, atlas.length);
  assert.equal(featured(atlas, new Date(2026, 9, 25))[0].id, 'grid_fall', 'fall leads in October');
});

test('starters are the squares revealed at the start, in board order', () => {
  const squares = Array.from({ length: 20 }, (_, idx) => ({ idx, prompt: `p${idx}` }));
  assert.deepEqual(startersFrom('tiny', squares), ['p9', 'p10']);
});

// ---------- laying out a made grid ----------

test('the spiral covers the board once and starts on the starting squares', () => {
  for (const size of Object.keys(SIZES) as GridSize[]) {
    const { cols, rows } = SIZES[size];
    const order = spiralOrder(size);
    assert.equal(order.length, cols * rows, size);
    assert.equal(new Set(order).size, cols * rows, `${size} unique`);
    const start = startingSquares(size);
    assert.deepEqual(order.slice(0, start.length).sort((a, b) => a - b), [...start].sort((a, b) => a - b), `${size} starts in the middle`);
    // While the spiral is inside the board, each step touches the last.
    const inner = Math.min(cols, rows) ** 2 - 1;
    for (let i = 1; i < Math.min(inner, order.length); i++) {
      assert.ok(neighbours(order[i - 1], cols, rows).includes(order[i]), `${size} step ${i}`);
    }
  }
});

test('own squares are placed where the grid starts', () => {
  const own = ['Mine one', 'Mine two', 'Mine three', 'Mine four'];
  const rest = board('small', 44).map((prompt) => ({ prompt, cluster: 'Bank' }));
  const squares = layOut('small', own, rest);
  const start = startingSquares('small');
  assert.deepEqual(squares.filter((s) => start.includes(s.idx)).map((s) => s.prompt).sort(), [...own].sort());
  assert.throws(() => layOut('small', own, rest.slice(1)));
});

// ---------- suggest the rest ----------

test('suggestions fill exactly the squares left, with nothing repeated', () => {
  for (const size of Object.keys(SIZES) as GridSize[]) {
    const total = SIZES[size].cols * SIZES[size].rows;
    const taken = ['Play a song for someone', 'Learn a song by ear'];
    const out = suggestRest({ name: 'Learning the piano', theme: 'Making', taken, count: total - taken.length });
    assert.equal(out.length, total - taken.length, size);
    for (let i = 0; i < out.length; i++) {
      assert.ok(!/\d/.test(out[i].prompt));
      for (const t of taken) assert.ok(!similar(t, out[i].prompt), `${out[i].prompt} repeats ${t}`);
      for (let j = i + 1; j < out.length; j++) assert.ok(!similar(out[i].prompt, out[j].prompt), `${out[i].prompt} / ${out[j].prompt}`);
    }
  }
});

test('the grid name leads the suggestions and rejected ones stay out', () => {
  const first = suggestRest({ name: 'Learning the piano', theme: 'Making', taken: [], count: 6, seed: 3 });
  assert.ok(first.every((s) => s.cluster === first[0].cluster), 'the first few come from one cluster');
  const again = suggestRest({ name: 'Learning the piano', theme: 'Making', taken: [], rejected: first.map((s) => s.prompt), count: 20, seed: 3 });
  for (const s of again) assert.ok(!first.some((f) => f.prompt === s.prompt));
  const sameSeed = suggestRest({ name: 'Learning the piano', theme: 'Making', taken: [], count: 6, seed: 3 });
  assert.deepEqual(sameSeed, first, 'same seed, same suggestions');
});

test('suggestions for any subject still fill a full board', () => {
  const out = suggestRest({ name: 'Zorbing', theme: 'Movement', taken: [], count: 120 });
  assert.equal(out.length, 120);
});

// ---------- adopting, making, sharing, syncing ----------

test('adopting a grid on two phones makes one copy; adding it again after removing starts fresh', async () => {
  const server = new FakeServer();
  const a = await phone(server);
  const b = await phone(server);
  const ugA = await adoptGrid(a.x, USER, 'grid_chess');
  const ugB = await adoptGrid(b.x, USER, 'grid_chess');
  assert.equal(ugA, ugB);
  assert.equal(await adoptGrid(a.x, USER, 'grid_chess'), ugA, 'adopting twice returns the same copy');
  await a.sync();
  await b.sync();
  assert.equal(server.tables.user_grids.size, 1);

  assert.ok(await removeFromShelf(a.x, ugA));
  assert.equal((await listShelf(a.x)).length, 0);
  await a.sync();
  await b.sync();
  assert.equal((await listShelf(b.x)).length, 0, 'removal syncs');
  const again = await adoptGrid(a.x, USER, 'grid_chess');
  assert.notEqual(again, ugA);
  assert.equal((await listShelf(a.x)).length, 1);
});

test('a grid with moments cannot be removed', async () => {
  const a = await phone(new FakeServer());
  const ug = await adoptGrid(a.x, USER, 'grid_fall');
  const sq = (await loadBoard(a.x, ug))!.squares.find((s) => s.state === 'revealed')!;
  await saveMoment(a.x, sq.squareStateId, { title: 't', body: '', happenedOn: '2026-10-25', place: '', weather: '', withPeople: '', photos: [], coverIndex: 0 });
  assert.equal(await removeFromShelf(a.x, ug), false);
  assert.equal((await listShelf(a.x)).length, 1);
});

test('a made grid syncs to the server before its shelf copy, and reaches a second phone', async () => {
  const server = new FakeServer();
  const a = await phone(server);
  const squares = layOut('tiny', ['Play a scale with eyes closed'], board('tiny', 19).map((prompt) => ({ prompt, cluster: 'Bank' })));
  const order: string[] = [];
  server.onUpsert = async (table) => { order.push(`${table}:${server.grids.size}`); };
  const ug = await createGrid(a.x, USER, { title: 'Piano', color: '#9C8CB8', theme: 'Making', size: 'tiny', description: '', isPublic: false, squares });
  await a.sync();
  assert.equal(server.grids.size, 1);
  const [saved] = server.grids.values();
  assert.equal(saved.squares.length, 20);
  assert.equal(saved.grid.is_public, false);
  assert.equal(order[0], 'user_grids:1', 'grid saved before the shelf rows');

  const b = await phone(server);
  await b.sync();
  const shelf = await listShelf(b.x);
  assert.equal(shelf.length, 1);
  const boardB = (await loadBoard(b.x, shelf[0].userGridId))!;
  assert.equal(boardB.title, 'Piano');
  assert.equal(boardB.squares.find((s) => s.state === 'revealed' && s.prompt === 'Play a scale with eyes closed')?.prompt, 'Play a scale with eyes closed');
  assert.equal(shelf[0].userGridId, ug);
});

test('sharing pushes, and a suspended account gets its grid back as private', async () => {
  const server = new FakeServer();
  const a = await phone(server);
  const squares = layOut('tiny', [], board('tiny').map((prompt) => ({ prompt, cluster: 'Bank' })));
  await createGrid(a.x, USER, { title: 'Pottery', color: '#D4A190', theme: 'Making', size: 'tiny', description: '', isPublic: false, squares });
  await a.sync();
  const [id] = server.grids.keys();
  await new Promise((r) => setTimeout(r, 5));
  await setGridShared(a.x, id, true);
  await a.sync();
  assert.equal(server.grids.get(id)!.grid.is_public, true);

  server.suspended = true;
  await setGridShared(a.x, id, false);
  await new Promise((r) => setTimeout(r, 5));
  await setGridShared(a.x, id, true);
  await a.sync();
  assert.equal(server.grids.get(id)!.grid.is_public, false);
  const local = await a.db.getFirstAsync<{ is_public: number }>('SELECT is_public FROM grids WHERE id = ?', id);
  assert.equal(local?.is_public, 0);
});

test('a failing grid save is retried without blocking other changes', async () => {
  const server = new FakeServer();
  const a = await phone(server);
  await adoptGrid(a.x, USER, 'grid_running');
  const squares = layOut('tiny', [], board('tiny').map((prompt) => ({ prompt, cluster: 'Bank' })));
  await createGrid(a.x, USER, { title: 'X', color: '#2EB08A', theme: 'Mind', size: 'tiny', description: '', isPublic: false, squares });
  server.failNext = 1;
  const r = await a.sync();
  assert.ok(r.error);
  assert.ok([...server.tables.user_grids.values()].some((u) => u.grid_id === 'grid_running'), 'the official grid synced anyway');
});

test('interests from onboarding are sent once there is a connection', async () => {
  const server = new FakeServer();
  const a = await phone(server);
  await setMeta(a.x, 'interests', JSON.stringify(['chess', 'pets']));
  await setMeta(a.x, 'onboarded_at', '2026-10-26T10:00:00.000Z');
  await setMeta(a.x, 'profile_dirty', '1');
  server.failNext = 1;
  const first = await a.sync();
  assert.ok(first.error);
  assert.equal(server.profile, null);
  await a.sync();
  assert.deepEqual(server.profile, { interests: ['chess', 'pets'], onboarded_at: '2026-10-26T10:00:00.000Z' });
});

test('signing out removes grids people made but keeps the official ones', async () => {
  const a = await phone(new FakeServer());
  const squares = layOut('tiny', [], board('tiny').map((prompt) => ({ prompt, cluster: 'Bank' })));
  await createGrid(a.x, USER, { title: 'Mine', color: '#2EB08A', theme: 'Mind', size: 'tiny', description: '', isPublic: false, squares });
  await wipeLocal(a.x);
  const n = await a.db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM grids');
  assert.equal(n?.n, 6);
  const sq = await a.db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM grid_squares');
  assert.equal(sq?.n, 424);
});

test('a v1 phone upgrades and marks its grids official', async () => {
  const db = new TestDb();
  await migrate(asExpo(db));
  await db.execAsync(BEFORE_GROUPS);
  await db.execAsync(`ALTER TABLE grids DROP COLUMN is_official; ALTER TABLE grids DROP COLUMN author_id;
    ALTER TABLE user_grids DROP COLUMN audience; ALTER TABLE moments DROP COLUMN audience; PRAGMA user_version = 2;`);
  await migrate(asExpo(db));
  const r = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM grids WHERE is_official = 1');
  assert.equal(r?.n, 6);
  void backfill; void pull;
});
