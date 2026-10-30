import type { SQLiteDatabase } from 'expo-sqlite';

/** Home screen widgets are iOS only (publish.ios.ts); elsewhere there is nothing to update. */
export async function publishWidgets(_db: SQLiteDatabase, _withFriends: boolean) {}

export function clearWidgets() {}
