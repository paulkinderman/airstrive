import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Moment, OpenSquare, ShelfGrid } from '../src/db/repo/types';
import { buildSnapshot, thumbName } from '../src/widgets/snapshot';

const grid = (id: string, extra: Partial<ShelfGrid> = {}): ShelfGrid => ({
  userGridId: id, gridId: `g_${id}`, title: id, color: '#3B9BE0', cols: 2, rows: 2,
  done: 1, revealed: 1, total: 4, freebiesLeft: 0, completedAt: null,
  states: ['done', 'revealed', 'hidden', 'hidden'], ...extra,
});

const moment = (id: string, extra: Partial<Moment> = {}): Moment => ({
  id, squareStateId: `s_${id}`, userGridId: 'a', title: '', body: '', happenedOn: '2026-10-30', place: '', weather: '',
  withPeople: '', fill: '', groupId: null, entries: [], audience: 'private', gridAudience: 'private',
  gridTitle: 'Running', gridColor: '#F5B61C', prompt: `Prompt ${id}`, photos: [], ...extra,
});

test('the widget snapshot packs the shelf, open squares, moments and friends', () => {
  const open = new Map<string, OpenSquare[]>([['a', [{ squareStateId: 'sq1', idx: 1, prompt: 'Walk in the snow' }]]]);
  const photo = { id: 'p2', uri: 'file:///docs/photos/p2.webp', path: 'photos/p2.webp', isCover: true, width: 10, height: 10 };
  const { snapshot, thumbs } = buildSnapshot(
    [grid('a'), grid('b', { completedAt: '2026-10-01', revealed: 2 })],
    open,
    [moment('m1', { title: 'Ran slow', photos: [{ ...photo, id: 'p1', isCover: false }, photo] }), moment('m2', { fill: '#2EB08A' })],
    [{ username: 'maya', title: 'Sunrise swim', gridTitle: 'Summer' }],
  );
  assert.equal(snapshot.waiting, 3);
  assert.equal(snapshot.grids[0].states, 'drhh');
  assert.deepEqual(snapshot.grids[0].open, [{ id: 'sq1', idx: 1, prompt: 'Walk in the snow' }]);
  assert.equal(snapshot.grids[1].complete, true);
  assert.deepEqual(snapshot.grids[1].open, []);
  // The cover photo is the one thumbnailed; a moment with no title shows its prompt.
  assert.deepEqual(thumbs, [{ momentId: 'm1', photoId: 'p2', uri: photo.uri }]);
  assert.equal(snapshot.lately[0].photo, thumbName({ momentId: 'm1', photoId: 'p2' }));
  assert.equal(snapshot.lately[0].caption, 'Ran slow');
  assert.equal(snapshot.lately[1].caption, 'Prompt m2');
  assert.equal(snapshot.lately[1].photo, null);
  assert.equal(snapshot.lately[1].color, '#2EB08A');
  assert.deepEqual(snapshot.friends, [{ name: 'maya', title: 'Sunrise swim', grid: 'Summer' }]);
});
