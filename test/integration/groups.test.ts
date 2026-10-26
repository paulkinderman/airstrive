// Group grids against a real (local) Supabase: the group rules in Postgres, photo files in
// Storage, and what delete-account keeps for the group.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { admin, url, newPerson, newPhone, type Person } from './local';
import { startGrid } from '@/data/seed';
import { loadBoard, listShelf, saveMoment } from '@/db/repo';
import { syncStatus } from '@/sync/engine';
import { writeBytes } from '@/lib/files';
import { getGroupMoment, saveGroupMoment, type GroupMomentInput } from '@/groups/repo';

const LEAF = new Uint8Array([82, 73, 70, 70, 9, 8, 7, 6]);

const part = (body: string, extra: Partial<GroupMomentInput> = {}): GroupMomentInput => ({
  title: 'A prompt', happenedOn: '2026-10-25', place: '', weather: '', withPeople: '', body, audience: 'group', photos: [], ...extra,
});

async function befriend(a: Person, b: Person) {
  const [user_a, user_b] = [a.id, b.id].sort();
  const { error } = await admin.from('friendships').insert({ user_a, user_b });
  assert.equal(error, null, error?.message);
}

async function clean(phone: Awaited<ReturnType<typeof newPhone>>) {
  const r = await phone.sync();
  assert.equal(r.error, undefined, r.error);
  assert.equal((await syncStatus(phone.x)).failed, 0, 'nothing turned away by the server');
  return r;
}

test('two people do one grid together through Supabase', async () => {
  const paul = await newPerson();
  const sam = await newPerson();
  await befriend(paul, sam);
  const pp = await newPhone(paul);
  const sp = await newPhone(sam);

  // Paul has a grid with a moment, and makes it a group grid, sharing what's there.
  const ug = await startGrid(pp.x, 'grid_fall');
  const squares = (await loadBoard(pp.x, ug))!.squares.filter((s) => s.state === 'revealed').map((s) => s.squareStateId);
  await saveMoment(pp.x, squares[0], {
    title: 'A prompt', body: 'Apple picking', happenedOn: '2026-10-20', place: '', weather: '', withPeople: '', photos: [], coverIndex: 0,
  });
  await clean(pp);
  const made = await paul.client.rpc('make_group', { user_grid: ug, share_existing: true });
  assert.equal(made.error, null, made.error?.message);
  assert.equal((await paul.client.rpc('invite_to_group', { grp: ug, friend: sam.id })).data, 'invited');
  await clean(pp);
  assert.equal((await getGroupMoment(pp.x, squares[0], paul.id))!.entries[0].body, 'Apple picking', 'Paul\'s words became his entry');

  // Sam joins and gets the whole grid.
  const joined = await sam.client.rpc('respond_group_invite', { grp: ug, accept: true });
  assert.equal(joined.error, null, joined.error?.message);
  await clean(sp);
  assert.equal((await listShelf(sp.x)).length, 1);
  assert.equal((await getGroupMoment(sp.x, squares[0], sam.id))!.entries[0].body, 'Apple picking');

  // Sam adds his words and a photo to Paul's square, and does a square of his own.
  await sp.on(() => writeBytes('photos/leaf.webp', LEAF));
  await saveGroupMoment(sp.x, squares[0], sam.id, part('Sam was there too', {
    title: 'A prompt', photos: [{ path: 'photos/leaf.webp', width: 1, height: 1, bytes: 8, audience: 'group' }],
  }));
  await saveGroupMoment(sp.x, squares[1], sam.id, part('Just mine', { audience: 'private' }));
  await clean(sp);
  await clean(pp);

  const seen = (await getGroupMoment(pp.x, squares[0], paul.id))!;
  assert.deepEqual(seen.entries.map((e) => e.body).sort(), ['Apple picking', 'Sam was there too']);
  assert.equal(seen.photos.length, 1, 'Sam\'s photo reached Paul');
  const board = (await loadBoard(pp.x, ug))!;
  assert.equal(board.squares.find((s) => s.squareStateId === squares[1])!.state, 'done', 'Sam\'s Private square shows done');
  assert.equal((await getGroupMoment(pp.x, squares[1], paul.id))!.entries.length, 0, 'without his words');

  // Sam deletes his account: the group keeps his shared words and photo, moved to the group's folder.
  const res = await fetch(`${url}/functions/v1/delete-account`, {
    method: 'POST', headers: { Authorization: `Bearer ${sam.token}`, apikey: process.env.SUPABASE_ANON_KEY! },
  });
  assert.equal(res.status, 200, await res.clone().text());
  const { data: kept } = await admin.storage.from('photos').list(`groups/${ug}`);
  assert.equal(kept?.length, 1, 'photo moved into the group\'s folder');
  const { data: gone } = await admin.storage.from('photos').list(sam.id);
  assert.equal(gone?.length ?? 0, 0, 'nothing left in Sam\'s folder');

  const fresh = await newPhone(paul);
  await clean(fresh);
  const after = (await getGroupMoment(fresh.x, squares[0], paul.id))!;
  const sams = after.entries.find((e) => !e.mine)!;
  assert.equal(sams.body, 'Sam was there too');
  assert.equal(sams.name, 'A former member');
  assert.equal(after.photos.length, 1, 'and the photo still downloads');

  // Paul, the last one in, leaves: the grid goes.
  assert.equal((await paul.client.rpc('leave_group', { grp: ug })).data, 'deleted');
  const { data: rows } = await admin.from('user_grids').select('id').eq('id', ug);
  assert.equal(rows?.length, 0);
});

test('people outside a group can\'t read or write its rows', async () => {
  const paul = await newPerson();
  const eve = await newPerson();
  const pp = await newPhone(paul);
  const ug = await startGrid(pp.x, 'grid_running');
  await clean(pp);
  assert.equal((await paul.client.rpc('make_group', { user_grid: ug })).error, null);

  const { data: grids } = await eve.client.from('user_grids').select('id').eq('id', ug);
  assert.equal(grids?.length, 0, 'not visible');
  const { data: squares } = await eve.client.from('square_states').select('id').eq('group_id', ug);
  assert.equal(squares?.length, 0);
  const invite = await eve.client.rpc('invite_to_group', { grp: ug, friend: eve.id });
  assert.ok(invite.error, 'outsiders can\'t invite');
  const strangers = await paul.client.rpc('invite_to_group', { grp: ug, friend: eve.id });
  assert.ok(strangers.error, 'only friends can be invited');
});
