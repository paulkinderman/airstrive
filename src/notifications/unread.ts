import { useEffect, useState } from 'react';
import { unreadCount } from './api';
import { setBadge } from './push';

/**
 * The unread count, shared by the Profile tab's bell, the tab bar and the app icon badge.
 * refreshUnread() asks the server again; screens call it when they come into view and
 * when a push arrives while the app is open.
 */
let count = 0;
const listeners = new Set<(n: number) => void>();

function set(n: number) {
  count = n;
  setBadge(n);
  listeners.forEach((l) => l(n));
}

export async function refreshUnread(): Promise<number> {
  try { set(await unreadCount()); } catch { /* offline: keep what we had */ }
  return count;
}

export function clearUnread() { set(0); }

export function useUnread(): number {
  const [n, setN] = useState(count);
  useEffect(() => {
    listeners.add(setN);
    setN(count);
    return () => { listeners.delete(setN); };
  }, []);
  return n;
}
