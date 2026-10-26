import { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { makeGroup } from '@/groups/api';
import { useSync } from '@/sync/SyncProvider';
import { Text } from '@/ui/Text';
import { Button } from '@/ui/Button';
import { colors } from '@/theme';

/** Turns a grid into a group grid, then opens it to invite people. Needs a connection. */
export default function StartTogether() {
  const { userGridId, share } = useLocalSearchParams<{ userGridId: string; share?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const sync = useSync();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    makeGroup(userGridId, share === '1', sync.syncNow)
      .then((groupId) => { if (live) router.replace({ pathname: '/together/[groupId]', params: { groupId, invite: '1' } }); })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
    // Runs once for this grid.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userGridId]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.paper, padding: 24, paddingTop: insets.top + 80, gap: 16, alignItems: 'center' }}>
      {failed ? (
        <>
          <Text variant="title" style={{ textAlign: 'center' }}>Couldn't set it up</Text>
          <Text variant="body" style={{ color: colors.muted, textAlign: 'center' }}>
            Doing a grid together needs a connection. The grid is on your shelf as your own for now; choose Do this
            together from its menu when you're back online.
          </Text>
          <Button
            label="Open the grid" kind="secondary" style={{ alignSelf: 'stretch' }}
            onPress={() => router.replace({ pathname: '/grid/[id]', params: { id: userGridId } })}
          />
        </>
      ) : (
        <>
          <ActivityIndicator color={colors.muted} />
          <Text variant="body" style={{ color: colors.muted }}>Making it a grid to do together…</Text>
        </>
      )}
    </View>
  );
}
