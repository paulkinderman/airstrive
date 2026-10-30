import { useCallback, useState } from 'react';
import { ScrollView, View, Pressable, StyleSheet } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { listOpenSquares, listRecentMoments, listShelf, type Moment, type OpenSquare, type ShelfGrid } from '@/db/repo';
import { Text } from '@/ui/Text';
import { MiniGrid } from '@/ui/MiniGrid';
import { useAuth } from '@/auth/AuthProvider';
import { useAvatar } from '@/friends/avatars';
import { useSync } from '@/sync/SyncProvider';
import { useDataVersion } from '@/sync/events';
import { FromFriends } from '@/wide/FromFriends';
import { colors, radius } from '@/theme';
import { GridTile } from './GridTile';
import { LatelyStack } from './LatelyStack';

/** The Lately stack keeps this many moments. */
const STACK = 100;

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

/** Pairs for the two-column shelf; an odd last grid gets an empty partner so it keeps its width. */
function pairs<T>(list: T[]): [T, T | null][] {
  const out: [T, T | null][] = [];
  for (let i = 0; i < list.length; i += 2) out.push([list[i], list[i + 1] ?? null]);
  return out;
}

/**
 * The home screen on a phone: the logo and greeting on one line, your grids two to a row with
 * Next up turning on each, then your latest moments as a taped stack, then what friends shared.
 */
export function PhoneHome() {
  const db = useSQLiteContext();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [shelf, setShelf] = useState<ShelfGrid[]>([]);
  const [open, setOpen] = useState<Map<string, OpenSquare[]>>(new Map());
  const [recent, setRecent] = useState<Moment[]>([]);
  const { username, userId } = useAuth();
  const picture = useAvatar(userId);
  const sync = useSync();
  const version = useDataVersion();

  useFocusEffect(
    useCallback(() => {
      let live = true;
      (async () => {
        const [s, o, r] = await Promise.all([listShelf(db), listOpenSquares(db), listRecentMoments(db, STACK)]);
        if (live) { setShelf(s); setOpen(o); setRecent(r); }
      })();
      return () => { live = false; };
    }, [db, version]),
  );

  const waiting = shelf.reduce((n, g) => n + g.revealed, 0);
  const day = new Date().toLocaleDateString(undefined, { weekday: 'long' });

  return (
    <ScrollView contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: 32 }} style={{ backgroundColor: colors.paper }}>
      <View style={styles.header}>
        <View accessible accessibilityRole="image" accessibilityLabel="AirStrive">
          <MiniGrid states={['hidden', 'done', 'hidden', 'revealed', 'hidden', 'revealed', 'hidden', 'hidden', 'hidden']} cols={3} color={colors.accent} cell={9} gap={3} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="display" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={{ fontSize: 24, lineHeight: 28 }}>
            {greeting()}{username ? `, ${username}` : ''}
          </Text>
          <Text variant="body" style={{ fontSize: 14, lineHeight: 19, color: colors.muted }}>{day} · {waiting} square{waiting === 1 ? '' : 's'} waiting</Text>
        </View>
        <Pressable onPress={() => router.push('/profile')} style={styles.avatar} accessibilityLabel="Profile">
          {picture
            ? <Image source={picture} cachePolicy="disk" transition={150} style={styles.picture} />
            : <Text variant="title" style={{ fontSize: 17, color: '#fff' }}>{(username ?? '?').slice(0, 1).toUpperCase()}</Text>}
          {sync.failed > 0 && <View style={styles.badge} />}
        </Pressable>
      </View>

      <View style={styles.section}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <Text variant="label">Your grids</Text>
          <Pressable onPress={() => router.push('/make')}>
            <Text variant="bodyBold" style={{ fontSize: 13, color: colors.accentDeep }}>+ Create grid</Text>
          </Pressable>
        </View>
        {shelf.length === 0 && (
          <Pressable onPress={() => router.push('/atlas')} style={styles.empty}>
            <Text variant="title">Your shelf is empty</Text>
            <Text variant="body" style={{ fontSize: 14, color: colors.muted }}>
              Find a grid in the Atlas, or make your own about anything you like.
            </Text>
            <Text variant="bodyBold" style={{ fontSize: 14, color: colors.accentDeep }}>Open the Atlas</Text>
          </Pressable>
        )}
        {pairs(shelf).map(([a, b], row) => (
          <View key={a.userGridId} style={{ flexDirection: 'row', gap: 10 }}>
            <GridTile grid={a} open={open.get(a.userGridId) ?? []} stagger={row * 1800} />
            {b ? <GridTile grid={b} open={open.get(b.userGridId) ?? []} stagger={row * 1800 + 900} /> : <View style={{ flex: 1 }} />}
          </View>
        ))}
      </View>

      {recent.length > 0 && (
        <View style={styles.lately}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <Text variant="label" style={{ color: colors.scrapInk }}>Lately</Text>
            {recent.length > 1 && <Text variant="hand" style={{ fontSize: 19, lineHeight: 22, color: colors.scrapInk }}>swipe to flick</Text>}
          </View>
          <LatelyStack moments={recent} onOpen={(momentId) => router.push({ pathname: '/lane/[momentId]', params: { momentId } })} />
        </View>
      )}

      <View style={styles.section}>
        <FromFriends onShelf={shelf.map((g) => g.gridId)} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingBottom: 4 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  picture: { width: 40, height: 40, borderRadius: 20 },
  badge: { position: 'absolute', top: -1, right: -1, width: 12, height: 12, borderRadius: 6, backgroundColor: colors.danger, borderWidth: 2, borderColor: colors.paper },
  section: { paddingHorizontal: 20, paddingTop: 20, gap: 10 },
  lately: { marginHorizontal: 20, marginTop: 20, paddingTop: 14, paddingHorizontal: 16, borderRadius: radius.xl, backgroundColor: colors.scrap },
  empty: { padding: 18, borderRadius: radius.lg, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.lineStrong, gap: 6 },
});
