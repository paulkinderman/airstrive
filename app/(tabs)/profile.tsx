import { useCallback, useState, type ReactNode } from 'react';
import { ScrollView, View, Pressable, TextInput, StyleSheet, ActivityIndicator, Alert, Platform } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Circle } from 'react-native-svg';
import { listSharedGrids } from '@/db/repo';
import { listFriends, listRequests, myBio, respondRequest, saveBio, type Friend, type FriendRequest } from '@/friends/api';
import { AUDIENCE_LABEL } from '@/friends/audience';
import { listGroupInvites, respondGroupInvite, type GroupInvite } from '@/groups/api';
import { useLoad } from '@/friends/useLoad';
import { useAuth } from '@/auth/AuthProvider';
import { useSync } from '@/sync/SyncProvider';
import { useDataVersion } from '@/sync/events';
import { Text } from '@/ui/Text';
import { Button } from '@/ui/Button';
import { MiniGrid } from '@/ui/MiniGrid';
import { Avatar, Chevron, Initial } from '@/friends/bits';
import { removeMyAvatar, setMyAvatar, useAvatar } from '@/friends/avatars';
import { pickAvatar } from '@/lib/avatarImage';
import { Menu, type MenuItem } from '@/ui/Menu';
import { colors, fonts, radius } from '@/theme';

type SharedGrids = Awaited<ReturnType<typeof listSharedGrids>>;

