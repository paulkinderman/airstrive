// The board rules from the brief, checked on the real repo code over node:sqlite.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TestDb, asExpo } from './sqlite';
import { migrate } from '@/db/schema';
import { startGrid } from '@/data/seed';
import { saveMoment, deleteMoment, spendFreebie, loadBoard, getChapter, listPages, listShelf } from '@/db/repo';
import { SIZES, startingSquares, type GridSize } from '@/data/types';

type X = ReturnType<typeof asExpo>;
type Board = NonNullable<Awaited<ReturnType<typeof loadBoard>>>;

const moment = (body = '', photos: { id?: string; path: string }[] = [], coverIndex = 0) => ({
  title: 'A prompt', body, happenedOn: '2026-10-25', place: '', weather: '', withPeople: '',
  photos: photos.map((p) => ({ ...p, width: 1600, height: 1200, bytes: 1000 })), coverIndex,
});

async function freshDb() {
  const db = new TestDb();
  await migrate(asExpo(db));
  return asExpo(db);
}

/** A made-up grid of any size, so every size gets checked, not only the starters'. */
async function gridOfSize(x: X, size: GridSize) {
  const { cols, rows } = SIZES[size];
  const id = `grid_test_${size}`;
  await x.runAsync(
    `INSERT INTO grids (id, title, color, theme, size, cols, rows, description, made_by, is_public, updated_at)
     VALUES (?, ?, '#3B9BE0', 'Test', ?, ?, ?, '', 'AirStrive', 1, '2026-10-25T00:00:00.000Z')`,
    id, `Test ${size}`, size, cols, rows,
  );
  for (let i = 0; i < cols * rows; i++) {
    await x.runAsync('INSERT INTO grid_squares (grid_id, idx, prompt, hint, cluster) VALUES (?, ?, ?, ?, ?)', id, i, `Prompt ${i}`, '', '');
  }
  return startGrid(x, id);
}

const board = async (x: X, ug: string) => (await loadBoard(x, ug))!;
const at = (b: Board, idx: number) => b.squares.find((s) => s.idx === idx)!;
const stateMap = (b: Board) => new Map(b.squares.map((s) => [s.idx, s.state]));

for (const size of Object.keys(SIZES) as GridSize[]) {
  test(`${size}: starts with the middle squares open and the right freebies`, async () => {
    const x = await freshDb();
    const ug = await gridOfSize(x, size);
    const b = await board(x, ug);
    const { cols, rows, freebies } = SIZES[size];
    assert.equal(b.squares.length, cols * rows);
    assert.equal(b.freebiesLeft, freebies);
    const open = b.squares.filter((s) => s.state === 'revealed').map((s) => s.idx).sort((p, q) => p - q);
    assert.deepEqual(open, startingSquares(size).sort((p, q) => p - q));
    assert.equal(open.length, size === 'tiny' ? 5 : 4);
    // The open squares sit around the board's centre.
    for (const i of open) {
      const r = Math.floor(i / cols), c = i % cols;
      assert.ok(Math.abs(r - (rows - 1) / 2) <= 1 && Math.abs(c - (cols - 1) / 2) <= (size === 'tiny' ? 1.5 : 1), `${i} is central`);
    }
  });

  test(`${size}: every square can be reached by finishing neighbours`, async () => {
    const x = await freshDb();
    const ug = await gridOfSize(x, size);
    let res;
    for (;;) {
      const next = (await board(x, ug)).squares.find((s) => s.state === 'revealed');
      if (!next) break;
      res = await saveMoment(x, next.squareStateId, moment(`#${next.idx}`));
    }
    const b = await board(x, ug);
    assert.ok(b.squares.every((s) => s.state === 'done'), 'no square left hidden');
    assert.equal(res?.completedGrid, ug, 'the last moment finishes the grid');
    assert.ok(b.completedAt);
  });
}

