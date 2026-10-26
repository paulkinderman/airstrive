import type { SQLiteDatabase } from 'expo-sqlite';
import { getMeta, setMeta } from '@/db/queue';

/**
 * Data that lives on the server rather than in the phone's own tables (the Atlas, and
 * soon friends and profiles). Each answer is kept in `meta` under its key, so a screen
 * still opens offline with what it last saw. Signing out clears `meta`, and the copies
 * with it.
 */
export interface Cached<T> {
  data: T;
  /** True when the server couldn't be reached and `data` is the kept copy or the fallback. */
  offline: boolean;
}

/**
 * Fetches and keeps a copy. `fetcher` is null when there's no backend (a build without
 * Supabase); then `fallback` answers and nothing counts as offline. A fetcher that throws
 * means no connection: the kept copy answers, or `fallback` if there's none yet.
 */
export async function cachedFetch<T>(
  db: SQLiteDatabase, key: string, fetcher: (() => Promise<T>) | null, fallback: () => Promise<T> | T,
): Promise<Cached<T>> {
  if (fetcher) {
    try {
      const data = await fetcher();
      await setMeta(db, key, JSON.stringify(data));
      return { data, offline: false };
    } catch {
      // fall through to the kept copy
    }
  }
  const kept = await getMeta(db, key);
  if (kept) return { data: JSON.parse(kept) as T, offline: !!fetcher };
  return { data: await fallback(), offline: !!fetcher };
}
