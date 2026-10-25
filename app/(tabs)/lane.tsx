import { useCallback, useState } from 'react';
import { ScrollView, View, Pressable, StyleSheet } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { listMoments, type Moment } from '@/db/repo';
import { monthKey, monthName } from '@/lib/ids';
import { Text } from '@/ui/Text';
import { colors, fonts } from '@/theme';

export default function LaneIndex() {
  const db = useSQLiteContext();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [moments, setMoments] = useState<Moment[]>([]);
  const [filter, setFilter] = useState<string | null>(null);

  useFocusEffect(useCallback(() => { listMoments(db).then(setMoments); }, [db]));

  const grids = Array.from(new Map(moments.map((m) => [m.gridTitle, m.gridColor])).entries());
  const shown = filter ? moments.filter((m) => m.gridTitle === filter) : moments;

  // Page numbers count from the oldest moment, so the newest has the highest page.
  const pageOf = new Map(moments.map((m, i) => [m.id, moments.length - i]));

  const sections: { key: string; name: string; year: string; items: Moment[] }[] = [];
  for (const m of shown) {
    const key = monthKey(m.happenedOn);
    let s = sections.find((x) => x.key === key);
    if (!s) { s = { key, name: monthName(m.happenedOn), year: m.happenedOn.slice(0, 4), items: [] }; sections.push(s); }
    s.items.push(m);
  }

  return (
    <ScrollView style={{ backgroundColor: colors.scrap }} contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: 40 }}>
      <View style={{ paddingHorizontal: 24, gap: 2 }}>
        <Text variant="label" style={{ color: colors.scrapInk }}>Memory Lane</Text>
        <Text variant="display">Index</Text>
        <Text variant="body" style={{ fontSize: 14, color: colors.scrapInk, paddingTop: 4 }}>
          {moments.length === 0 ? 'No pages yet. Finish a square and come back.' : `${moments.length} page${moments.length === 1 ? '' : 's'}`}
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
            {s.items.map((m) => (
              <Pressable key={m.id} onPress={() => router.push({ pathname: '/lane/[momentId]', params: { momentId: m.id } })} style={styles.entry}>
                <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: m.gridColor }} />
                <Text variant="bodyBold" numberOfLines={1} style={{ flexShrink: 1 }}>{m.title}</Text>
                <View style={styles.leader} />
                <Text variant="bodyBold" style={{ fontSize: 14, color: colors.scrapInk, fontVariant: ['tabular-nums'] }}>{pageOf.get(m.id)}</Text>
              </Pressable>
            ))}
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
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, paddingHorizontal: 14, borderRadius: 17, borderWidth: 1.5, borderColor: colors.scrapLine },
});
