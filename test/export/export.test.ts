// Builds a real export zip from a filled-in phone and opens it back up.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { File } from 'expo-file-system';
import { TestDb, asExpo } from '../sqlite';
import { migrate } from '@/db/schema';
import { startGrid } from '@/data/seed';
import { saveMoment, spendFreebie, loadBoard, deleteMoment } from '@/db/repo';
import { writeBytes } from '@/lib/files';
import { buildExport } from '@/lib/exportData';

const moment = (title: string, body: string, happenedOn: string, photos: string[] = []) => ({
  title, body, happenedOn, place: 'Prospect Park', weather: 'Crisp', withPeople: 'Sam',
  photos: photos.map((path) => ({ path, width: 1600, height: 1200, bytes: 4 })), coverIndex: 0,
});

async function readZip(uri: string) {
  return JSZip.loadAsync(await new File(uri).bytes());
}

test('the export holds every grid, moment and photo, plus the scrapbook', async () => {
  const db = new TestDb();
  const x = asExpo(db);
  await migrate(x);
  const fall = await startGrid(x, 'grid_fall');
  const running = await startGrid(x, 'grid_running');

  await writeBytes('photos/leaf.webp', new Uint8Array([1, 2, 3, 4]));
  await writeBytes('photos/pie.webp', new Uint8Array([5, 6, 7, 8]));
  let b = (await loadBoard(x, fall))!;
  const [s1, s2, s3] = b.squares.filter((s) => s.state === 'revealed');
  await saveMoment(x, s1.squareStateId, moment('Leaf pile', 'Jumped in <twice> & laughed', '2026-10-20', ['photos/leaf.webp']));
  await saveMoment(x, s2.squareStateId, moment('Apple pie', 'Too much cinnamon', '2026-10-22', ['photos/pie.webp']));
  await spendFreebie(x, s3.squareStateId);
  // A deleted moment must not leak into the export.
  const gone = await saveMoment(x, (await loadBoard(x, running))!.squares.find((s) => s.state === 'revealed')!.squareStateId,
    moment('Deleted run', 'secret', '2026-10-21'));
  await deleteMoment(x, gone.momentId);
  // A photo that only lives on another phone is listed, not silently dropped.
  await x.runAsync(
    `INSERT INTO photos (id, moment_id, position, local_uri, is_cover, width, height, bytes, created_at, updated_at)
     SELECT 'p-remote', id, 1, 'photos/elsewhere.webp', 0, 1, 1, 1, created_at, updated_at FROM moments WHERE title = 'Apple pie'`,
  );

  const steps: string[] = [];
  const uri = await buildExport(x, 'paulk', (s) => steps.push(s));
  assert.ok(uri.includes('/cache/AirStrive export'), 'written to the cache folder for the share sheet');
  assert.match(uri, /AirStrive export \d{4}-\d{2}-\d{2}\.zip$/);
  assert.deepEqual(steps, ['Gathering your grids', 'Packing photos', 'Printing Memory Lane', 'Zipping']);

  const zip = await readZip(uri);
  const names = Object.keys(zip.files).filter((n) => !zip.files[n].dir).sort();
  assert.deepEqual(names, ['memory-lane.pdf', 'moments.json', 'photos/leaf.webp', 'photos/pie.webp']);
  assert.deepEqual([...await zip.file('photos/leaf.webp')!.async('uint8array')], [1, 2, 3, 4], 'photo bytes intact');

  const json = JSON.parse(await zip.file('moments.json')!.async('string'));
  assert.equal(json.app, 'AirStrive');
  assert.equal(json.username, 'paulk');
  assert.equal(json.grids.length, 2);
  const fallJson = json.grids.find((g: { title: string }) => g.title === 'Fall');
  assert.equal(fallJson.squares.length, 48);
  assert.equal(fallJson.freebies_left, 1);
  assert.equal(fallJson.squares.filter((s: { state: string }) => s.state === 'done').length, 3);
  assert.equal(fallJson.squares.filter((s: { freebie: boolean }) => s.freebie).length, 1);
  assert.deepEqual(json.moments.map((m: { title: string }) => m.title).sort(), ['Apple pie', 'Leaf pile']);
  const leaf = json.moments.find((m: { title: string }) => m.title === 'Leaf pile');
  assert.equal(leaf.body, 'Jumped in <twice> & laughed');
  assert.equal(leaf.place, 'Prospect Park');
  assert.equal(leaf.with_people, 'Sam');
  assert.deepEqual(leaf.photos, ['photos/leaf.webp']);
  assert.ok(leaf.prompt, 'the square prompt travels with the moment');
  assert.deepEqual(json.photos_not_on_this_phone, ['elsewhere.webp']);
  assert.ok(!JSON.stringify(json).includes('secret'), 'deleted moments are left out');

  // The PDF stub records the HTML handed to the printer.
  const html = await zip.file('memory-lane.pdf')!.async('string');
  assert.ok(html.includes('Jumped in &lt;twice&gt; &amp; laughed'), 'journal text is escaped');
  assert.ok(html.indexOf('Leaf pile') < html.indexOf('Apple pie'), 'pages run oldest first');
  assert.ok(html.includes(`data:image/webp;base64,${Buffer.from([1, 2, 3, 4]).toString('base64')}`), 'photos embedded');
  assert.ok(!html.includes('Deleted run'));
});

test('exporting twice replaces the old zip, and an empty phone still exports', async () => {
  const db = new TestDb();
  const x = asExpo(db);
  await migrate(x);
  const first = await buildExport(x, 'new person');
  const second = await buildExport(x, 'new person');
  assert.equal(first, second);
  const json = JSON.parse(await (await readZip(second)).file('moments.json')!.async('string'));
  assert.deepEqual(json.grids, []);
  assert.deepEqual(json.moments, []);
  assert.equal(json.photos_not_on_this_phone, undefined);
});
