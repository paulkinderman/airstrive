import { useCallback, useState } from 'react';
import { View, ScrollView, Pressable, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { loadBoard } from '@/db/repo';
import { listGroupPeople, type GroupPerson } from '@/groups/repo';
import { cancelGroupInvite, inviteToGroup, leaveGroup } from '@/groups/api';
import { listFriends, type Friend } from '@/friends/api';
import { useLoad } from '@/friends/useLoad';
import { Avatar, BackIcon } from '@/friends/bits';
import { useAuth } from '@/auth/AuthProvider';
import { useSync, localFiles } from '@/sync/SyncProvider';
import { useDataVersion } from '@/sync/events';
import { Text } from '@/ui/Text';
import { Button } from '@/ui/Button';
import { MiniGrid } from '@/ui/MiniGrid';
import { colors, radius } from '@/theme';

type Board = NonNullable<Awaited<ReturnType<typeof loadBoard>>>;

/** Who's doing a group grid: the members, people invited, friends to invite, and leaving. */
export default function TogetherScreen() {
  const { groupId, invite } = useLocalSearchParams<{ groupId: string; invite?: string }>();
  const db = useSQLiteContext();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { userId } = useAuth();
  const sync = useSync();
  const version = useDataVersion();
  const [board, setBoard] = useState<Board | null>(null);
  const [people, setPeople] = useState<GroupPerson[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setBoard(await loadBoard(db, groupId));
    setPeople(await listGroupPeople(db, groupId));
  }, [db, groupId, version]);
  useFocusEffect(useCallback(() => { void reload(); sync.request(); }, [reload]));

  const friends = useLoad(() => listFriends(), []);

  const members = people.filter((p) => p.status === 'member');
  const invited = people.filter((p) => p.status === 'invited');
  const left = people.filter((p) => p.status === 'left');
  const inGroup = new Set(people.filter((p) => p.status !== 'left').map((p) => p.id));
  const toInvite = (friends.data ?? []).filter((f) => !inGroup.has(f.id));

  const onInvite = async (f: Friend) => {
    setBusy(f.id);
    setError(null);
    try {
      await inviteToGroup(groupId, f.id);
      await db.runAsync(
        "INSERT OR REPLACE INTO group_people (group_id, user_id, username, status) VALUES (?, ?, ?, 'invited')", groupId, f.id, f.username,
      );
      await reload();
    } catch {
      setError("Couldn't send the invite. Check your connection.");
    }
    setBusy(null);
  };

  const onCancel = async (p: GroupPerson) => {
    setBusy(p.id);
    setError(null);
    try {
      await cancelGroupInvite(groupId, p.id);
      await db.runAsync('DELETE FROM group_people WHERE group_id = ? AND user_id = ?', groupId, p.id);
      await reload();
    } catch {
      setError("Couldn't cancel the invite. Check your connection.");
    }
    setBusy(null);
  };

  const onLeave = () => {
    const last = members.length <= 1;
    Alert.alert(
      `Leave ${board?.title ?? 'this grid'}?`,
      last
        ? 'You\'re the only one left, so the grid and everything on it goes for good.'
        : 'It comes off your shelf. What you added stays for the others, with your name on it.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: last ? 'Leave and delete' : 'Leave',
          style: 'destructive',
          onPress: async () => {
            try {
              await leaveGroup(db, groupId, localFiles);
              router.dismissTo('/');
            } catch {
              Alert.alert("Couldn't leave", 'Leaving needs a connection. Try again when you\'re back online.');
            }
          },
        },
      ],
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.paper }}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} style={styles.iconButton} accessibilityLabel="Back"><BackIcon /></Pressable>
        <Text variant="label">Doing it together</Text>
        <View style={styles.iconButton} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, gap: 18, paddingBottom: insets.bottom + 32 }}>
        {board && (
          <Pressable onPress={() => router.dismissTo({ pathname: '/grid/[id]', params: { id: groupId } })} style={[styles.list, styles.row, { marginTop: 0 }]}>
            <MiniGrid states={board.squares.map((s) => s.state)} cols={board.cols} color={board.color} cell={board.cols >= 10 ? 4 : 5} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="bodyBold">{board.title}</Text>
              <Text variant="caption" style={{ color: colors.muted }}>Only the people here see this grid.</Text>
            </View>
          </Pressable>
        )}

        {invite === '1' && members.length <= 1 && invited.length === 0 && (
          <View style={{ gap: 4 }}>
            <Text variant="title">Who's doing this with you?</Text>
            <Text variant="body" style={{ color: colors.muted }}>
              Invite friends below. Anyone in the group can do a square, and each of you adds your own words and photos to it.
            </Text>
          </View>
        )}

        <Section title="In this grid">
          {members.map((p) => (
            <View key={p.id} style={styles.row}>
              <Avatar userId={p.id} name={p.username} />
              <Text variant="bodyBold" style={{ flex: 1 }}>{p.id === userId ? `${p.username} (you)` : p.username}</Text>
            </View>
          ))}
          {members.length === 0 && <Text variant="body" style={{ color: colors.muted, padding: 14 }}>Shows up after the next sync.</Text>}
        </Section>

        {invited.length > 0 && (
          <Section title="Invited">
            {invited.map((p) => (
              <View key={p.id} style={styles.row}>
                <Avatar userId={p.id} name={p.username} />
                <Text variant="bodyBold" style={{ flex: 1 }}>{p.username}</Text>
                <Button label="Cancel" kind="quiet" onPress={() => onCancel(p)} disabled={busy === p.id} />
              </View>
            ))}
          </Section>
        )}

        <Section title="Invite a friend">
          {friends.loading && !friends.data ? <ActivityIndicator color={colors.muted} style={{ padding: 12 }} /> : null}
          {friends.error && !friends.data && (
            <Text variant="body" style={{ color: colors.muted, padding: 14 }}>Couldn't reach AirStrive. Friends show up here when you're back online.</Text>
          )}
          {friends.data && toInvite.length === 0 && (
            <Text variant="body" style={{ color: colors.muted, padding: 14 }}>
              {friends.data.length === 0 ? 'Add friends from your Profile, then invite them here.' : 'All your friends are in or invited.'}
            </Text>
          )}
          {toInvite.map((f) => (
            <View key={f.id} style={styles.row}>
              <Avatar userId={f.id} name={f.username} />
              <Text variant="bodyBold" style={{ flex: 1 }}>{f.username}</Text>
              <Button label={busy === f.id ? 'Inviting…' : 'Invite'} onPress={() => onInvite(f)} disabled={busy === f.id} style={styles.smallButton} />
            </View>
          ))}
        </Section>
        {error && <Text variant="caption" style={{ color: colors.danger }}>{error}</Text>}

        {left.length > 0 && (
          <Text variant="caption" style={{ color: colors.muted }}>
            {left.map((p) => p.username).join(', ')} left, and what they added is still here.
          </Text>
        )}

        <Pressable onPress={onLeave} style={{ paddingVertical: 10 }}>
          <Text variant="bodyBold" style={{ fontSize: 14, color: colors.danger }}>Leave this grid</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 8 }}>
      <Text variant="label">{title}</Text>
      <View style={styles.list}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10, paddingBottom: 6 },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  list: { borderRadius: radius.lg, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingHorizontal: 14, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.line, marginTop: -1 },
  smallButton: { height: 40, paddingHorizontal: 14 },
});
