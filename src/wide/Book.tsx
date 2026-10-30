import { useCallback, useEffect, useState } from 'react';
import { View, Pressable, StyleSheet, ScrollView, useWindowDimensions } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { goBack } from '@/lib/goBack';
import { useSQLiteContext } from 'expo-sqlite';
import { Image } from 'expo-image';
import Svg, { Path } from 'react-native-svg';
import { listPages, type Chapter, type Moment, type Page } from '@/db/repo';
import { useDataVersion } from '@/sync/events';
import { chapterCaption } from '@/lib/printables';
import { shortDate } from '@/lib/ids';
import { Text } from '@/ui/Text';
import { MomentWords } from '@/groups/MomentWords';
import { colors, fonts } from '@/theme';

/**
 * Memory Lane on a computer screen: an open book, two pages at a time, oldest first like the
 * printed scrapbook. Arrow keys turn the spread; Escape goes back to the index.
 */
export function Book({ startKey }: { startKey: string }) {
  const db = useSQLiteContext();
  const router = useRouter();
  const version = useDataVersion();
  const { width, height } = useWindowDimensions();
  const [pages, setPages] = useState<Page[] | null>(null);
  const [left, setLeft] = useState(0);
  const [focused, setFocused] = useState(false);

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      listPages(db).then((all) => {
        const ordered = [...all].reverse();
        setPages(ordered);
        setLeft((cur) => {
          if (cur > 0 && cur < ordered.length) return cur;
          const i = Math.max(0, ordered.findIndex((p) => p.key === startKey));
          return i - (i % 2);
        });
      });
      return () => setFocused(false);
    }, [db, startKey, version]),
  );

  const count = pages?.length ?? 0;
  const turn = useCallback((dir: 1 | -1) => {
    setLeft((l) => {
      const next = l + dir * 2;
      return next < 0 || next >= count ? l : next;
    });
  }, [count]);

  useEffect(() => {
    if (!focused) return;
    const onKey = (e: KeyboardEvent) => {
      if (document.querySelector('.as-alert-backdrop')) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); turn(1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); turn(-1); }
      else if (e.key === 'Escape') goBack(router, '/lane');
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [focused, turn, router]);

  if (!pages) return <View style={{ flex: 1, backgroundColor: colors.scrap }} />;

  const pageW = Math.floor(Math.min((width - 200) / 2, (height - 150) / 1.32, 600));
  const pageH = Math.floor(pageW * 1.32);
  const spread = [pages[left] ?? null, pages[left + 1] ?? null];

  return (
    <View style={{ flex: 1, backgroundColor: colors.scrap }}>
      <View style={styles.top}>
        <Pressable onPress={() => goBack(router, '/lane')} style={styles.back}>
          <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={colors.scrapInk} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"><Path d="M15 5l-7 7 7 7" /></Svg>
          <Text variant="bodyBold" style={{ color: colors.scrapInk }}>Index</Text>
        </Pressable>
        <Text variant="label" style={{ color: colors.scrapInk }}>Memory Lane · {count} page{count === 1 ? '' : 's'}</Text>
        <View style={{ width: 90 }} />
      </View>

      <View style={styles.stage}>
        <Arrow dir="prev" disabled={left === 0} onPress={() => turn(-1)} />
        <View style={[styles.book, { width: pageW * 2 + 2, height: pageH }]}>
          {spread.map((p, i) => (
            <View key={i} style={[styles.page, { width: pageW, height: pageH }, i === 0 ? styles.leftPage : styles.rightPage]}>
              {p ? (p.kind === 'moment' ? <MomentPage moment={p.moment} width={pageW} /> : <ChapterPage chapter={p.chapter} width={pageW} />) : <EndPaper />}
              {p && <Text variant="caption" style={[styles.folio, i === 0 ? { left: 24 } : { right: 24 }]}>{left + i + 1}</Text>}
            </View>
          ))}
          <View style={[styles.spine, { left: pageW - 6, height: pageH }]} pointerEvents="none" />
        </View>
        <Arrow dir="next" disabled={left + 2 >= count} onPress={() => turn(1)} />
      </View>
      <Text variant="caption" style={{ textAlign: 'center', color: colors.scrapInk, paddingBottom: 16 }}>← → to turn the page · Esc for the index</Text>
    </View>
  );
}