test('finishing a square reveals its four neighbours and never a diagonal', async () => {
  const x = await freshDb();
  const ug = await gridOfSize(x, 'medium'); // 8×10, starts with 35, 36, 43, 44
  const before = stateMap(await board(x, ug));
  await saveMoment(x, at(await board(x, ug), 35).squareStateId, moment());
  const after = stateMap(await board(x, ug));
  assert.equal(after.get(35), 'done');
  for (const n of [27, 34]) assert.equal(after.get(n), 'revealed', `orthogonal ${n} revealed`);
  for (const d of [26, 28, 42]) assert.equal(after.get(d), 'hidden', `diagonal ${d} stays hidden`);
  const changed = [...after].filter(([i, s]) => before.get(i) !== s).map(([i]) => i).sort((p, q) => p - q);
  assert.deepEqual(changed, [27, 34, 35], 'nothing else moved');
});

test('a square on the edge reveals only the neighbours it has', async () => {
  const x = await freshDb();
  const ug = await gridOfSize(x, 'tiny'); // 4×5, starts with 9, 10
  // Walk left to the edge: finishing 9 reveals 8, then finishing 8 must not wrap to 7.
  await saveMoment(x, at(await board(x, ug), 9).squareStateId, moment());
  await saveMoment(x, at(await board(x, ug), 8).squareStateId, moment());
  const s = stateMap(await board(x, ug));
  assert.equal(s.get(4), 'revealed');
  assert.equal(s.get(12), 'revealed');
  assert.equal(s.get(7), 'hidden', 'no wrap to the previous row');
});

test('deleting a moment returns the square to revealed and keeps its neighbours open', async () => {
  const x = await freshDb();
  const ug = await gridOfSize(x, 'small');
  const sq = (await board(x, ug)).squares.find((s) => s.state === 'revealed')!;
  const { momentId } = await saveMoment(x, sq.squareStateId, moment('hello', [{ path: 'photos/a.webp' }]));
  const opened = stateMap(await board(x, ug));
  const res = await deleteMoment(x, momentId);
  assert.deepEqual(res.removedFiles, ['photos/a.webp'], 'the photo file is handed back for removal');
  const after = await board(x, ug);
  assert.equal(at(after, sq.idx).state, 'revealed');
  assert.equal(at(after, sq.idx).momentId, null);
  for (const [i, st] of opened) if (i !== sq.idx) assert.equal(stateMap(after).get(i), st, `square ${i} unchanged`);
  // And it can be logged again.
  await saveMoment(x, sq.squareStateId, moment('again'));
  assert.equal(at(await board(x, ug), sq.idx).state, 'done');
});

test('editing a moment keeps one moment per square and keeps photo ids', async () => {
  const x = await freshDb();
  const ug = await gridOfSize(x, 'small');
  const sq = (await board(x, ug)).squares.find((s) => s.state === 'revealed')!;
  const first = await saveMoment(x, sq.squareStateId, moment('v1', [{ path: 'photos/a.webp' }, { path: 'photos/b.webp' }]));
  const ids = (await x.getAllAsync<{ id: string }>('SELECT id FROM photos ORDER BY position')).map((p) => p.id);
  const second = await saveMoment(x, sq.squareStateId, moment('v2', [{ id: ids[1], path: 'photos/b.webp' }, { path: 'photos/c.webp' }], 1));
  assert.equal(second.momentId, first.momentId);
  assert.deepEqual(second.removedFiles, ['photos/a.webp']);
  const live = await x.getAllAsync<{ id: string; local_uri: string; is_cover: number }>(
    'SELECT id, local_uri, is_cover FROM photos WHERE deleted_at IS NULL ORDER BY position',
  );
  assert.equal(live[0].id, ids[1], 'kept photo keeps its id');
  assert.deepEqual(live.map((p) => [p.local_uri, p.is_cover]), [['photos/b.webp', 0], ['photos/c.webp', 1]]);
  assert.equal((await x.getFirstAsync<{ n: number }>('SELECT COUNT(*) n FROM moments WHERE deleted_at IS NULL'))!.n, 1);
  const tile = at(await board(x, ug), sq.idx);
  assert.equal(tile.photoUris.length, 2);
  assert.ok(tile.coverUri!.endsWith('photos/c.webp'), 'cover photo shows first on the tile');
});

