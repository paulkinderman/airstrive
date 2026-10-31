import { useCallback } from 'react';
import { Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useSync } from '@/sync/SyncProvider';
import { markRead, type AppNotification } from './api';
import { refreshUnread } from './unread';
import type { PushData } from './push';

/**
 * Where a notification goes, the same from a push and from the list: a person's profile
 * for friend news, the group grid (on the square that was posted) for group news, and
 * Notifications for an invite still waiting for an answer.
 */
export function useOpenNotification() {
  const router = useRouter();
  const db = useSQLiteContext();
  const sync = useSync();

  return useCallback(async (n: PushData & { state?: AppNotification['state'] }) => {
    if (n.notificationId) void markRead(n.notificationId).then(refreshUnread).catch(() => {});
    const kind = n.kind;
    if ((kind === 'friend_request' || kind === 'friend_accepted') && n.actorId) {
      router.push({ pathname: '/people/[userId]', params: { userId: n.actorId } });
      return;
    }
    if (kind === 'group_invite' && n.state !== 'done') {
      router.push('/notifications');
      return;
    }
    if (n.groupId) {
      // Someone else's new moment reaches this phone with the next sync.
      await sync.syncNow().catch(() => {});
      const here = await db.getFirstAsync('SELECT 1 AS x FROM user_grids WHERE id = ? AND deleted_at IS NULL', n.groupId);
      if (here) {
        router.push({ pathname: '/grid/[id]', params: n.squareStateId ? { id: n.groupId, select: n.squareStateId } : { id: n.groupId } });
      } else {
        Alert.alert("That grid isn't here yet", 'It will be on your shelf once it has finished downloading.');
      }
      return;
    }
    router.push('/notifications');
  }, [router, db, sync]);
}

export const fromNotification = (n: AppNotification): PushData & { state: AppNotification['state'] } => ({
  notificationId: n.readAt ? undefined : n.id,
  kind: n.kind,
  actorId: n.actorId ?? undefined,
  groupId: n.groupId ?? undefined,
  squareStateId: n.squareStateId ?? undefined,
  state: n.state,
});
