import { useState } from 'react';
import { View, ActivityIndicator, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { goBack } from '@/lib/goBack';
import { cleanCode } from '@/friends/links';
import { InviteGate, useInvitePreview } from '@/friends/InviteGate';
import { joinGroupLink } from '@/friends/invites';
import { useSync } from '@/sync/SyncProvider';
import { Text } from '@/ui/Text';
import { Button } from '@/ui/Button';
import { colors, radius } from '@/theme';

/** Where a "Join my grid" link lands: "Ana invited you to do Fall together". */
export default function GroupLink() {
  const params = useLocalSearchParams<{ code: string }>();
  const code = cleanCode(params.code);
  return <InviteGate invite={code ? { kind: 'g', code } : null}><Join code={code} /></InviteGate>;
}

function Join({ code }: { code: string | null }) {
  const router = useRouter();
  const db = useSQLiteContext();
  const sync = useSync();
  const insets = useSafeAreaInsets();
  const preview = useInvitePreview(code ? { kind: 'g', code } : null);
  const [busy, setBusy] = useState(false);

  const page = { flex: 1, backgroundColor: colors.paper, paddingHorizontal: 24, paddingTop: insets.top + 48, paddingBottom: insets.bottom + 20, gap: 12 } as const;
  const close = () => goBack(router, '/');

  if (preview === undefined) return <View style={page}><ActivityIndicator color={colors.muted} /></View>;

  if (preview === 'error' || preview === null || preview.kind !== 'g') {
    return (
      <View style={page}>
        <Text variant="display">This link doesn't work</Text>
        <Text variant="body" style={{ color: colors.muted }}>
          {preview === 'error' ? "Couldn't reach AirStrive. Check your connection and try again." : 'Whoever shared it may have turned it off. Ask them for a new one.'}
        </Text>
        <View style={{ flex: 1 }} />
        <Button label="Close" kind="quiet" onPress={close} />
      </View>
    );
  }

  /** Joins (or, already in, just opens) and waits for the grid to reach the phone. */
  const open = async () => {
    if (!code) return;
    setBusy(true);
    try {
      const groupId = await joinGroupLink(code);
      if (!groupId) {
        Alert.alert("This link doesn't work", 'Whoever shared it may have turned it off. Ask them for a new one.');
        return;
      }
      await sync.syncNow();
      const here = await db.getFirstAsync('SELECT 1 AS x FROM user_grids WHERE id = ? AND deleted_at IS NULL', groupId);
      if (here) router.replace({ pathname: '/grid/[id]', params: { id: groupId } });
      else {
        Alert.alert("You're in", 'The grid will be on your shelf once it has finished downloading.');
        router.replace('/');
      }
    } catch {
      Alert.alert("Couldn't reach AirStrive", 'Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  const { grid, members } = preview;
  const others = members.filter((m) => m !== preview.from);
  const who = others.length === 0 ? preview.from
    : others.length === 1 ? `${preview.from} and ${others[0]}`
    : `${preview.from} and ${others.length} others`;

  return (
    <View style={page}>
      <View style={{ width: 64, height: 64, borderRadius: radius.lg, backgroundColor: grid.color }} />
      <Text variant="display">
        {preview.member ? `You're doing ${grid.title} together` : `${preview.from} invited you to do ${grid.title} together`}
      </Text>
      <Text variant="body" style={{ color: colors.muted }}>
        {preview.member
          ? `With ${who}.`
          : `${who} ${members.length > 1 ? 'are' : 'is'} filling it in. Anyone in the group can do a square, and each of you adds your own words and photos. Joining also makes you friends with ${preview.from}.`}
      </Text>
      {grid.description ? <Text variant="body">{grid.description}</Text> : null}
      <View style={{ flex: 1 }} />
      <Button label={busy ? 'Opening…' : preview.member ? 'Open the grid' : 'Join'} onPress={open} disabled={busy} />
      <Button label="Not now" kind="quiet" onPress={close} />
    </View>
  );
}