export default function ProfileTab() {
  const db = useSQLiteContext();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const auth = useAuth();
  const sync = useSync();
  const version = useDataVersion();
  const [shared, setShared] = useState<SharedGrids>([]);
  const [bio, setBio] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [pictureMenu, setPictureMenu] = useState(false);
  const myPicture = useAvatar(auth.userId);

  useFocusEffect(useCallback(() => { listSharedGrids(db).then(setShared); }, [db, version]));

  const people = useLoad(async () => {
    if (!auth.configured) return { friends: [] as Friend[], requests: [] as FriendRequest[], invites: [] as GroupInvite[] };
    const [friends, requests, b, invites] = await Promise.all([
      listFriends(), listRequests(), myBio(), listGroupInvites().catch(() => [] as GroupInvite[]),
    ]);
    setBio(b);
    return { friends, requests, invites };
  }, [auth.configured]);

  const respond = async (r: FriendRequest, accept: boolean) => {
    setBusy(r.id);
    try { await respondRequest(r.id, accept); } catch { /* shown by the reload */ }
    setBusy(null);
    await people.reload();
  };

  const answerInvite = async (inv: GroupInvite, accept: boolean) => {
    setBusy(inv.groupId);
    try {
      await respondGroupInvite(inv.groupId, accept);
      if (accept) {
        await sync.syncNow();
        const here = await db.getFirstAsync('SELECT 1 AS x FROM user_grids WHERE id = ? AND deleted_at IS NULL', inv.groupId);
        if (here) router.push({ pathname: '/grid/[id]', params: { id: inv.groupId } });
        else Alert.alert('You\'re in', 'The grid will be on your shelf once it has finished downloading.');
      }
    } catch { /* shown by the reload */ }
    setBusy(null);
    await people.reload();
  };

  const onSaveBio = async () => {
    setBusy('bio');
    try {
      await saveBio(draft);
      setBio(draft.trim());
      setEditing(false);
    } catch { /* keep editing */ }
    setBusy(null);
  };

  const changePicture = async (from: 'library' | 'camera') => {
    if (!auth.userId) return;
    try {
      const image = await pickAvatar(from);
      if (!image) return;
      setBusy('picture');
      await setMyAvatar(db, auth.userId, image);
    } catch {
      Alert.alert("Couldn't save your picture", 'Check your connection and try again.');
    }
    setBusy(null);
  };

  const removePicture = async () => {
    if (!auth.userId) return;
    setBusy('picture');
    try { await removeMyAvatar(db, auth.userId); } catch {
      Alert.alert("Couldn't remove your picture", 'Check your connection and try again.');
    }
    setBusy(null);
  };

  const pictureItems: MenuItem[] = [
    { label: 'Choose a photo', onPress: () => void changePicture('library') },
    ...(Platform.OS === 'web' ? [] : [{ label: 'Take a photo', onPress: () => void changePicture('camera') }]),
    ...(myPicture ? [{ label: 'Remove picture', destructive: true, onPress: () => void removePicture() }] : []),
  ];

  const friends = people.data?.friends ?? [];
  const requests = people.data?.requests ?? [];
  const invites = people.data?.invites ?? [];

  return (
    <ScrollView style={{ backgroundColor: colors.paper }} contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: 40, gap: 14 }}>
      <View style={styles.header}>
        <Text variant="label">Profile</Text>
        <Pressable onPress={() => router.push('/settings')} style={styles.roundButton} accessibilityLabel="Settings">
          <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={colors.ink} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <Circle cx={12} cy={12} r={3} />
            <Path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
          </Svg>
          {sync.failed > 0 && <View style={styles.badge} />}
        </Pressable>
      </View>

      <View style={[styles.card, { marginHorizontal: 20 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          {auth.configured && auth.userId ? (
            <Pressable
              onPress={() => setPictureMenu(true)}
              disabled={busy === 'picture'}
              accessibilityLabel={myPicture ? 'Change your profile picture' : 'Add a profile picture'}
            >
              <Avatar userId={auth.userId} name={auth.username ?? '?'} size={56} />
              <View style={styles.pictureBadge}>
                {busy === 'picture' ? <ActivityIndicator size="small" color={colors.ink} /> : (
                  <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={colors.ink} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
                    <Path d="M4 8h3l2-3h6l2 3h3v11H4z" /><Circle cx={12} cy={13} r={3.5} />
                  </Svg>
                )}
              </View>
            </Pressable>
          ) : (
            <View style={styles.avatar}><Text variant="display" style={{ fontSize: 26, lineHeight: 30, color: '#fff' }}>{(auth.username ?? '?').slice(0, 1).toUpperCase()}</Text></View>
          )}
          <Text variant="title" style={{ fontSize: 24, flex: 1 }}>{auth.username}</Text>
        </View>
        {editing ? (
          <>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              multiline
              maxLength={280}
              autoFocus
              placeholder="A line about you, for people who visit your profile"
              placeholderTextColor={colors.faint}
              style={styles.bioInput}
            />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Button label={busy === 'bio' ? 'Saving…' : 'Save'} onPress={onSaveBio} disabled={busy === 'bio'} style={{ flex: 1 }} />
              <Button label="Cancel" kind="secondary" onPress={() => setEditing(false)} style={{ flex: 1 }} />
            </View>
          </>
        ) : auth.configured ? (
          <Pressable onPress={() => { setDraft(bio ?? ''); setEditing(true); }} accessibilityLabel="Edit your bio">
            <Text variant="body" style={{ color: bio ? colors.ink : colors.muted }}>{bio || 'Add a line about you'}</Text>
          </Pressable>
        ) : null}
      </View>

      {!auth.configured ? (
        <Text variant="body" style={{ color: colors.muted, paddingHorizontal: 20 }}>Friends need an account. This build keeps everything on this phone only.</Text>
      ) : (
        <>
          <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 20 }}>
            <Button label="Add a friend" onPress={() => router.push('/friends/add')} style={{ flex: 1 }} />
            <Button label="My QR code" kind="secondary" onPress={() => router.push('/friends/code')} style={{ flex: 1 }} />
          </View>

          {people.error && !people.data && (
            <Text variant="body" style={{ color: colors.muted, paddingHorizontal: 20 }}>Couldn't reach AirStrive. Friends show up here when you're back online.</Text>
          )}

          {requests.length > 0 && (
            <Section title="Asking to be friends">
              {requests.map((r) => (
                <View key={r.id} style={styles.row}>
                  <Initial name={r.username} />
                  <Text variant="bodyBold" style={{ flex: 1 }}>{r.username}</Text>
                  <Button label="Accept" onPress={() => respond(r, true)} disabled={busy === r.id} style={styles.smallButton} />
                  <Button label="Not now" kind="quiet" onPress={() => respond(r, false)} disabled={busy === r.id} />
                </View>
              ))}
            </Section>
          )}

          {invites.length > 0 && (
            <Section title="Grids to do together">
              {invites.map((inv) => (
                <View key={inv.groupId} style={styles.row}>
                  <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: inv.color }} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text variant="bodyBold">{inv.title}</Text>
                    <Text variant="caption" style={{ color: colors.muted }}>{inv.from} invited you</Text>
                  </View>
                  <Button label="Join" onPress={() => answerInvite(inv, true)} disabled={busy === inv.groupId} style={styles.smallButton} />
                  <Button label="No thanks" kind="quiet" onPress={() => answerInvite(inv, false)} disabled={busy === inv.groupId} />
                </View>
              ))}
            </Section>
          )}

          <Section title="Friends">
            {people.loading && !people.data ? <ActivityIndicator color={colors.muted} style={{ padding: 12 }} /> : null}
            {people.data && friends.length === 0 && (
              <Text variant="body" style={{ color: colors.muted, padding: 14 }}>
                Friends see the grids and moments you share with them. Add someone by their username or your QR code.
              </Text>
            )}
            {friends.map((f) => (
              <Pressable key={f.id} onPress={() => router.push({ pathname: '/people/[userId]', params: { userId: f.id } })} style={styles.row}>
                <Avatar userId={f.id} name={f.username} />
                <Text variant="bodyBold" style={{ flex: 1 }}>{f.username}</Text>
                <Chevron />
              </Pressable>
            ))}
          </Section>
        </>
      )}

      <Section title="Grids you share">
        {shared.length === 0 && (
          <Text variant="body" style={{ color: colors.muted, padding: 14 }}>
            Everything starts private. Choose who can see a grid from its menu.
          </Text>
        )}
        {shared.map((g) => (
          <Pressable key={g.userGridId} onPress={() => router.push({ pathname: '/grid/[id]', params: { id: g.userGridId } })} style={styles.row}>
            <MiniGrid states={g.states} cols={g.cols} color={g.color} cell={g.cols >= 10 ? 4 : 5} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="bodyBold">{g.title}</Text>
              <Text variant="caption" style={{ color: colors.muted }}>{AUDIENCE_LABEL[g.audience]}</Text>
            </View>
            <Chevron />
          </Pressable>
        ))}
      </Section>
      <Menu
        visible={pictureMenu}
        title="Profile picture"
        note="Your friends and the people you do grids with see it."
        items={pictureItems}
        onClose={() => setPictureMenu(false)}
      />
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ paddingHorizontal: 20, gap: 8 }}>
      <Text variant="label">{title}</Text>
      <View style={styles.list}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20 },
  roundButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: 0, right: 0, width: 12, height: 12, borderRadius: 6, backgroundColor: colors.danger, borderWidth: 2, borderColor: colors.paper },
  card: { padding: 16, borderRadius: radius.lg, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, gap: 12 },
  pictureBadge: { position: 'absolute', right: -4, bottom: -4, width: 24, height: 24, borderRadius: 12, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  avatar: { width: 56, height: 56, borderRadius: 18, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  bioInput: { minHeight: 70, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.lineStrong, padding: 12, fontFamily: fonts.body, fontSize: 15, color: colors.ink, textAlignVertical: 'top' },
  list: { borderRadius: radius.lg, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingHorizontal: 14, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.line, marginTop: -1 },
  smallButton: { height: 40, paddingHorizontal: 14 },
});
