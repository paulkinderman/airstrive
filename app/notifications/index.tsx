import { View, ScrollView, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Circle } from 'react-native-svg';
import { goBack } from '@/lib/goBack';
import { useLoad } from '@/friends/useLoad';
import { BackIcon } from '@/friends/bits';
import { listNotifications, markRead, type AppNotification } from '@/notifications/api';
import { NotificationRow } from '@/notifications/NotificationRow';
import { refreshUnread } from '@/notifications/unread';
import { Text } from '@/ui/Text';
import { colors, radius } from '@/theme';

/** Everything, newest first. A notification is read once it's tapped, answered or swiped away, or with Mark all read. */
export default function NotificationsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const list = useLoad(() => listNotifications(), []);
  const items = list.data ?? [];
  const fresh = items.filter((n) => !n.readAt || n.state === 'pending');
  const earlier = items.filter((n) => !(!n.readAt || n.state === 'pending'));

  const readAll = async () => {
    await markRead().catch(() => {});
    void refreshUnread();
    await list.reload();
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.paper }}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => goBack(router, '/profile')} style={styles.iconButton} accessibilityLabel="Back"><BackIcon /></Pressable>
        <Text variant="label">Notifications</Text>
        <Pressable onPress={() => router.push('/notifications/settings')} style={styles.iconButton} accessibilityLabel="Manage push notifications">
          <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={colors.ink} strokeWidth={2} strokeLinecap="round">
            <Path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1" />
            <Circle cx={15} cy={6} r={2} /><Circle cx={9} cy={12} r={2} /><Circle cx={17} cy={18} r={2} />
          </Svg>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 8, gap: 14, paddingBottom: insets.bottom + 32 }}>

        {list.loading && !list.data ? <ActivityIndicator color={colors.muted} style={{ padding: 12 }} /> : null}
        {list.error && !list.data ? (
          <Text variant="body" style={{ color: colors.muted }}>Couldn't reach AirStrive. Notifications show up here when you're back online.</Text>
        ) : null}
        {list.data && items.length === 0 ? (
          <Text variant="body" style={{ color: colors.muted }}>
            Nothing yet. Friend requests, invites, and moments your friends add to grids you share will show up here.
          </Text>
        ) : null}

        <Group title="New" items={fresh} reload={list.reload} onReadAll={fresh.some((n) => !n.readAt) ? readAll : undefined} />
        <Group title={fresh.length ? 'Earlier' : 'Recent'} items={earlier} reload={list.reload} />
      </ScrollView>
    </View>
  );
}

function Group({ title, items, reload, onReadAll }: { title: string; items: AppNotification[]; reload: () => void; onReadAll?: () => void }) {
  if (items.length === 0) return null;
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text variant="label">{title}</Text>
        {onReadAll ? (
          <Pressable onPress={onReadAll} hitSlop={10} accessibilityRole="button">
            <Text variant="bodyBold" style={{ fontSize: 13, color: colors.muted }}>Mark all read</Text>
          </Pressable>
        ) : null}
      </View>
      <View style={styles.list}>
        {items.map((n) => <NotificationRow key={n.id} n={n} onChanged={reload} />)}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10, paddingBottom: 6 },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  list: { borderRadius: radius.lg, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
});
