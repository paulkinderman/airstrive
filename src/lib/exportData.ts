import type { SQLiteDatabase } from 'expo-sqlite';
import JSZip from 'jszip';
import { listPages } from '@/db/repo';
import { chapterCaption, scrapbookHtml, type PrintPage } from './printables';
import { fileExists, readBase64, readBytes } from './files';
import { saveZip, scrapbookFile } from './share';
import { todayLocal } from './ids';

const mimeOf = (path: string) => (path.endsWith('.jpg') ? 'image/jpeg' : 'image/webp');

/**
 * Builds "AirStrive export <date>.zip" in the cache folder: moments.json with every grid
 * and moment, photos/ at their stored size, memory-lane.pdf rendered from the pages
 * (memory-lane.html on the web, ready to print), and friends.json when the friends list
 * could be fetched. Returns the zip's URI for shareZip.
 */
export async function buildExport(
  db: SQLiteDatabase, username: string, onStep?: (step: string) => void,
  friends?: { username: string; since: string }[] | null,
): Promise<string> {
  onStep?.('Gathering your grids');
  const grids = await db.getAllAsync<{
    id: string; title: string; size: string; theme: string; started_at: string; completed_at: string | null; freebies_left: number; audience: string;
  }>(`SELECT ug.id, g.title, g.size, g.theme, ug.started_at, ug.completed_at, ug.freebies_left, ug.audience
      FROM user_grids ug JOIN grids g ON g.id = ug.grid_id WHERE ug.deleted_at IS NULL ORDER BY ug.started_at`);
  const squares = await db.getAllAsync<{
    user_grid_id: string; idx: number; prompt: string; cluster: string; state: string; done_at: string | null; via_freebie: number;
  }>(`SELECT ss.user_grid_id, ss.idx, gs.prompt, gs.cluster, ss.state, ss.done_at, ss.via_freebie
      FROM square_states ss JOIN user_grids ug ON ug.id = ss.user_grid_id
      JOIN grid_squares gs ON gs.grid_id = ug.grid_id AND gs.idx = ss.idx
      WHERE ss.deleted_at IS NULL AND ug.deleted_at IS NULL ORDER BY ss.idx`);

  const pages = await listPages(db);
  const zip = new JSZip();
  const photoDir = zip.folder('photos')!;
  const moments = [];
  const missing: string[] = [];

  onStep?.('Packing photos');
  for (const p of pages) {
    if (p.kind !== 'moment') continue;
    const m = p.moment;
    const names: string[] = [];
    for (const ph of m.photos) {
      const name = ph.path.split('/').pop()!;
      if (fileExists(ph.path)) {
        photoDir.file(name, await readBytes(ph.path));
        names.push(`photos/${name}`);
      } else {
        missing.push(name);
      }
    }
    moments.push({
      id: m.id, grid: m.gridTitle, prompt: m.prompt, title: m.title, body: m.body, happened_on: m.happenedOn,
      place: m.place, weather: m.weather, with_people: m.withPeople, audience: m.audience, photos: names,
      // A group grid's moment: everyone's words this phone has, by name.
      ...(m.groupId ? { together: true, entries: m.entries.map((e) => ({ by: e.name, body: e.body })) } : {}),
    });
  }

  const json = {
    app: 'AirStrive',
    exported_at: new Date().toISOString(),
    username,
    grids: grids.map((g) => ({
      title: g.title, size: g.size, theme: g.theme, started_at: g.started_at, completed_at: g.completed_at, freebies_left: g.freebies_left,
      audience: g.audience,
      squares: squares.filter((s) => s.user_grid_id === g.id).map((s) => ({
        index: s.idx, prompt: s.prompt, cluster: s.cluster, state: s.state, done_at: s.done_at, freebie: s.via_freebie === 1,
      })),
    })),
    moments,
    ...(missing.length ? { photos_not_on_this_phone: missing } : {}),
  };
  zip.file('moments.json', JSON.stringify(json, null, 2));
  if (friends) zip.file('friends.json', JSON.stringify(friends.map((f) => ({ username: f.username, friends_since: f.since })), null, 2));

  onStep?.('Printing Memory Lane');
  const dataUri = async (path: string | null) => {
    if (!path || !fileExists(path)) return null;
    return `data:${mimeOf(path)};base64,${await readBase64(path)}`;
  };
  const printPages: PrintPage[] = [];
  for (const p of pages) {
    if (p.kind === 'moment') {
      const m = p.moment;
      const cover = m.photos.find((x) => x.isCover) ?? m.photos[0];
      const ordered = cover ? [cover, ...m.photos.filter((x) => x !== cover)] : [];
      const photos = (await Promise.all(ordered.map((x) => dataUri(x.path)))).filter((x): x is string => !!x);
      printPages.push({ kind: 'moment', moment: { ...m, photos } });
    } else {
      const c = p.chapter;
      printPages.push({
        kind: 'chapter',
        chapter: { gridTitle: c.gridTitle, gridColor: c.gridColor, cols: c.cols, tiles: await Promise.all(c.tilePaths.map(dataUri)), caption: chapterCaption(c.momentCount, c.firstOn, c.lastOn) },
      });
    }
  }
  const scrapbook = await scrapbookFile(scrapbookHtml(printPages, username));
  zip.file(scrapbook.name, scrapbook.bytes);

  onStep?.('Zipping');
  const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'STORE' });
  return saveZip(bytes, `AirStrive export ${todayLocal()}.zip`);
}
