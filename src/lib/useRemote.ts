import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';
import type { Cached } from './remote';

export interface RemoteState<T> {
  /** Null until the first answer. */
  data: T | null;
  offline: boolean;
  /** Fetches again, for pull-to-refresh. */
  refresh: () => Promise<void>;
}

/**
 * Loads `load` whenever the screen comes into focus. `load` is usually a cachedFetch
 * wrapper; keep it stable (module-level, or useCallback) so focus doesn't loop.
 */
export function useRemote<T>(load: (db: SQLiteDatabase) => Promise<Cached<T>>): RemoteState<T> {
  const db = useSQLiteContext();
  const [state, setState] = useState<{ data: T | null; offline: boolean }>({ data: null, offline: false });
  const live = useRef(true);

  const refresh = useCallback(async () => {
    const r = await load(db);
    if (live.current) setState(r);
  }, [db, load]);

  useFocusEffect(
    useCallback(() => {
      live.current = true;
      void refresh();
      return () => { live.current = false; };
    }, [refresh]),
  );

  return { ...state, refresh };
}
