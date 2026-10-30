import { useCallback, useState } from 'react';
import { ScrollView, View, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { listShelf, listRecentMoments, type Moment, type ShelfGrid } from '@/db/repo';
import { useAuth } from '@/auth/AuthProvider';
import { useDataVersion } from '@/sync/events';
import { monthName } from '@/lib/ids';
import { Text } from '@/ui/Text';
import { MiniGrid } from '@/ui/MiniGrid';
import { colors, radius } from '@/theme';
import { SIDEBAR } from './Sidebar';
import { ShelfCard } from './ShelfCard';
import { FromFriends } from './FromFriends';
import { Lately } from './Lately';

const RAIL = 340;
const PAD = 36;
const GAP = 16;
/** The Lately stack keeps this many moments. */
const STACK = 100;

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

/**
 * The home screen on a computer screen, beside the sidebar: the grids you're working on in
 * the middle, finished ones under them, and on the right what friends shared and your own
 * latest moments.
 */
export function WideHome() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { username } = useAuth();
  const version = useDataVersion();
  const [shelf, setShelf] = useState<ShelfGrid[] | null>(null);
  const [recent, setRecent] = useState<Moment[]>([]);

  useFocusEffect(useCallback(() => {
    let live = true;
    (async () => {
      const [s, r] = await Promise.all([listShelf(db), listRecentMoments(db, STACK)]);
      if (live) { setShelf(s); setRecent(r); }
    })();
    return () => { live = false; };
  }, [db, version]));

  const going = (shelf ?? []).filter((g) => !g.completedAt);
  const finished = (shelf ?? []).filter((g) => g.completedAt);
  const waiting = going.reduce((n, g) => n + g.revealed, 0);
  const day = new Date().toLocaleDateString(undefined, { weekday: 'long' });

  const main = width - SIDEBAR - RAIL - PAD * 2;
  const cols = main >= 3 * 330 + 2 * GAP ? 3 : main >= 2 * 300 + GAP ? 2 : 1;
  const cardWidth = Math.floor((main - (cols - 1) * GAP) / cols);

  return (
    <View style={{ flex: 1, flexDirection: 'row', backgroundColor: colors.paper }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: PAD, gap: 22 }}>
        <View style={{ gap: 6 }}>
          <Text variant="display" style={{ fontSize: 34, lineHeight: 38 }}>{greeting()}{username ? `, ${username}` : ''}</Text>
          <Text variant="body" style={{ color: colors.muted }}>
            {day} · {waiting} square{waiting === 1 ? '' : 's'} waiting{going.length > 1 ? ` across ${going.length} grids` : ''}
          </Text>
        </View>

        {shelf && going.length > 0 && <Text variant="label">In progress</Text>}
        {shelf && shelf.length === 0 && (
          <Pressable onPress={() => router.push('/atlas')} style={styles.empty}>
            <Text variant="title">Your shelf is empty</Text>
            <Text variant="body" style={{ fontSize: 14, color: colors.muted }}>
              Find a grid in the Atlas, or make your own about anything you like.
            </Text>
            <Text variant="bodyBold" style={{ fontSize: 14, color: colors.accentDeep }}>Open the Atlas</Text>
          </Pressable>
        )}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: GAP }}>
          {going.map((g, i) => <ShelfCard key={g.userGridId} grid={g} width={cardWidth} stagger={i * 900} />)}
        </View>

        {finished.map((g) => (
          <Pressable
            key={g.userGridId}
            onPress={() => router.push({ pathname: '/grid/[id]', params: { id: g.userGridId } })}
            style={({ pressed }) => [styles.finished, pressed && { opacity: 0.85 }]}
            accessibilityRole="button"
            accessibilityLabel={`Finished: ${g.title}`}
          >
            <MiniGrid states={g.states} cols={g.cols} color={g.color} cell={g.cols >= 10 ? 4 : 5} gap={1.5} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="bodyBold">Finished · {g.title}</Text>
              <Text variant="body" style={{ fontSize: 13, color: colors.muted }}>Completed in {monthName(g.completedAt!)}</Text>
            </View>
          </Pressable>
        ))}
      </ScrollView>

      <ScrollView style={styles.rail} contentContainerStyle={{ paddingVertical: 32, paddingHorizontal: 26, gap: 22 }}>
        <FromFriends onShelf={(shelf ?? []).map((g) => g.gridId)} />
        <View style={{ gap: 4 }}>
          <Text variant="label">Lately</Text>
          <Lately moments={recent} />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  rail: { width: RAIL, flexGrow: 0, backgroundColor: colors.scrap, borderLeftWidth: 1, borderLeftColor: colors.line },
  empty: { padding: 18, borderRadius: radius.lg, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.lineStrong, gap: 6, maxWidth: 520 },
  finished: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderRadius: radius.md, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.lineStrong },
});