function MomentPage({ moment: m, width }: { moment: Moment; width: number }) {
  const router = useRouter();
  const cover = m.photos.find((p) => p.isCover) ?? m.photos[0];
  const others = m.photos.filter((p) => p !== cover);
  const photoW = width - 96;
  return (
    <ScrollView contentContainerStyle={{ padding: 36, paddingBottom: 48, gap: 12 }} showsVerticalScrollIndicator={false}>
      <Pressable
        onPress={() => router.push({ pathname: '/moment/[squareId]', params: { squareId: m.squareStateId } })}
        style={styles.edit} accessibilityLabel="Edit this moment"
      >
        <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={colors.scrapInk} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M4 20h4l10-10-4-4L4 16z" /><Path d="M13 7l4 4" />
        </Svg>
      </Pressable>
      {cover ? (
        <View style={{ alignItems: 'center', paddingVertical: 10 }}>
          <View style={[styles.polaroid, { transform: [{ rotate: '-2deg' }] }]}>
            <Image source={{ uri: cover.uri }} style={{ width: photoW, height: photoW * 0.72 }} contentFit="cover" />
          </View>
          <View style={styles.tape} />
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: m.gridColor }} />
        <Text variant="label" style={{ fontSize: 12, letterSpacing: 1.5, color: colors.scrapInk }}>{m.gridTitle} · {shortDate(m.happenedOn)}</Text>
      </View>
      <Text variant="display" style={{ fontSize: cover ? 26 : 34, lineHeight: cover ? 30 : 38 }}>{m.title}</Text>
      {!cover && <View style={{ width: 48, height: 3, borderRadius: 2, backgroundColor: m.gridColor }} />}
      {m.body || m.entries.length > 0
        ? <MomentWords moment={m} style={!cover && { lineHeight: 36 }} />
        : <Text variant="hand" style={{ color: colors.faint }}>No words this time.</Text>}
      {(m.place || m.weather || m.withPeople) && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {[m.place, m.weather, m.withPeople && `With ${m.withPeople}`].filter(Boolean).map((t) => (
            <View key={t as string} style={styles.tag}><Text variant="caption" style={{ color: colors.scrapInk, fontFamily: fonts.bodyBold }}>{t}</Text></View>
          ))}
        </View>
      )}
      {others.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingTop: 6 }}>
          {others.map((p, i) => (
            <View key={p.id} style={[styles.polaroid, { padding: 6, transform: [{ rotate: `${i % 2 ? 2 : -2}deg` }] }]}>
              <Image source={{ uri: p.uri }} style={{ width: 96, height: 96 }} contentFit="cover" />
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function ChapterPage({ chapter: c, width }: { chapter: Chapter; width: number }) {
  const router = useRouter();
  const frame = width - 120;
  const gap = c.cols >= 10 ? 2 : 3;
  const cell = (frame - 16 - gap * (c.cols - 1)) / c.cols;
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/lane/chapter/[userGridId]', params: { userGridId: c.userGridId } })}
      style={{ flex: 1, backgroundColor: colors.night, alignItems: 'center', justifyContent: 'center', gap: 20, padding: 24 }}
    >
      <View style={{ width: frame, padding: 8, backgroundColor: '#fff', flexDirection: 'row', flexWrap: 'wrap', gap }}>
        {c.tiles.map((uri, i) =>
          uri ? <Image key={i} source={{ uri }} style={{ width: cell, height: cell }} contentFit="cover" />
            : <View key={i} style={{ width: cell, height: cell, backgroundColor: c.gridColor }} />,
        )}
      </View>
      <Text variant="label" style={{ color: c.gridColor, letterSpacing: 2.5 }}>Grid complete</Text>
      <Text variant="display" style={{ color: '#fff', textAlign: 'center' }}>{c.gridTitle}</Text>
      <Text variant="hand" style={{ color: '#D5DAE1', textAlign: 'center' }}>{chapterCaption(c.momentCount, c.firstOn, c.lastOn)}</Text>
    </Pressable>
  );
}

function EndPaper() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 }}>
      <Text variant="hand" style={{ color: colors.scrapInk, textAlign: 'center' }}>The next page is still out there.</Text>
    </View>
  );
}

function Arrow({ dir, disabled, onPress }: { dir: 'prev' | 'next'; disabled: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={[styles.arrow, disabled && { opacity: 0.25 }]} accessibilityLabel={dir === 'prev' ? 'Previous pages' : 'Next pages'}>
      <Svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke={colors.scrapInk} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
        <Path d={dir === 'prev' ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'} />
      </Svg>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 28, paddingTop: 16, paddingBottom: 8 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 44, width: 90 },
  stage: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 24 },
  book: {
    flexDirection: 'row', gap: 2,
    shadowColor: '#8A7B63', shadowOpacity: 0.35, shadowRadius: 40, shadowOffset: { width: 0, height: 18 },
  },
  page: { backgroundColor: '#FFFDF8', overflow: 'hidden' },
  leftPage: { borderTopLeftRadius: 10, borderBottomLeftRadius: 10 },
  rightPage: { borderTopRightRadius: 10, borderBottomRightRadius: 10 },
  spine: {
    position: 'absolute', top: 0, width: 14, backgroundColor: 'rgba(138,123,99,0.10)',
  },
  folio: { position: 'absolute', bottom: 14, color: colors.scrapInk },
  edit: { position: 'absolute', top: 10, right: 10, width: 40, height: 40, alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  polaroid: { backgroundColor: '#fff', padding: 10, shadowColor: colors.ink, shadowOpacity: 0.18, shadowRadius: 14, shadowOffset: { width: 0, height: 8 } },
  tape: { position: 'absolute', top: 0, width: 70, height: 22, backgroundColor: 'rgba(245,182,28,0.55)', transform: [{ rotate: '3deg' }] },
  tag: { height: 30, paddingHorizontal: 12, borderRadius: 15, borderWidth: 1.5, borderColor: colors.scrapLine, alignItems: 'center', justifyContent: 'center' },
  arrow: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.6)' },
});
