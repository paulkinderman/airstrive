import type { SQLiteDatabase } from 'expo-sqlite';
import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { ExtensionStorage } from '@bacons/apple-targets';
import Constants from 'expo-constants';
import { listOpenSquares, listRecentMoments, listShelf } from '@/db/repo';
import { listFriendMoments } from '@/friends/api';
import { buildSnapshot, thumbName, type FriendLine } from './snapshot';

/** The App Group in app.config.ts, shared with the widget extension (targets/widget). */
const GROUP = `group.${Constants.expoConfig?.ios?.bundleIdentifier ?? 'app.airstrive.mobile'}`;
/** Thumbnails are this wide: enough for a large widget's polaroid, small enough for its memory. */
const THUMB = 360;

let friends: FriendLine[] = [];
let lastWritten = '';
let running: Promise<void> | null = null;
let again: { db: SQLiteDatabase; withFriends: boolean } | null = null;

function folder(): Directory | null {
  try { return Paths.appleSharedContainers[GROUP] ?? null; } catch { return null; }
}

/**
 * Writes what the widgets show to the App Group folder, with a small JPEG of each recent photo,
 * and asks iOS to redraw them. Friends' moments need the network, so they're fetched only when
 * `withFriends` and kept from the last time otherwise. Calls while one runs are folded into one more.
 */
export function publishWidgets(db: SQLiteDatabase, withFriends: boolean): Promise<void> {
  if (running) {
    again = { db, withFriends: withFriends || !!again?.withFriends };
    return running;
  }
  running = publish(db, withFriends).finally(() => {
    running = null;
    const next = again;
    again = null;
    if (next) void publishWidgets(next.db, next.withFriends);
  });
  return running;
}

async function publish(db: SQLiteDatabase, withFriends: boolean) {
  const dir = folder();
  if (!dir) return;
  const [shelf, open, recent] = await Promise.all([listShelf(db), listOpenSquares(db), listRecentMoments(db, 12)]);
  if (withFriends) {
    try { friends = await Promise.race([listFriendMoments(3), new Promise<never>((_, no) => setTimeout(() => no(new Error('timeout')), 6000))]); } catch { /* keep the last ones */ }
  }
  const { snapshot, thumbs } = buildSnapshot(shelf, open, recent, friends);

  const thumbDir = new Directory(dir, 'lately');
  if (!thumbDir.exists) thumbDir.create({ intermediates: true });
  const keep = new Set<string>();
  for (const job of thumbs) {
    const rel = thumbName(job);
    const dest = new File(dir, rel);
    if (!dest.exists) {
      try {
        const ctx = ImageManipulator.manipulate(job.uri);
        ctx.resize({ width: THUMB });
        const saved = await (await ctx.renderAsync()).saveAsync({ format: SaveFormat.JPEG, compress: 0.72 });
        new File(saved.uri).move(dest);
      } catch {
        // A photo not on this phone yet (still syncing): the polaroid shows its color for now.
        for (const m of snapshot.lately) if (m.photo === rel) m.photo = null;
        continue;
      }
    }
    keep.add(dest.name);
  }
  for (const item of thumbDir.list()) {
    if (item instanceof File && !keep.has(item.name)) { try { item.delete(); } catch { /* best effort */ } }
  }

  const json = JSON.stringify(snapshot);
  if (json === lastWritten) return;
  const file = new File(dir, 'widget.json');
  if (!file.exists) file.create();
  await file.write(json);
  lastWritten = json;
  ExtensionStorage.reloadWidget();
}

/** On sign-out the widgets forget everything, like the rest of the phone. */
export function clearWidgets() {
  friends = [];
  lastWritten = '';
  const dir = folder();
  if (!dir) return;
  try {
    const file = new File(dir, 'widget.json');
    if (file.exists) file.delete();
    const thumbDir = new Directory(dir, 'lately');
    if (thumbDir.exists) thumbDir.delete();
  } catch { /* best effort */ }
  ExtensionStorage.reloadWidget();
}
