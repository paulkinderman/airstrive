import { View, ScrollView, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import Svg, { Path } from 'react-native-svg';
import type { Moment, Page } from '@/db/repo';
import { goBack } from '@/lib/goBack';
import { PageLink } from '@/ui/PageLink';
import { MomentWords } from '@/groups/MomentWords';
import { shortDate } from '@/lib/ids';
import { Text } from '@/ui/Text';
import { colors, fonts } from '@/theme';
import type { Turn } from './PageTurner';

/** A moment's page in Memory Lane on a phone. */
export function MomentSheet({ moment: m, page, prev, next, turn }: { moment: Moment; page: number; prev: Page | null; next: Page | null; turn: Turn }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const cover = m.photos.find((p) => p.isCover) ?? m.photos[0];
  const others = m.photos.filter((p) => p !== cover);
  const pw = width - 80;

  return (
    <View style={{ flex: 1, backgroundColor: colors.scrap }}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => goBack(router, '/lane')} style={styles.headerButton}>
          <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={colors.scrapInk} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"><Path d="M15 5l-7 7 7 7" /></Svg>
          <Text variant="bodyBold" style={{ fontSize: 14, color: colors.scrapInk }}>Index</Text>
        </Pressable>
        <Text variant="label" style={{ color: colors.scrapInk }}>Page {page}</Text>
        <Pressable onPress={() => router.push({ pathname: '/moment/[squareId]', params: { squareId: m.squareStateId } })} style={styles.headerButton} accessibilityLabel="Edit this moment">
          <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={colors.scrapInk} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M4 20h4l10-10-4-4L4 16z" /><Path d="M13 7l4 4" />
          </Svg>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 8, paddingBottom: 24, gap: 16 }}>
        {cover ? (
          <View style={{ height: pw * 0.78 + 60, alignItems: 'center' }}>
            {others[0] && (
              <View style={[styles.polaroid, { width: pw * 0.92, height: pw * 0.7, top: 10, left: 0, transform: [{ rotate: '-4deg' }] }]}>
                <Image source={{ uri: others[0].uri }} style={{ flex: 1 }} contentFit="cover" />
              </View>
            )}
            <View style={[styles.polaroid, { width: pw * 0.96, height: pw * 0.74, top: others[0] ? 50 : 20, left: others[0] ? 28 : 8, transform: [{ rotate: others[0] ? '3deg' : '-1.5deg' }] }]}>
              <Image source={{ uri: cover.uri }} style={{ flex: 1 }} contentFit="cover" />
            </View>
            <View style={[styles.tape, { top: others[0] ? 38 : 8, left: pw / 2 - 20 }]} />
          </View>
        ) : null}

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: m.gridColor }} />
          <Text variant="label" style={{ fontSize: 12, letterSpacing: 1.5, color: colors.scrapInk }}>{m.gridTitle} · {shortDate(m.happenedOn)}</Text>
        </View>

        <Text variant="display" style={{ fontSize: cover ? 26 : 34, lineHeight: cover ? 30 : 38 }}>{m.title}</Text>
        {!cover && <View style={{ width: 48, height: 3, borderRadius: 2, backgroundColor: m.gridColor }} />}

        {m.body || m.entries.length > 0 ? (
          <MomentWords moment={m} style={!cover && styles.ruled} />
        ) : (
          <Text variant="hand" style={{ color: colors.faint }}>No words this time.</Text>
        )}

        {!!(m.place || m.weather || m.withPeople) && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {m.place ? <Tag label={m.place} /> : null}
            {m.weather ? <Tag label={m.weather} /> : null}
            {m.withPeople ? <Tag label={`With ${m.withPeople}`} /> : null}
          </View>
        )}

        {others.length > 1 && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingTop: 6 }}>
            {others.slice(1).map((p) => (
              <View key={p.id} style={[styles.polaroid, { position: 'relative', width: 120, height: 120 }]}>
                <Image source={{ uri: p.uri }} style={{ flex: 1 }} contentFit="cover" />
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <PageLink page={prev} dir="prev" onPress={() => turn(-1)} />
        <PageLink page={next} dir="next" onPress={() => turn(1)} />
      </View>
    </View>
  );
}

function Tag({ label }: { label: string }) {
  return (
    <View style={styles.tag}><Text variant="caption" style={{ color: colors.scrapInk, fontFamily: fonts.bodyBold }}>{label}</Text></View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingBottom: 4 },
  headerButton: { height: 44, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 6 },
  polaroid: { position: 'absolute', backgroundColor: '#fff', padding: 8, shadowColor: colors.ink, shadowOpacity: 0.18, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 6 },
  tape: { position: 'absolute', width: 70, height: 22, backgroundColor: 'rgba(245,182,28,0.55)', transform: [{ rotate: '3deg' }] },
  ruled: { lineHeight: 36 },
  tag: { height: 30, paddingHorizontal: 12, borderRadius: 15, borderWidth: 1.5, borderColor: colors.scrapLine, alignItems: 'center', justifyContent: 'center' },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 10 },
});
