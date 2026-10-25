import { useCallback, useState } from 'react';
import { ScrollView, View, Pressable, StyleSheet } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { listPages, type Page } from '@/db/repo';
import { useDataVersion } from '@/sync/events';
import { monthKey, monthName } from '@/lib/ids';
import { Text } from '@/ui/Text';
import { colors, fonts } from '@/theme';

export default function LaneIndex() {
  const db = useSQLiteContext();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [pages, setPages] = useState<Page[]>([]);
  const [filter, setFilter] = useState<string | null>(null);
  const version = useDataVersion();

  useFocusEffect(useCallback(() => { listPages(db).then(setPages); }, [db, version]));

  const gridOf = (p: Page) => (p.kind === 'moment' ? { title: p.moment.gridTitle, color: p.moment.gridColor } : { title: p.chapter.gridTitle, color: p.chapter.gridColor });
  const grids = Array.from(new Map(pages.map((p) => [gridOf(p).title, gridOf(p).color])).entries());
  const shown = filter ? pages.filter((p) => gridOf(p).title === filter) : pages;

  // Page numbers count from the oldest page, so the newest has the highest number.
  const pageOf = new Map(pages.map((p, i) => [p.key, pages.length - i]));

  const sections: { key: string; name: string; year: string; items: Page[] }[] = [];
  for (const p of shown) {
    const key = monthKey(p.date);
    let s = sections.find((x) => x.key === key);
    if (!s) { s = { key, name: monthName(p.date), year: p.date.slice(0, 4), items: [] }; sections.push(s); }
    s.items.push(p);
  }

  return (
    <ScrollView style={{ backgroundColor: colors.scrap }} contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: 40 }}>
      <View style={{ paddingHorizontal: 24, gap: 2 }}>
        <Text variant="label" style={{ color: colors.scrapInk }}>Memory Lane</Text>
        <Text variant="display">Index</Text>
        <Text variant="body" style={{ fontSize: 14, color: colors.scrapInk, paddingTop: 4 }}>
          {pages.length === 0 ? 'No pages yet. Finish a square and come back.' : `${pages.length} page${pages.length === 1 ? '' : 's'}`}
        </Text>
      </View>

      {grids.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 24, gap: 8, paddingTop: 16 }}>
          <FilterChip label="Everything" active={filter === null} onPress={() => setFilter(null)} />
          {grids.map(([title, color]) => (
            <FilterChip key={title} label={title} color={color} active={filter === title} onPress={() => setFilter(title)} />
          ))}
        </ScrollView>
      )}

      <View style={{ paddingHorizontal: 24, paddingTop: 20, gap: 22 }}>
        {sections.map((s) => (
          <View key={s.key} style={{ gap: 8 }}>
            <View style={styles.sectionHead}>
              <Text variant="title" style={{ fontSize: 22 }}>{s.name}</Text>
              <Text variant="caption" style={{ color: colors.scrapInk, fontFamily: fonts.bodyBold }}>{s.year}</Text>
            </View>
            {s.items.map((p) =>
              p.kind === 'moment' ? (
                <Pressable key={p.key} onPress={() => router.push({ pathname: '/lane/[momentId]', params: { momentId: p.moment.id } })} style={styles.entry}>
                  <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: p.moment.gridColor }} />
                  <Text variant="bodyBold" numberOfLines={1} style={{ flexShrink: 1 }}>{p.moment.title}</Text>
                  <View style={styles.leader} />
                  <Text variant="bodyBold" style={{ fontSize: 14, color: colors.scrapInk, fontVariant: ['tabular-nums'] }}>{pageOf.get(p.key)}</Text>
                </Pressable>
              ) : (
                <Pressable key={p.key} onPress={() => router.push({ pathname: '/lane/chapter/[userGridId]', params: { userGridId: p.chapter.userGridId } })} style={[styles.entry, styles.chapter]}>
                  <View style={{ width: 14, height: 14, borderRadius: 4, backgroundColor: p.chapter.gridColor }} />
                  <View style={{ flexShrink: 1 }}>
                    <Text variant="label" style={{ fontSize: 10, letterSpacing: 1.5, color: '#AEB5C0' }}>Chapter · grid complete</Text>
                    <Text variant="title" numberOfLines={1} style={{ fontSize: 18, color: '#fff' }}>{p.chapter.gridTitle}</Text>
                  </View>
                  <View style={[styles.leader, { borderBottomColor: '#4B5563' }]} />
                  <Text variant="bodyBold" style={{ fontSize: 14, color: '#AEB5C0', fontVariant: ['tabular-nums'] }}>{pageOf.get(p.key)}</Text>
                </Pressable>
              ),
            )}
          </View>
        ))}
      </View>
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
  entry: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  leader: { flex: 1, minWidth: 16, borderBottomWidth: 1.5, borderStyle: 'dotted', borderBottomColor: '#C9BDA8', transform: [{ translateY: 4 }] },
  chapter: { backgroundColor: colors.night, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, marginVertical: 4 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, paddingHorizontal: 14, borderRadius: 17, borderWidth: 1.5, borderColor: colors.scrapLine },
});
