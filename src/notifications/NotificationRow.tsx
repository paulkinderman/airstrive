import { useRef, useState } from 'react';
import { View, Pressable, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import Swipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import { useSQLiteContext } from 'expo-sqlite';
import { respondRequest } from '@/friends/api';
import { respondGroupInvite } from '@/groups/api';
import { useSync } from '@/sync/SyncProvider';
import { Avatar, Chevron } from '@/friends/bits';
import { Text } from '@/ui/Text';
import { Button } from '@/ui/Button';
import { colors } from '@/theme';
import { describe, markRead, when, type AppNotification } from './api';
import { fromNotification, useOpenNotification } from './open';
import { refreshUnread } from './unread';

/**
 * One notification: who, what, when. A request or invite still waiting has its answer
 * right on the row; anything else opens where it points.
 */
export function NotificationRow({ n, onChanged, compact }: { n: AppNotification; onChanged: () => void; compact?: boolean }) {
  const router = useRouter();
  const db = useSQLiteContext();
  const sync = useSync();
  const open = useOpenNotification();
  const [busy, setBusy] = useState(false);
  const [readHere, setReadHere] = useState(false);
  const swipe = useRef<SwipeableMethods>(null);
  const pending = n.state === 'pending';
  const unread = !n.readAt && !readHere;

  const readIt = async () => {
    setReadHere(true);
    swipe.current?.close();
    try { await markRead(n.id); } catch { setReadHere(false); return; }
    void refreshUnread();
    onChanged();
  };

  const answer = async (accept: boolean) => {
    setBusy(true);
    try {
      if (n.kind === 'friend_request' && n.actorId) await respondRequest(n.actorId, accept);
      if (n.kind === 'group_invite' && n.groupId) {
        await respondGroupInvite(n.groupId, accept);
        if (accept) {
          await sync.syncNow();
          const here = await db.getFirstAsync('SELECT 1 AS x FROM user_grids WHERE id = ? AND deleted_at IS NULL', n.groupId);
          if (here) router.push({ pathname: '/grid/[id]', params: { id: n.groupId } });
          else Alert.alert("You're in", 'The grid will be on your shelf once it has finished downloading.');
        }
      }
      await markRead(n.id).catch(() => {});
      void refreshUnread();
    } catch {
      Alert.alert("Couldn't reach AirStrive", 'Check your connection and try again.');
    }
    setBusy(false);
    onChanged();
  };

  const accept = n.kind === 'friend_request' ? 'Accept' : 'Join';
  const decline = n.kind === 'friend_request' ? 'Not now' : 'No thanks';

  const row = (
    <Pressable onPress={() => void open(fromNotification(n))} style={[styles.row, unread && styles.unread]} accessibilityRole="button">
      {unread ? <View style={styles.dot} /> : null}
      {n.kind === 'group_invite' && pending
        ? <View style={[styles.swatch, { backgroundColor: n.gridColor ?? colors.accent }]} />
        : <Avatar userId={n.actorId} name={n.actorUsername} />}
      <View style={{ flex: 1, gap: 1 }}>
        <Text variant="body" numberOfLines={compact ? 2 : 3}>
          {describe(n).map((p, i) => <Text key={i} variant={p.bold ? 'bodyBold' : 'body'}>{p.text}</Text>)}
        </Text>
        <Text variant="caption">{when(n.createdAt)}</Text>
      </View>
      {pending ? (
        <>
          <Button label={accept} onPress={() => void answer(true)} disabled={busy} style={styles.small} />
          {compact ? <Button label={decline} kind="quiet" onPress={() => void answer(false)} disabled={busy} /> : null}
        </>
      ) : <Chevron />}
    </Pressable>
  );

  if (!unread) return row;
  // Swipe left to mark as read.
  return (
    <Swipeable
      ref={swipe}
      friction={1.5}
      rightThreshold={60}
      overshootRight={false}
      onSwipeableOpen={() => void readIt()}
      renderRightActions={() => (
        <Pressable onPress={() => void readIt()} style={styles.readAction} accessibilityLabel="Mark as read">
          <Text variant="bodyBold" style={{ color: '#fff', fontSize: 13 }}>Mark as read</Text>
        </Pressable>
      )}
    >
      {row}
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 60, paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.line, marginTop: -1 },
  unread: { backgroundColor: '#FFFBEF' },
  dot: { position: 'absolute', left: 4, top: '50%', width: 7, height: 7, borderRadius: 4, backgroundColor: colors.accent },
  swatch: { width: 36, height: 36, borderRadius: 10 },
  readAction: { width: 112, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.ink },
  small: { height: 36, paddingHorizontal: 12 },
});
