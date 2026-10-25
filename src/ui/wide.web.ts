import { useCallback, useSyncExternalStore } from 'react';
import { useFocusEffect } from 'expo-router';
import { setFullWidth } from '@/lib/webSetup.web';

/** Below this the web build keeps the phone layout, in a phone-width column. */
const WIDE_MIN = 960;

const subscribe = (cb: () => void) => {
  window.addEventListener('resize', cb);
  return () => window.removeEventListener('resize', cb);
};
const isWide = () => window.innerWidth >= WIDE_MIN;

/**
 * True when the browser window is wide enough for a screen's wide layout. While that screen
 * is in front, the app drops its phone-width column and uses the whole window.
 */
export function useWideLayout(): boolean {
  const wide = useSyncExternalStore(subscribe, isWide, () => false);
  useFocusEffect(
    useCallback(() => {
      if (!wide) return;
      setFullWidth(true);
      return () => setFullWidth(false);
    }, [wide]),
  );
  return wide;
}
