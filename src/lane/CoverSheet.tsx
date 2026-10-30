import { View, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { goBack } from '@/lib/goBack';
import { PageLink } from '@/ui/PageLink';
import { Text } from '@/ui/Text';
import { colors } from '@/theme';
import { CoverFace, coverTitle, type BookInfo, type BookItem, type CoverKind } from './Covers';
import type { Turn } from './PageTurner';

/** One of the book's covers or endpapers on a phone, as a page of its own between the others. */
export function CoverSheet({ kind, info, prev, next, turn }: { kind: CoverKind; info: BookInfo; prev: BookItem | null; next: BookItem | null; turn: Turn }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  // As big as fits between the header and the links, at the book's proportions.
  const w = Math.min(width - 56, (height - insets.top - insets.bottom - 150) / 1.32);
  const outside = kind === 'front' || kind === 'back';

  return (
    <View style={{ flex: 1, backgroundColor: colors.scrap }}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => goBack(router, '/lane')} style={styles.headerButton}>
          <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={colors.scrapInk} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"><Path d="M15 5l-7 7 7 7" /></Svg>
          <Text variant="bodyBold" style={{ fontSize: 14, color: colors.scrapInk }}>Index</Text>
        </Pressable>
        <Text variant="label" style={{ color: colors.scrapInk }}>{coverTitle[kind]}</Text>
        <View style={{ width: 70 }} />
      </View>

      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <View style={[styles.cover, { width: w, height: w * 1.32 }, outside ? (kind === 'front' ? styles.boundLeft : styles.boundRight) : { borderRadius: 6 }]}>
          <CoverFace kind={kind} info={info} width={w} spine={kind === 'back' ? 'right' : 'left'} />
        </View>
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        {prev ? <PageLink page={prev} dir="prev" onPress={() => turn(-1)} /> : <View />}
        {next ? <PageLink page={next} dir="next" onPress={() => turn(1)} /> : <View />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingBottom: 4 },
  headerButton: { height: 44, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 6 },
  cover: {
    overflow: 'hidden',
    shadowColor: '#5C4A2A', shadowOpacity: 0.28, shadowRadius: 20, shadowOffset: { width: 0, height: 12 }, elevation: 8,
  },
  boundLeft: { borderTopLeftRadius: 4, borderBottomLeftRadius: 4, borderTopRightRadius: 12, borderBottomRightRadius: 12, borderLeftWidth: 10, borderLeftColor: '#C4AD86' },
  boundRight: { borderTopRightRadius: 4, borderBottomRightRadius: 4, borderTopLeftRadius: 12, borderBottomLeftRadius: 12, borderRightWidth: 10, borderRightColor: '#C4AD86' },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 10 },
});
