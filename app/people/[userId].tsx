import { useState } from 'react';
import { View, ScrollView, Pressable, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { goBack } from '@/lib/goBack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import {
  blockUser, cancelRequest, getProfile, removeFriend, requestFriend, respondRequest, type Relation,
} from '@/friends/api';
import { AUDIENCE_LABEL } from '@/friends/audience';
import { useLoad } from '@/friends/useLoad';
import { Avatar, BackIcon, Chevron } from '@/friends/bits';
import { Text } from '@/ui/Text';
import { Button } from '@/ui/Button';
import { MiniGrid } from '@/ui/MiniGrid';
import { Menu, type MenuItem } from '@/ui/Menu';
import { colors, radius } from '@/theme';

const RELATION_BUTTON: Record<Exclude<Relation, 'self' | 'friends'>, string> = {
  none: 'Add friend',
  requested: 'Requested',
  incoming: 'Accept friend request',
};

export default function PersonProfile() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const profile = useLoad(() => getProfile(userId), [userId]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const p = profile.data;

  const act = async () => {
    if (!p) return;
    setBusy(true);
    try {
      if (p.relation === 'none') await requestFriend(p.id);
      else if (p.relation === 'requested') await cancelRequest(p.id);
      else if (p.relation === 'incoming') await respondRequest(p.id, true);
    } catch { /* the reload shows where things stand */ }
    setBusy(false);
    await profile.reload();
  };

  const onRemove = () => {
    if (!p) return;
    Alert.alert(`Remove ${p.username}?`, "You'll stop seeing each other's friends-only grids and moments. They won't be told.", [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => { await removeFriend(p.id).catch(() => {}); await profile.reload(); } },
    ]);
  };

  const onBlock = () => {
    if (!p) return;
    Alert.alert(`Block ${p.username}?`, "You won't see each other's profiles or find each other in search, and they can't ask to be friends. They won't be told.", [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Block', style: 'destructive', onPress: async () => { await blockUser(p.id).catch(() => {}); goBack(router, '/profile'); } },
    ]);
  };

  const menuItems: MenuItem[] = p ? [
    ...(p.relation === 'friends' ? [{ label: 'Remove friend', onPress: onRemove }] : []),
    { label: 'Block', destructive: true, onPress: onBlock },
    { label: 'Report', destructive: true, onPress: () => router.push({ pathname: '/report/user/[userId]', params: { userId: p.id, username: p.username } }) },
  ] : [];

  return (
    <View style={{ flex: 1, backgroundColor: colors.paper }}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => goBack(router, '/profile')} style={styles.iconButton} accessibilityLabel="Back"><BackIcon /></Pressable>
        <Text variant="label">Profile</Text>
        {p && p.relation !== 'self' ? (
          <Pressable onPress={() => setMenuOpen(true)} style={styles.iconButton} accessibilityLabel="More">
            <Svg width={22} height={22} viewBox="0 0 24 24" fill={colors.ink}>
              <Circle cx={5} cy={12} r={2} /><Circle cx={12} cy={12} r={2} /><Circle cx={19} cy={12} r={2} />
            </Svg>
          </Pressable>
        ) : <View style={styles.iconButton} />}
      </View>

      {!p ? (
        <View style={{ padding: 24, gap: 10 }}>
          {profile.loading ? <ActivityIndicator color={colors.muted} /> : (
            <Text variant="body" style={{ color: colors.muted }}>
              {profile.error ? "Couldn't reach AirStrive. Check your connection." : "This profile isn't available."}
            </Text>
          )}
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: insets.bottom + 32 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <Avatar userId={p.id} name={p.username} size={56} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="title" style={{ fontSize: 24 }}>{p.username}</Text>
              {p.relation === 'friends' && <Text variant="caption" style={{ color: colors.muted }}>Friends</Text>}
              {p.relation === 'incoming' && <Text variant="caption" style={{ color: colors.muted }}>Wants to be friends</Text>}
            </View>
          </View>
          {p.relation !== 'friends' && p.relation !== 'self' && (
            <Button label={RELATION_BUTTON[p.relation]} kind={p.relation === 'requested' ? 'secondary' : 'primary'} onPress={act} disabled={busy} />
          )}
          {p.relation === 'incoming' && (
            <Button label="Not now" kind="quiet" onPress={async () => { await respondRequest(p.id, false).catch(() => {}); await profile.reload(); }} style={{ alignSelf: 'flex-start' }} />
          )}
          {p.bio ? <Text variant="body">{p.bio}</Text> : null}

          <View style={{ gap: 8 }}>
            <Text variant="label">Grids</Text>
            {p.grids.length === 0 ? (
              <Text variant="body" style={{ color: colors.muted }}>
                {p.relation === 'friends' ? `${p.username} hasn't shared any grids yet.` : `Nothing shared with everyone yet.${p.relation === 'none' ? ' Friends may see more.' : ''}`}
              </Text>
            ) : (
              <View style={styles.list}>
                {p.grids.map((g) => (
                  <Pressable key={g.userGridId} onPress={() => router.push({ pathname: '/people/grid/[userGridId]', params: { userGridId: g.userGridId } })} style={styles.row}>
                    <MiniGrid states={g.states} cols={g.cols} color={g.color} cell={g.cols >= 10 ? 4 : 5} />
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text variant="bodyBold">{g.title}</Text>
                      <Text variant="caption" style={{ color: colors.muted }}>{g.completedAt ? 'Complete' : AUDIENCE_LABEL[g.audience]}</Text>
                    </View>
                    <Chevron />
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        </ScrollView>
      )}
      <Menu visible={menuOpen} title={p?.username ?? ''} items={menuItems} onClose={() => setMenuOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10, paddingBottom: 6 },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  list: { borderRadius: radius.lg, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 68, paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.line, marginTop: -1 },
});
