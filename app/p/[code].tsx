import { useState } from 'react';
import { View, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { goBack } from '@/lib/goBack';
import { cleanCode } from '@/friends/links';
import { InviteGate, useInvitePreview } from '@/friends/InviteGate';
import { acceptPeekLink } from '@/friends/invites';
import { Text } from '@/ui/Text';
import { Button } from '@/ui/Button';
import { MiniGrid } from '@/ui/MiniGrid';
import { colors, radius } from '@/theme';

/** Where a "See my grid" link lands: someone's grid, read-only, and a way to be friends. */
export default function PeekLink() {
  const params = useLocalSearchParams<{ code: string }>();
  const code = cleanCode(params.code);
  return <InviteGate invite={code ? { kind: 'p', code } : null}><Peek code={code} /></InviteGate>;
}

function Peek({ code }: { code: string | null }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [version, setVersion] = useState(0);
  const preview = useInvitePreview(code ? { kind: 'p', code } : null, version);
  const [busy, setBusy] = useState(false);

  const page = { flexGrow: 1, backgroundColor: colors.paper, paddingHorizontal: 24, paddingTop: insets.top + 48, paddingBottom: insets.bottom + 20, gap: 12 } as const;
  const close = () => goBack(router, '/');

  if (preview === undefined) return <View style={page}><ActivityIndicator color={colors.muted} /></View>;

  if (preview === 'error' || preview === null || preview.kind !== 'p') {
    return (
      <View style={page}>
        <Text variant="display">This link doesn't work</Text>
        <Text variant="body" style={{ color: colors.muted }}>
          {preview === 'error' ? "Couldn't reach AirStrive. Check your connection and try again." : 'Whoever shared it may have turned it off or made the grid private.'}
        </Text>
        <View style={{ flex: 1 }} />
        <Button label="Close" kind="quiet" onPress={close} />
      </View>
    );
  }

  const befriend = async () => {
    if (!code) return;
    setBusy(true);
    try {
      if (await acceptPeekLink(code)) setVersion((v) => v + 1);
      else Alert.alert("This link doesn't work", 'Whoever shared it may have turned it off.');
    } catch {
      Alert.alert("Couldn't reach AirStrive", 'Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  const { grid, squares, owner, relation } = preview;
  const done = squares.filter((s) => s.title);
  const openFull = () => {
    if (preview.userGridId) router.replace({ pathname: '/people/grid/[userGridId]', params: { userGridId: preview.userGridId } });
  };

  return (
    <ScrollView contentContainerStyle={page}>
      <Text variant="label">{relation === 'self' ? 'Your grid' : `${owner}'s grid`}</Text>
      <Text variant="display">{grid.title}</Text>
      <View style={{ alignSelf: 'center', padding: 16, borderRadius: radius.lg, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line }}>
        <MiniGrid states={squares.map((s) => s.state)} cols={grid.cols} color={grid.color} cell={grid.cols >= 10 ? 20 : 26} gap={4} />
      </View>
      <Text variant="body" style={{ color: colors.muted }}>
        {done.length === 0 ? 'Nothing filled in yet.' : `${done.length} ${done.length === 1 ? 'moment' : 'moments'} so far:`}
      </Text>
      {done.map((s) => (
        <View key={s.idx} style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
          <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: grid.color }} />
          <Text variant="bodyBold" style={{ flex: 1 }}>{s.title}</Text>
        </View>
      ))}
      <View style={{ flex: 1, minHeight: 16 }} />
      {relation === 'friends' || relation === 'self' ? (
        <Button label={relation === 'self' ? 'Done' : `See it on ${owner}'s profile`} onPress={relation === 'self' ? close : openFull} />
      ) : (
        <>
          <Text variant="caption" style={{ color: colors.muted }}>
            Friends see the words and photos too, on every grid {owner} shares with friends.
          </Text>
          <Button label={busy ? 'Adding…' : `Be friends with ${owner}`} onPress={befriend} disabled={busy} />
        </>
      )}
      <Button label="Close" kind="quiet" onPress={close} />
    </ScrollView>
  );
}
