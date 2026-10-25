// The real sync code against a real (local) Supabase: Postgres triggers, row security, Storage,
// Auth and the delete-account function, where the unit tests use an in-memory stand-in.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { File, Paths } from 'expo-file-system';
import { admin, url, newPerson, newPhone, moment } from './local';
import { startGrid } from '@/data/seed';
import { saveMoment, deleteMoment, loadBoard, listMoments, spendFreebie, listShelf } from '@/db/repo';
import { syncStatus } from '@/sync/engine';
import { writeBytes } from '@/lib/files';

const LEAF = new Uint8Array([82, 73, 70, 70, 1, 2, 3, 4]);

async function storageNames(userId: string) {
  const { data, error } = await admin.storage.from('photos').list(userId);
  assert.equal(error, null);
  return (data ?? []).map((f) => f.name);
}

test('two phones of one person stay in step through Supabase', async () => {
  const paul = await newPerson();
  const a = await newPhone(paul);
  const b = await newPhone(paul);

  const ug = await startGrid(a.x, 'grid_fall');
  const sq = (await loadBoard(a.x, ug))!.squares.find((s) => s.state === 'revealed')!;
  await a.on(() => writeBytes('photos/leaf.webp', LEAF));
  await saveMoment(a.x, sq.squareStateId, moment('Caught one', ['photos/leaf.webp']));
  const free = (await loadBoard(a.x, ug))!.squares.filter((s) => s.state === 'revealed')[1];
  await spendFreebie(a.x, free.squareStateId);

  const ra = await a.sync();
  assert.equal(ra.error, undefined, ra.error);
  assert.equal(ra.uploaded, 1);
  assert.equal((await syncStatus(a.x)).pending, 0, 'nothing left in the queue');
  assert.equal((await storageNames(paul.id)).length, 1, 'photo stored under the person\'s folder');

  const rb = await b.sync();
  assert.equal(rb.error, undefined, rb.error);
  assert.equal(rb.downloaded, 1);
  const onB = await listMoments(b.x);
  assert.equal(onB.length, 1);
  assert.equal(onB[0].body, 'Caught one');
  const bytes = await b.on(async () => new File(Paths.document, onB[0].photos[0].path).bytes());
  assert.deepEqual([...bytes], [...LEAF], 'photo bytes survive the round trip');
  const shelfB = (await listShelf(b.x)).find((g) => g.userGridId === ug)!;
  assert.equal(shelfB.freebiesLeft, 1);
  assert.equal(shelfB.done, 2);

  // An edit on B reaches A.
  await saveMoment(b.x, sq.squareStateId, { ...moment('Caught one, then another'), photos: onB[0].photos.map((p) => ({ id: p.id, path: p.path, width: 1600, height: 1200, bytes: 4 })) });
  assert.equal((await b.sync()).error, undefined);
  assert.equal((await a.sync()).error, undefined);
  assert.equal((await listMoments(a.x))[0].body, 'Caught one, then another');

  // Deleting on A clears it from B, and the photo leaves Storage.
  await deleteMoment(a.x, (await listMoments(a.x))[0].id);
  assert.equal((await a.sync()).error, undefined);
  assert.equal((await b.sync()).error, undefined);
  assert.equal((await listMoments(b.x)).length, 0);
  const tile = (await loadBoard(b.x, ug))!.squares.find((s) => s.idx === sq.idx)!;
  assert.equal(tile.state, 'revealed');
  assert.deepEqual(await storageNames(paul.id), []);
});

test('an older offline edit loses to a newer one on the real server', async () => {
  const paul = await newPerson();
  const a = await newPhone(paul);
  const b = await newPhone(paul);
  const ug = await startGrid(a.x, 'grid_running');
  const sq = (await loadBoard(a.x, ug))!.squares.find((s) => s.state === 'revealed')!;
  await saveMoment(a.x, sq.squareStateId, moment('first'));
  await a.sync();
  await b.sync();
  // Both phones edit offline; B's edit is later, but A syncs last.
  await saveMoment(a.x, sq.squareStateId, moment('older edit'));
  await new Promise((r) => setTimeout(r, 20));
  await saveMoment(b.x, sq.squareStateId, moment('newer edit'));
  await b.sync();
  await a.sync();
  await b.sync();
  assert.equal((await listMoments(a.x))[0].body, 'newer edit');
  assert.equal((await listMoments(b.x))[0].body, 'newer edit');
  const { data } = await admin.from('moments').select('body').eq('user_id', paul.id);
  assert.deepEqual(data, [{ body: 'newer edit' }]);
});

