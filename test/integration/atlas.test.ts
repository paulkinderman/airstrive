// The Atlas on a real (local) Supabase: making and sharing a grid from the phone, someone else
// finding and adopting it, reports, admin hides, and the two-hides-in-30-days suspension.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { admin, newPerson, newPhone, moment } from './local';
import { adoptGrid } from '@/data/seed';
import { createGrid, loadBoard, saveMoment } from '@/db/repo';
import { ensureGrids } from '@/sync/engine';
import { getMeta } from '@/db/queue';
import { startingSquares } from '@/data/types';
import { supabaseRemote } from '@/sync/supabaseRemote';

const made = (title: string, isPublic = true) => ({
  title, color: '#2EB08A', theme: 'Outdoors', size: 'small' as const, description: 'Made in a test', isPublic,
  squares: Array.from({ length: 48 }, (_, idx) => ({ idx, prompt: `${title} prompt ${idx}`, cluster: idx < 24 ? 'Near' : 'Far' })),
});

async function shareGrid(person: Awaited<ReturnType<typeof newPerson>>, title: string) {
  const p = await newPhone(person);
  const ug = await createGrid(p.x, person.id, made(title));
  const r = await p.sync();
  assert.equal(r.error, undefined, r.error);
  const { grid_id } = (await p.x.getFirstAsync<{ grid_id: string }>('SELECT grid_id FROM user_grids WHERE id = ?', ug))!;
  return { phone: p, gridId: grid_id };
}

async function makeAdmin() {
  const a = await newPerson();
  const { error } = await admin.from('users').update({ is_admin: true }).eq('id', a.id);
  assert.equal(error, null);
  return a;
}

const atlasIds = async (client: Awaited<ReturnType<typeof newPerson>>['client']) => {
  const { data, error } = await client.rpc('atlas_grids');
  assert.equal(error, null);
  return data as { id: string; starters: string[]; made_by: string }[];
};

test('a grid made on one phone is shared, found in the Atlas and adopted by someone else', async () => {
  const maker = await newPerson();
  const { gridId } = await shareGrid(maker, 'Creek walks');

  const sam = await newPerson();
  const listed = (await atlasIds(sam.client)).find((g) => g.id === gridId);
  assert.ok(listed, 'shared grid is in the Atlas');
  assert.deepEqual(listed!.starters, startingSquares('small').sort((a, b) => a - b).map((i) => `Creek walks prompt ${i}`));
  const officials = (await atlasIds(sam.client)).filter((g) => g.id.startsWith('grid_'));
  assert.equal(officials.length, 31, 'the official grids are listed too');

  const b = await newPhone(sam);
  await ensureGrids(b.x, supabaseRemote(sam.client), [gridId]);
  const ug = await adoptGrid(b.x, sam.id, gridId);
  const sq = (await loadBoard(b.x, ug))!.squares.find((s) => s.state === 'revealed')!;
  await saveMoment(b.x, sq.squareStateId, moment('Found a heron'));
  const r = await b.sync();
  assert.equal(r.error, undefined, r.error);
  const { data } = await admin.from('user_grids').select('grid_id').eq('user_id', sam.id);
  assert.deepEqual(data, [{ grid_id: gridId }]);

  // Squares can't be changed after the grid exists, even by its author.
  const { error } = await maker.client.from('grid_squares').update({ prompt: 'changed' }).eq('grid_id', gridId);
  const { data: sq0 } = await admin.from('grid_squares').select('prompt').eq('grid_id', gridId).eq('idx', 0).single();
  assert.ok(error || sq0!.prompt === 'Creek walks prompt 0', 'squares stay as made');
});

test('a private grid stays out of the Atlas', async () => {
  const maker = await newPerson();
  const p = await newPhone(maker);
  await createGrid(p.x, maker.id, made('Just mine', false));
  assert.equal((await p.sync()).error, undefined);
  const sam = await newPerson();
  const { data } = await admin.from('grids').select('id').eq('author_id', maker.id);
  assert.equal(data!.length, 1, 'saved on the server');
  assert.ok(!(await atlasIds(sam.client)).some((g) => g.id === data![0].id));
  const { data: direct } = await sam.client.from('grids').select('id').eq('id', data![0].id);
  assert.deepEqual(direct, [], 'not readable by others either');
});

