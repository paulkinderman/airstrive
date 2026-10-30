import { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { goBack } from '@/lib/goBack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { acceptCode, previewCode, type Person } from '@/friends/api';
import { codeFrom } from '@/friends/links';
import { savePendingCode } from '@/friends/pendingCode';
import { Initial } from '@/friends/bits';
import { useAuth } from '@/auth/AuthProvider';
import { Text } from '@/ui/Text';
import { Button } from '@/ui/Button';
import { colors } from '@/theme';

/** Where a friend link or a scanned QR code lands: "Ana wants to be friends". */
export default function FriendLink() {
  const params = useLocalSearchParams<{ code: string }>();
  const code = codeFrom(params.code ?? '');
  const { status } = useAuth();

  if (status !== 'ready') {
    if (status === 'loading' || status === 'settingUp') return <View style={{ flex: 1, backgroundColor: colors.paper }} />;
    // Signed out or still setting up the account: come back to this once the shelf is ready.
    if (code) savePendingCode(code);
    return <Redirect href="/" />;
  }
  return <Invite code={code} />;
}

function Invite({ code }: { code: string | null }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [person, setPerson] = useState<Person | null | undefined>(undefined);
  const [state, setState] = useState<'asking' | 'accepting' | 'friends' | 'error'>('asking');

  useEffect(() => {
    if (!code) { setPerson(null); return; }
    previewCode(code).then(setPerson).catch(() => setState('error'));
  }, [code]);

  const close = () => goBack(router, '/profile');

  const accept = async () => {
    if (!code) return;
    setState('accepting');
    try {
      setState((await acceptCode(code)) ? 'friends' : 'error');
    } catch {
      setState('error');
    }
  };

  const page = { flex: 1, backgroundColor: colors.paper, paddingHorizontal: 24, paddingTop: insets.top + 48, paddingBottom: insets.bottom + 20, gap: 12 } as const;

  if (person === undefined && state !== 'error') return <View style={page}><ActivityIndicator color={colors.muted} /></View>;

  if (state === 'error' || !person) {
    return (
      <View style={page}>
        <Text variant="display">This link doesn't work</Text>
        <Text variant="body" style={{ color: colors.muted }}>
          {state === 'error' ? "Couldn't reach AirStrive. Check your connection and try again." : 'Friend links work once and for 7 days. Ask for a new one, or find them by username.'}
        </Text>
        <View style={{ flex: 1 }} />
        <Button label="Find them by username" onPress={() => router.replace('/friends/add')} />
        <Button label="Close" kind="quiet" onPress={close} />
      </View>
    );
  }

  if (state === 'friends' || person.relation === 'friends') {
    return (
      <View style={page}>
        <Initial name={person.username} size={64} />
        <Text variant="display">You and {person.username} are friends</Text>
        <Text variant="body" style={{ color: colors.muted }}>You'll each see the grids and moments the other shares with friends.</Text>
        <View style={{ flex: 1 }} />
        <Button label={`See ${person.username}'s profile`} onPress={() => router.replace({ pathname: '/people/[userId]', params: { userId: person.id } })} />
        <Button label="Done" kind="quiet" onPress={close} />
      </View>
    );
  }

  return (
    <View style={page}>
      <Initial name={person.username} size={64} />
      <Text variant="display">{person.username} wants to be friends</Text>
      <Text variant="body" style={{ color: colors.muted }}>
        Friends see the grids and moments each of you shares with friends. Nothing private is shared, and either of you can remove the other at any time.
      </Text>
      <View style={{ flex: 1 }} />
      <Button label={state === 'accepting' ? 'Accepting…' : 'Accept'} onPress={accept} disabled={state === 'accepting'} />
      <Button label="Not now" kind="quiet" onPress={close} />
    </View>
  );
}
