import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useAuth } from '@/auth/AuthProvider';
import { onPushReceived, onPushTapped, registerIfAllowed } from './push';
import { useOpenNotification } from './open';
import { refreshUnread } from './unread';

/**
 * Runs once the shelf is up: refreshes this phone's push token if pushes are allowed,
 * keeps the unread count current, and opens whatever a tapped push points at.
 */
export function usePushSetup() {
  const { configured } = useAuth();
  const open = useOpenNotification();
  const openRef = useRef(open);
  openRef.current = open;

  useEffect(() => {
    if (!configured) return;
    void registerIfAllowed();
    void refreshUnread();
    const offTap = onPushTapped((data) => void openRef.current(data));
    const offReceive = onPushReceived(() => void refreshUnread());
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') void refreshUnread(); });
    return () => { offTap(); offReceive(); sub.remove(); };
  }, [configured]);
}
