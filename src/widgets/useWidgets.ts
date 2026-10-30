import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useDataVersion } from '@/sync/events';
import { publishWidgets } from './publish';

/** Lets a burst of edits or a sync pull settle before the widgets are rewritten. */
const SETTLE_MS = 1500;

/**
 * Keeps the home screen widgets in step with the shelf: after every local edit or sync pull, and
 * each time the app comes back to the front (which also fetches what friends shared).
 */
export function useWidgets(ready: boolean, online: boolean) {
  const db = useSQLiteContext();
  const version = useDataVersion();

  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => { publishWidgets(db, false).catch(() => {}); }, SETTLE_MS);
    return () => clearTimeout(t);
  }, [db, ready, version]);

  useEffect(() => {
    if (!ready) return;
    publishWidgets(db, online).catch(() => {});
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') publishWidgets(db, online).catch(() => {});
    });
    return () => sub.remove();
  }, [db, ready, online]);
}
