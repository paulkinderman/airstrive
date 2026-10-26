import type { SQLiteDatabase } from 'expo-sqlite';
import { getMeta, setMeta } from '@/db/queue';
import { adoptGrid } from '@/data/seed';
import { removeFromShelf } from '@/db/repo';

/**
 * The account side of signing in: the username, onboarding, and the interests picked
 * there. Kept on the phone in `meta` and fetched from `users` when the phone doesn't
 * have them yet. AuthProvider calls these; they take the server as an argument so tests
 * can run them on their own.
 */

export interface AccountRow {
  username: string | null;
  interests: string[] | null;
  onboarded_at: string | null;
}

/** Which screen a signed-in person belongs on. */
export type AccountStatus = 'needsUsername' | 'onboarding' | 'ready';

/**
 * Onboarding happens once per account. Accounts from v1 never saw it: one that has
 * logged a moment keeps its shelf and skips it; one that hasn't gets to start fresh.
 */
export async function isOnboarded(db: SQLiteDatabase): Promise<boolean> {
  if (await getMeta(db, 'onboarded_at')) return true;
  return !!(await db.getFirstAsync('SELECT 1 AS x FROM moments LIMIT 1'));
}

export async function accountStatus(db: SQLiteDatabase, username: string | null): Promise<AccountStatus> {
  if (!username) return 'needsUsername';
  return (await isOnboarded(db)) ? 'ready' : 'onboarding';
}

/**
 * Brings the username and onboarding over from the server when this phone doesn't have
 * them yet. `fetchAccount` is null without a backend.
 */
export async function loadAccount(
  db: SQLiteDatabase, fetchAccount: (() => Promise<AccountRow | null>) | null,
): Promise<{ username: string | null; status: AccountStatus }> {
  let name = await getMeta(db, 'username');
  if ((!name || !(await isOnboarded(db))) && fetchAccount) {
    const data = await fetchAccount();
    if (!name) name = data?.username ?? null;
    if (name) await setMeta(db, 'username', name);
    if (data?.onboarded_at) {
      await setMeta(db, 'onboarded_at', data.onboarded_at);
      await setMeta(db, 'interests', JSON.stringify(data.interests ?? []));
    }
  }
  return { username: name, status: await accountStatus(db, name) };
}

/**
 * Ends onboarding: puts the chosen grids on the shelf (fetching any the phone doesn't
 * have through `ensureTemplate`), and saves the interests to send with the next sync.
 */
export async function completeOnboarding(
  db: SQLiteDatabase, userId: string, interests: string[], gridIds: string[],
  ensureTemplate: (gridId: string) => Promise<boolean>,
) {
  for (const gridId of gridIds) {
    if (await ensureTemplate(gridId)) await adoptGrid(db, userId, gridId);
  }
  // A v1 account's untouched starter shelf makes way for what was picked.
  const before = await db.getAllAsync<{ id: string; grid_id: string }>('SELECT id, grid_id FROM user_grids WHERE deleted_at IS NULL');
  for (const ug of before) {
    if (!gridIds.includes(ug.grid_id)) await removeFromShelf(db, ug.id);
  }
  await setMeta(db, 'interests', JSON.stringify(interests));
  await setMeta(db, 'onboarded_at', new Date().toISOString());
  await setMeta(db, 'profile_dirty', '1');
}
