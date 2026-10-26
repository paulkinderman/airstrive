import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';

/** Loads something from the server each time the screen comes into view. */
export function useLoad<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const live = useRef(true);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(async () => {
    setLoading(true);
    try {
      const v = await load();
      if (live.current) { setData(v); setError(null); }
    } catch (e) {
      if (live.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (live.current) setLoading(false);
    }
  }, deps);

  useFocusEffect(useCallback(() => {
    live.current = true;
    void run();
    return () => { live.current = false; };
  }, [run]));

  return { data, error, loading, reload: run };
}
