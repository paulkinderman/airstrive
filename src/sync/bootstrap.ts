import type { SQLiteDatabase } from 'expo-sqlite';
import { ensureStarterShelf } from '@/data/seed';
import { getMeta, setMeta } from '@/db/queue';
import { backfill, pull, wipeLocal, type LocalFiles, type Remote } from './engine';

/**
 * Gets the phone ready for a signed-in person. The first time an account is used on
 * this phone it pulls what the account already has, then fills the shelf with any
 * starter grids it's missing, and queues whatever was on the phone before (v0 data).
 * A different person signing in starts from an empty phone.
 */
export async function prepareForUser(
  db: SQLiteDatabase, remote: Remote | null, files: LocalFiles & { removeAll(): void }, userId: string,
) {
  const owner = await getMeta(db, 'owner');
  if (owner && owner !== userId) {
    await wipeLocal(db);
    files.removeAll();
  }
  if (owner !== userId) {
    if (remote) await pull(db, remote, files);
    await ensureStarterShelf(db, userId);
    await backfill(db);
    await setMeta(db, 'owner', userId);
  } else {
    await ensureStarterShelf(db, userId);
  }
}
