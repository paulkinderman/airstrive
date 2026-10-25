import { useCallback, useMemo, useState } from 'react';
import { ScrollView, View, TextInput, Pressable, StyleSheet, RefreshControl } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';
import { loadAtlas } from '@/atlas/catalog';
import { byTheme, featured, searchAtlas, type AtlasGrid } from '@/atlas/picks';
import { MiniGrid } from '@/ui/MiniGrid';
import { GridCard } from '@/ui/GridCard';
import { Text } from '@/ui/Text';
import { useAuth } from '@/auth/AuthProvider';
import { colors, fonts, radius } from '@/theme';
import type { SquareState } from '@/db/repo';

export default function Atlas() {
  const db = useSQLiteContext();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { userId } = useAuth();
  const [grids, setGrids] = useState<AtlasGrid[]>([]);
  const [offline, setOffline] = useState(false);
  const [q, setQ] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const r = await loadAtlas(db);
    setGrids(r.grids);
    setOffline(r.offline);
  }, [db]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const open = (g: AtlasGrid) => router.push({ pathname: '/atlas/[gridId]', params: { gridId: g.id } });
  const results = useMemo(() => (q.trim() ? searchAtlas(grids, q) : null), [grids, q]);
  const mine = grids.filter((g) => g.authorId && g.authorId === userId);
  const others = grids.filter((g) => !mine.includes(g));

  return (
    <ScrollView
      style={{ backgroundColor: colors.paper }}
      contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: 32, gap: 20 }}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
    >
      <View style={{ paddingHorizontal: 20, gap: 4 }}>
        <Text variant="display">Atlas</Text>
        <Text variant="bodyBold" style={{ fontSize: 14, color: colors.muted }}>Grids for anything you might want to try</Text>
      </View>

      <View style={{ paddingHorizontal: 20, flexDirection: 'row', gap: 10, marginTop: -6 }}>
        <View style={styles.search}>
          <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={colors.faint} strokeWidth={2.4} strokeLinecap="round"><Circle cx={11} cy={11} r={7} /><Path d="M20 20l-4-4" /></Svg>
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Chess, baking, hiking, kids…"
            placeholderTextColor={colors.faint}
            returnKeyType="search"
            autoCorrect={false}
            style={styles.searchInput}
            accessibilityLabel="Search the Atlas"
          />
        </View>
        <Pressable onPress={() => router.push('/make')} style={styles.make} accessibilityLabel="Make your own grid">
          <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={colors.ink} strokeWidth={2.6} strokeLinecap="round"><Path d="M12 5v14M5 12h14" /></Svg>
        </Pressable>
      </View>

      {offline && (
        <Text variant="caption" style={{ paddingHorizontal: 20, marginTop: -8, color: colors.muted }}>
          Offline. Showing what the Atlas had last time you were connected.
        </Text>
      )}

      {results ? (
        <View style={{ paddingHorizontal: 20, gap: 10 }}>
          <Text variant="label">{results.length ? `Matches for “${q.trim()}”` : `Nothing for “${q.trim()}” yet`}</Text>
          {results.map((g) => <ListRow key={g.id} grid={g} onPress={() => open(g)} />)}
          {results.length === 0 && (
            <Pressable onPress={() => router.push({ pathname: '/make', params: { title: q.trim() } })} style={styles.makeCard}>
              <Text variant="title">Make “{q.trim()}”</Text>
              <Text variant="body" style={{ color: colors.muted, fontSize: 14 }}>Write a few squares and we'll suggest the rest.</Text>
            </Pressable>
          )}
        </View>
      ) : (
        <>
          {featured(others).length > 0 && (
            <View style={{ gap: 10 }}>
              <Text variant="label" style={{ paddingHorizontal: 20 }}>This season</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 12 }}>
                {featured(others).map((g) => <Featured key={g.id} grid={g} onPress={() => open(g)} />)}
              </ScrollView>
            </View>
          )}

          {mine.length > 0 && <Row title="Made by you" grids={mine} open={open} />}
          {byTheme(others).map((s) => <Row key={s.theme} title={s.theme} grids={s.grids} open={open} />)}

          <Pressable onPress={() => router.push('/make')} style={[styles.makeCard, { marginHorizontal: 20 }]}>
            <Text variant="title">Make your own</Text>
            <Text variant="body" style={{ color: colors.muted, fontSize: 14 }}>
              Any subject, four sizes. Write the squares you care about and we'll suggest the rest.
            </Text>
          </Pressable>
        </>
      )}
    </ScrollView>
  );
}

function Row({ title, grids, open }: { title: string; grids: AtlasGrid[]; open: (g: AtlasGrid) => void }) {
  return (
    <View style={{ gap: 10 }}>
      <Text variant="label" style={{ paddingHorizontal: 20 }}>{title}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 10 }}>
        {grids.map((g) => <GridCard key={g.id} grid={g} onPress={() => open(g)} />)}
      </ScrollView>
    </View>
  );
}

/** A deterministic little shape per grid for the featured cards, like the design's. */
function shape(id: string): SquareState[] {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return Array.from({ length: 18 }, () => {
    h = (h * 9301 + 49297) % 233280;
    return h / 233280 > 0.45 ? 'done' : 'revealed';
  });
}

function Featured({ grid, onPress }: { grid: AtlasGrid; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.featured, { backgroundColor: grid.color }]} accessibilityRole="button" accessibilityLabel={grid.title}>
      <MiniGrid states={shape(grid.id)} cols={6} color="#FFFFFF" cell={9} gap={3} />
      <View style={{ gap: 3 }}>
        <Text variant="title" style={{ color: '#fff', fontSize: 24, lineHeight: 27 }}>{grid.title}</Text>
        <Text variant="bodyBold" numberOfLines={2} style={{ color: '#fff', opacity: 0.88, fontSize: 13 }}>
          {grid.cols * grid.rows} squares · {grid.starters.slice(0, 2).join(', ').toLowerCase() || grid.theme}
        </Text>
      </View>
    </Pressable>
  );
}

function ListRow({ grid, onPress }: { grid: AtlasGrid; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.listRow}>
      <View style={{ width: 14, height: 14, borderRadius: 4, backgroundColor: grid.color }} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="title" style={{ fontSize: 18 }}>{grid.title}</Text>
        <Text variant="body" numberOfLines={1} style={{ fontSize: 13, color: colors.muted }}>
          {grid.theme} · by {grid.isOfficial ? 'AirStrive' : grid.madeBy}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  search: { flex: 1, height: 44, borderRadius: radius.md, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12 },
  searchInput: { flex: 1, fontFamily: fonts.bodyBold, fontSize: 15, color: colors.ink, paddingVertical: 0 },
  make: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  featured: { width: 250, minHeight: 160, borderRadius: 20, padding: 16, justifyContent: 'space-between', gap: 16 },
  makeCard: { padding: 16, borderRadius: radius.lg, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.lineStrong, gap: 4 },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radius.lg, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line },
});