test('reports: one open report per person, never your own grid or an official one', async () => {
  const maker = await newPerson();
  const { gridId } = await shareGrid(maker, 'Report me');
  const sam = await newPerson();

  const first = await sam.client.from('reports').insert({ grid_id: gridId, reason: 'spam', note: 'ads' });
  assert.equal(first.error, null);
  const again = await sam.client.from('reports').insert({ grid_id: gridId, reason: 'spam', note: 'still ads' });
  assert.equal(again.error?.code, '23505', 'second open report refused as a duplicate');
  const own = await maker.client.from('reports').insert({ grid_id: gridId, reason: 'other', note: '' });
  assert.ok(own.error, 'cannot report your own grid');
  const official = await sam.client.from('reports').insert({ grid_id: 'grid_fall', reason: 'other', note: '' });
  assert.ok(official.error, 'cannot report an official grid');

  const { data: seen } = await maker.client.from('reports').select('id');
  assert.deepEqual(seen, [], "authors can't see who reported them");
});

test('hiding a reported grid takes it out of the Atlas but adopters keep it; two hides suspend sharing', async () => {
  const maker = await newPerson();
  const mod = await makeAdmin();
  const sam = await newPerson();
  const { gridId: first } = await shareGrid(maker, 'Hide one');
  const { gridId: second, phone } = await shareGrid(maker, 'Hide two');

  const b = await newPhone(sam);
  await ensureGrids(b.x, supabaseRemote(sam.client), [first]);
  await adoptGrid(b.x, sam.id, first);
  assert.equal((await b.sync()).error, undefined);

  // Only admins can hide.
  const denied = await sam.client.rpc('admin_set_grid_hidden', { grid: first, hidden: true });
  assert.ok(denied.error, 'non-admins are refused');

  await sam.client.from('reports').insert({ grid_id: first, reason: 'hateful', note: '' });
  const { data: reports } = await mod.client.from('reports').select('id, status').eq('grid_id', first);
  assert.equal(reports!.length, 1, 'admins see reports');
  assert.equal((await mod.client.rpc('admin_resolve_report', { report: reports![0].id, action: 'hide' })).error, null);

  assert.ok(!(await atlasIds(sam.client)).some((g) => g.id === first), 'hidden grid leaves the Atlas');
  const { data: kept } = await sam.client.from('grids').select('id').eq('id', first);
  assert.equal(kept!.length, 1, 'the adopter can still load it');
  const { data: resolved } = await admin.from('reports').select('status').eq('grid_id', first);
  assert.deepEqual(resolved, [{ status: 'hidden' }]);

  let { data: u } = await admin.from('users').select('sharing_suspended').eq('id', maker.id).single();
  assert.equal(u!.sharing_suspended, false, 'one hide is not enough');
  assert.equal((await mod.client.rpc('admin_set_grid_hidden', { grid: second, hidden: true })).error, null);
  ({ data: u } = await admin.from('users').select('sharing_suspended').eq('id', maker.id).single());
  assert.equal(u!.sharing_suspended, true, 'two hides in 30 days suspend sharing');

  // The phone tries to share another grid: it's saved private and the phone is told.
  const ug = await createGrid(phone.x, maker.id, made('Hide three'));
  assert.equal((await phone.sync()).error, undefined);
  const local = await phone.x.getFirstAsync<{ id: string; is_public: number }>(
    'SELECT g.id, g.is_public FROM grids g JOIN user_grids ug ON ug.grid_id = g.id WHERE ug.id = ?', ug,
  );
  assert.equal(local!.is_public, 0, 'the phone marks it private');
  assert.equal(await getMeta(phone.x, 'sharing_suspended'), '1');
  const { data: onServer } = await admin.from('grids').select('is_public').eq('id', local!.id).single();
  assert.equal(onServer!.is_public, false);
});