test("people can't see or change each other's grids, moments or photos", async () => {
  const paul = await newPerson();
  const sam = await newPerson();
  const a = await newPhone(paul);
  const ug = await startGrid(a.x, 'grid_chess');
  const sq = (await loadBoard(a.x, ug))!.squares.find((s) => s.state === 'revealed')!;
  await a.on(() => writeBytes('photos/board.webp', LEAF));
  await saveMoment(a.x, sq.squareStateId, moment('Private', ['photos/board.webp']));
  assert.equal((await a.sync()).error, undefined);
  const [photoName] = await storageNames(paul.id);

  for (const table of ['user_grids', 'square_states', 'moments', 'photos'] as const) {
    const { data, error } = await sam.client.from(table).select('id');
    assert.equal(error, null);
    assert.deepEqual(data, [], `${table} hidden from others`);
  }
  const { data: profiles } = await sam.client.from('users').select('id');
  assert.deepEqual(profiles?.map((p) => p.id), [sam.id], 'only their own profile');

  const dl = await sam.client.storage.from('photos').download(`${paul.id}/${photoName}`);
  assert.ok(dl.error, 'cannot download someone else\'s photo');
  const signed = await sam.client.storage.from('photos').createSignedUrl(`${paul.id}/${photoName}`, 60);
  assert.ok(signed.error, 'cannot sign a link to someone else\'s photo');
  const up = await sam.client.storage.from('photos').upload(`${paul.id}/${randomUUID()}.webp`, LEAF, { contentType: 'image/webp' });
  assert.ok(up.error, 'cannot upload into someone else\'s folder');

  const attach = await sam.client.from('square_states').upsert({
    id: randomUUID(), user_grid_id: ug, idx: 0, state: 'revealed', updated_at: new Date().toISOString(),
  });
  assert.ok(attach.error, 'cannot attach rows to someone else\'s grid');
  await sam.client.from('moments').update({ body: 'hijack' }).eq('square_state_id', sq.squareStateId);
  const { data: still } = await admin.from('moments').select('body').eq('user_id', paul.id);
  assert.deepEqual(still, [{ body: 'Private' }], 'update by someone else did nothing');

  // A signed-out visitor sees the public grids and nothing personal.
  const { createClient } = await import('@supabase/supabase-js');
  const anon = createClient(url, process.env.SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const { data: anonMoments } = await anon.from('moments').select('id');
  assert.deepEqual(anonMoments ?? [], []);
});

test('deleting an account removes every row, every photo and the login', async () => {
  const paul = await newPerson();
  const sam = await newPerson();
  const a = await newPhone(paul);
  const s = await newPhone(sam);
  for (const [p, person] of [[a, paul], [s, sam]] as const) {
    const ug = await startGrid(p.x, 'grid_wellness');
    const sq = (await loadBoard(p.x, ug))!.squares.find((x) => x.state === 'revealed')!;
    await p.on(() => writeBytes('photos/me.webp', LEAF));
    await saveMoment(p.x, sq.squareStateId, moment(`${person.email}'s moment`, ['photos/me.webp']));
    assert.equal((await p.sync()).error, undefined);
  }

  const res = await fetch(`${url}/functions/v1/delete-account`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${paul.token}`, apikey: process.env.SUPABASE_ANON_KEY! },
  });
  assert.equal(res.status, 200, await res.clone().text());
  assert.deepEqual(await res.json(), { deleted: true });

  for (const table of ['users', 'user_grids', 'square_states', 'moments', 'photos'] as const) {
    const col = table === 'users' ? 'id' : 'user_id';
    const { data: mine } = await admin.from(table).select('id').eq(col, paul.id);
    assert.deepEqual(mine, [], `${table} rows gone`);
    const { data: theirs } = await admin.from(table).select('id').eq(col, sam.id);
    assert.ok((theirs ?? []).length > 0, `someone else's ${table} rows kept`);
  }
  assert.deepEqual(await storageNames(paul.id), [], 'photos gone');
  assert.equal((await storageNames(sam.id)).length, 1, 'someone else\'s photos kept');
  const { data: gone } = await admin.auth.admin.getUserById(paul.id);
  assert.equal(gone.user, null, 'login gone');

  // The old session can no longer reach anything.
  const again = await fetch(`${url}/functions/v1/delete-account`, {
    method: 'POST', headers: { Authorization: `Bearer ${paul.token}`, apikey: process.env.SUPABASE_ANON_KEY! },
  });
  assert.equal(again.status, 401);
});

test('the delete-account function turns away callers who are not signed in', async () => {
  const res = await fetch(`${url}/functions/v1/delete-account`, {
    method: 'POST', headers: { Authorization: `Bearer ${process.env.SUPABASE_ANON_KEY}`, apikey: process.env.SUPABASE_ANON_KEY! },
  });
  assert.equal(res.status, 401);
});
