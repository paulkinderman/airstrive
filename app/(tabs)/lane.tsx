import { useCallback, useState } from 'react';
import { ScrollView, View, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { listPages, type Page } from '@/db/repo';
import { useDataVersion } from '@/sync/events';
import { monthKey, monthName } from '@/lib/ids';
import { Text } from '@/ui/Text';
import { useWideLayout } from '@/ui/wide';
import { SIDEBAR } from '@/wide/Sidebar';
import { WallChapter, WallPolaroid } from '@/lane/Wall';
import { colors, fonts, radius } from '@/theme';

const RAIL = 300;
const PAD = 36;
const GAP_X = 18;
const GAP_Y = 24;

const gridOf = (p: Page) => (p.kind === 'moment' ? { title: p.moment.gridTitle, color: p.moment.gridColor } : { title: p.chapter.gridTitle, color: p.chapter.gridColor });

/**
 * Memory Lane's index: every page as a polaroid on a wall, newest first and grouped by month.
 * A finished grid's chapter spans the row. On a computer screen the grid filter moves to a rail.
 */
export default function LaneIndex() {
  const db = useSQLiteContext();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const wide = useWideLayout();
  const { width } = useWindowDimensions();
  const [pages, setPages] = useState<Page[]>([]);
  const [filter, setFilter] = useState<string | null>(null);
  const version = useDataVersion();

  useFocusEffect(useCallback(() => { listPages(db).then(setPages); }, [db, version]));

  const grids = Array.from(new Map(pages.map((p) => [gridOf(p).title, gridOf(p).color])).entries());
  const shown = filter ? pages.filter((p) => gridOf(p).title === filter) : pages;

  const sections: { key: string; name: string; year: string; items: Page[] }[] = [];
  for (const p of shown) {
    const key = monthKey(p.date);
    let s = sections.find((x) => x.key === key);
    if (!s) { s = { key, name: monthName(p.date), year: p.date.slice(0, 4), items: [] }; sections.push(s); }
    s.items.push(p);
  }

  const oldest = pages[pages.length - 1];
  const since = oldest ? `${monthName(oldest.date)}${oldest.date.slice(0, 4) === String(new Date().getFullYear()) ? '' : ` ${oldest.date.slice(0, 4)}`}` : '';
  const summary = pages.length === 0 ? 'No pages yet. Finish a square and come back.' : `${pages.length} page${pages.length === 1 ? '' : 's'} since ${since}`;

  const main = wide ? width - SIDEBAR - RAIL - PAD * 2 : width - 48;
  const cols = wide ? Math.max(2, Math.min(5, Math.floor((main + GAP_X) / (190 + GAP_X)))) : 2;
  const gapX = wide ? GAP_X : 14;
  const cardW = Math.floor((main - gapX * (cols - 1)) / cols);

  const open = (p: Page) => {
    if (p.kind === 'moment') router.push({ pathname: '/lane/[momentId]', params: { momentId: p.moment.id } });
    else router.push({ pathname: '/lane/chapter/[userGridId]', params: { userGridId: p.chapter.userGridId } });
  };
  const firstMoment = [...pages].reverse().find((p) => p.kind === 'moment');

  const wall = (
    <View style={{ gap: 8 }}>
      {sections.map((s) => (
        <View key={s.key} style={{ gap: 14 }}>
          <View style={styles.sectionHead}>
            <Text variant="title" style={{ fontSize: 22, lineHeight: 26 }}>{s.name}</Text>
            <Text variant="caption" style={{ color: colors.scrapInk, fontFamily: fonts.bodyBold }}>{s.year}</Text>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: gapX, rowGap: GAP_Y, paddingTop: 6, paddingBottom: 18 }}>
            {s.items.map((p) =>
              p.kind === 'moment'
                ? <WallPolaroid key={p.key} moment={p.moment} width={cardW} onPress={() => open(p)} />
                : <WallChapter key={p.key} chapter={p.chapter} onPress={() => open(p)} />,
            )}
          </View>
        </View>
      ))}
    </View>
  );

  const header = (
    <View style={{ gap: 2 }}>
      <Text variant="label" style={{ color: colors.scrapInk }}>Memory Lane</Text>
      <Text variant="display">Your scrapbook</Text>
      <Text variant="body" style={{ fontSize: 14, color: colors.scrapInk, paddingTop: 4 }}>{summary}</Text>
    </View>
  );

  if (wide) {
    return (
      <View style={{ flex: 1, flexDirection: 'row', backgroundColor: colors.scrap }}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: PAD, gap: 18 }}>
          {header}
          {wall}
        </ScrollView>
        <ScrollView style={styles.rail} contentContainerStyle={{ paddingVertical: 32, paddingHorizontal: 24, gap: 12 }}>
          {grids.length > 1 && (
            <>
              <Text variant="label" style={{ color: colors.scrapInk }}>Show</Text>
              <View style={styles.railBox}>
                {[[null, pages.length, null] as const, ...grids.map(([t, c]) => [t, pages.filter((p) => gridOf(p).title === t).length, c] as const)].map(([t, n, c]) => (
                  <Pressable key={t ?? ''} onPress={() => setFilter(t)} style={[styles.railRow, filter === t && { backgroundColor: colors.scrap }]} accessibilityRole="button" accessibilityState={{ selected: filter === t }}>
                    {c && <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: c }} />}
                    <Text variant={filter === t ? 'bodyBold' : 'body'} numberOfLines={1} style={{ flex: 1, fontSize: 14 }}>{t ?? 'Everything'}</Text>
                    <Text variant="caption" style={{ color: colors.scrapInk, fontFamily: fonts.bodyBold, fontVariant: ['tabular-nums'] }}>{n}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          )}
          {firstMoment && (
            <>
              <Text variant="label" style={{ color: colors.scrapInk, paddingTop: 12 }}>The book</Text>
              <View style={[styles.railBox, { padding: 14, gap: 10 }]}>
                <Text variant="body" style={{ fontSize: 14, color: colors.muted }}>Read it front to back, two pages at a time.</Text>
                <Pressable onPress={() => open(firstMoment)} style={styles.bookButton} accessibilityRole="link">
                  <Text variant="bodyBold" style={{ fontSize: 13 }}>Open the book</Text>
                </Pressable>
              </View>
            </>
          )}
        </ScrollView>
      </View>
    );
  }

  return (
    <ScrollView style={{ backgroundColor: colors.scrap }} contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: 40 }}>
      <View style={{ paddingHorizontal: 24 }}>{header}</View>

      {grids.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 24, gap: 8, paddingTop: 16 }}>
          <FilterChip label="Everything" active={filter === null} onPress={() => setFilter(null)} />
          {grids.map(([title, color]) => (
            <FilterChip key={title} label={title} color={color} active={filter === title} onPress={() => setFilter(title)} />
          ))}
        </ScrollView>
      )}

      <View style={{ paddingHorizontal: 24, paddingTop: 20 }}>{wall}</View>
    </ScrollView>
  );
}

function FilterChip({ label, color, active, onPress }: { label: string; color?: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && { backgroundColor: colors.ink, borderColor: colors.ink }]}>
      {color && <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: color }} />}
      <Text variant="bodyBold" style={{ fontSize: 13, color: active ? '#fff' : colors.ink }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', borderBottomWidth: 1.5, borderBottomColor: colors.scrapLine, paddingBottom: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, paddingHorizontal: 14, borderRadius: 17, borderWidth: 1.5, borderColor: colors.scrapLine, backgroundColor: colors.card },
  rail: { width: RAIL, flexGrow: 0, backgroundColor: colors.paper, borderLeftWidth: 1, borderLeftColor: colors.scrapLine },
  railBox: { backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.scrapLine, padding: 6 },
  railRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, height: 38, borderRadius: 10 },
  bookButton: { alignSelf: 'flex-start', height: 34, paddingHorizontal: 14, borderRadius: 17, borderWidth: 1.5, borderColor: colors.scrapLine, justifyContent: 'center' },
});