test('freebies: only on revealed squares, show solid, reveal neighbours, never refill', async () => {
  const x = await freshDb();
  const ug = await gridOfSize(x, 'small'); // 2 freebies
  let b = await board(x, ug);
  const hidden = b.squares.find((s) => s.state === 'hidden')!;
  assert.equal(await spendFreebie(x, hidden.squareStateId), null, 'not on a hidden square');

  const [s1, s2, s3] = b.squares.filter((s) => s.state === 'revealed');
  assert.ok(await spendFreebie(x, s1.squareStateId));
  b = await board(x, ug);
  assert.equal(b.freebiesLeft, 1);
  assert.equal(at(b, s1.idx).state, 'done');
  assert.equal(at(b, s1.idx).viaFreebie, true);
  assert.equal(at(b, s1.idx).momentId, null, 'a freebie has no moment');
  assert.ok(b.squares.filter((s) => s.state === 'revealed').length > 3, 'neighbours revealed');
  assert.equal(await spendFreebie(x, s1.squareStateId), null, 'not on a done square');

  // Logging a moment on a freebie square turns it into a normal moment; the freebie is not refunded.
  await saveMoment(x, s1.squareStateId, moment('did it anyway'));
  b = await board(x, ug);
  assert.equal(at(b, s1.idx).viaFreebie, false);
  assert.equal(b.freebiesLeft, 1);

  assert.ok(await spendFreebie(x, s2.squareStateId));
  assert.equal((await board(x, ug)).freebiesLeft, 0);
  assert.equal(await spendFreebie(x, s3.squareStateId), null, 'none left');
  // Deleting a moment does not give one back either.
  const m = await x.getFirstAsync<{ id: string }>('SELECT id FROM moments WHERE deleted_at IS NULL');
  await deleteMoment(x, m!.id);
  assert.equal((await board(x, ug)).freebiesLeft, 0);
});

test('a freebie can finish a grid, and the chapter counts only real moments', async () => {
  const x = await freshDb();
  const ug = await gridOfSize(x, 'tiny'); // 20 squares, 1 freebie
  for (;;) {
    const open = (await board(x, ug)).squares.filter((s) => s.state !== 'done');
    if (open.length === 1) {
      assert.equal(open[0].state, 'revealed');
      const res = await spendFreebie(x, open[0].squareStateId);
      assert.equal(res?.completedGrid, ug);
      break;
    }
    await saveMoment(x, open.find((s) => s.state === 'revealed')!.squareStateId, moment());
  }
  const chapter = await getChapter(x, ug);
  assert.ok(chapter);
  assert.equal(chapter!.momentCount, 19);
  assert.equal(chapter!.tiles.length, 20);
  assert.equal((await listPages(x)).filter((p) => p.kind === 'chapter').length, 1);
});

test('the home shelf counts done squares and the chapter goes when a grid reopens', async () => {
  const x = await freshDb();
  const ug = await gridOfSize(x, 'tiny');
  const ids: string[] = [];
  for (;;) {
    const next = (await board(x, ug)).squares.find((s) => s.state === 'revealed');
    if (!next) break;
    ids.push((await saveMoment(x, next.squareStateId, moment())).momentId);
  }
  const shelf = (await listShelf(x)).find((g) => g.userGridId === ug)!;
  assert.equal(shelf.done, 20);
  assert.ok(await getChapter(x, ug));
  await deleteMoment(x, ids[5]);
  assert.equal(await getChapter(x, ug), null);
  assert.equal((await board(x, ug)).completedAt, null);
  assert.equal((await listShelf(x)).find((g) => g.userGridId === ug)!.done, 19);
});
