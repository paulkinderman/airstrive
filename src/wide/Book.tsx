import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { View, Pressable, StyleSheet, ScrollView, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
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

const TURN_MS = 700;

/**
 * Memory Lane on a computer screen: an open book, two pages at a time, oldest first like the
 * printed scrapbook. Arrow keys, the arrows beside the book or dragging a page across turn it
 * over the spine; Escape goes back to the index.
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
  // The leaf being turned: 1 lifts the right page over to the left, -1 the left page back. `drag` follows a pointer.
  const [turning, setTurning] = useState<{ dir: 1 | -1; drag: boolean } | null>(null);
  const p = useSharedValue(0);
  const busy = useRef(false);

  const land = useCallback((dir: 1 | -1, done: boolean) => {
    if (done) setLeft((l) => l + dir * 2);
    setTurning(null);
    busy.current = false;
  }, []);

  const settle = useCallback((dir: 1 | -1, done: boolean, from: number) => {
    p.value = withTiming(done ? 1 : 0, { duration: TURN_MS * (done ? 1 - from : from) + 120, easing: from === 0 ? Easing.inOut(Easing.cubic) : Easing.out(Easing.cubic) }, (ok) => {
      if (ok) scheduleOnRN(land, dir, done);
    });
  }, [land, p]);

  const turn = useCallback((dir: 1 | -1, drag = false) => {
    if (busy.current || (dir === 1 ? left + 2 >= count : left === 0)) return false;
    busy.current = true;
    p.value = 0;
    setTurning({ dir, drag });
    return true;
  }, [left, count, p]);

  // A turn from a key or an arrow plays as soon as the leaf is up.
  useEffect(() => {
    if (turning && !turning.drag) settle(turning.dir, true, 0);
  }, [turning, settle]);

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

  const face = (i: number, side: 0 | 1) => {
    const pg = pages[i] ?? null;
    return (
      <View style={[styles.page, { width: pageW, height: pageH }, side === 0 ? styles.leftPage : styles.rightPage]}>
        {pg ? (pg.kind === 'moment' ? <MomentPage moment={pg.moment} width={pageW} /> : <ChapterPage chapter={pg.chapter} width={pageW} />) : <EndPaper />}
        {pg && <Text variant="caption" style={[styles.folio, side === 0 ? { left: 24 } : { right: 24 }]}>{i + 1}</Text>}
      </View>
    );
  };
  // What lies on the book under the turning leaf.
  const under = turning?.dir === 1 ? [left, left + 3] : turning?.dir === -1 ? [left - 2, left + 1] : [left, left + 1];

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
        <BookDrag pageW={pageW} p={p} turn={turn} settle={settle}>
          <View style={[styles.book, { width: pageW * 2 + 2, height: pageH }]}>
            {face(under[0], 0)}
            {face(under[1], 1)}
            <Shadow p={p} onLeft={turning?.dir !== -1} width={pageW} height={pageH} on={!!turning} />
            {turning && (
              <Leaf key={`${left}:${turning.dir}`} dir={turning.dir} p={p} width={pageW} height={pageH}
                front={face(turning.dir === 1 ? left + 1 : left, turning.dir === 1 ? 1 : 0)}
                back={face(turning.dir === 1 ? left + 2 : left - 1, turning.dir === 1 ? 0 : 1)} />
            )}
            <View style={[styles.spine, { left: pageW - 6, height: pageH }]} pointerEvents="none" />
          </View>
        </BookDrag>
        <Arrow dir="next" disabled={left + 2 >= count} onPress={() => turn(1)} />
      </View>
      <Text variant="caption" style={{ textAlign: 'center', color: colors.scrapInk, paddingBottom: 16 }}>← → or drag a page to turn it · Esc for the index</Text>
    </View>
  );
}

/** Dragging across the book turns a page: leftward the right-hand one, rightward the left-hand one. */
function BookDrag({ pageW, p, turn, settle, children }: {
  pageW: number; p: SharedValue<number>; children: ReactNode;
  turn: (dir: 1 | -1, drag: boolean) => boolean; settle: (dir: 1 | -1, done: boolean, from: number) => void;
}) {
  const dir = useSharedValue(0);
  const start = (d: 1 | -1) => { dir.value = turn(d, true) ? d : 0; };
  const pan = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .onStart((e) => { dir.value = 0; scheduleOnRN(start, e.translationX < 0 ? 1 : -1); })
    .onUpdate((e) => {
      if (dir.value === 0) return;
      p.value = Math.max(0, Math.min(1, (-e.translationX * dir.value) / (pageW * 1.8)));
    })
    .onEnd((e) => {
      if (dir.value === 0) return;
      const d = dir.value as 1 | -1;
      const done = p.value > 0.3 || -e.velocityX * d > 600;
      scheduleOnRN(settle, d, done, p.value);
      dir.value = 0;
    });
  return <GestureDetector gesture={pan}>{children}</GestureDetector>;
}

/**
 * The page being turned, hinged on the spine. Its front is the page it lifts off; past
 * halfway you see its back, the page that lands on the other side.
 */
function Leaf({ dir, p, width, height, front, back }: { dir: 1 | -1; p: SharedValue<number>; width: number; height: number; front: ReactNode; back: ReactNode }) {
  const leaf = useAnimatedStyle(() => ({
    transform: [{ perspective: 2600 }, { rotateY: `${-dir * p.value * 180}deg` }],
  }));
  const frontStyle = useAnimatedStyle(() => ({ opacity: p.value < 0.5 ? 1 : 0 }));
  const backStyle = useAnimatedStyle(() => ({ opacity: p.value < 0.5 ? 0 : 1 }));
  // Darkest when the page stands up on its edge, as it leaves the light.
  const shade = useAnimatedStyle(() => ({ opacity: 0.35 * Math.sin(p.value * Math.PI) }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: 'absolute', top: 0, width, height, left: dir === 1 ? width + 2 : 0, transformOrigin: dir === 1 ? 'left center' : 'right center' }, leaf]}
    >
      <Animated.View style={[StyleSheet.absoluteFill, frontStyle]}>{front}</Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ scaleX: -1 }] }, backStyle]}>{back}</Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, styles.leafShade, shade]} />
    </Animated.View>
  );
}

/** The shadow the turning leaf throws on the page it's about to cover. */
function Shadow({ p, onLeft, width, height, on }: { p: SharedValue<number>; onLeft: boolean; width: number; height: number; on: boolean }) {
  const style = useAnimatedStyle(() => ({ opacity: on ? 0.14 * Math.sin(p.value * Math.PI) : 0 }));
  return <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: 0, height, width, left: onLeft ? 0 : width + 2, backgroundColor: '#2B2216' }, style]} />;
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
      {!!(m.place || m.weather || m.withPeople) && (
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
  leafShade: { backgroundColor: '#2B2216' },
  edit: { position: 'absolute', top: 10, right: 10, width: 40, height: 40, alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  polaroid: { backgroundColor: '#fff', padding: 10, shadowColor: colors.ink, shadowOpacity: 0.18, shadowRadius: 14, shadowOffset: { width: 0, height: 8 } },
  tape: { position: 'absolute', top: 0, width: 70, height: 22, backgroundColor: 'rgba(245,182,28,0.55)', transform: [{ rotate: '3deg' }] },
  tag: { height: 30, paddingHorizontal: 12, borderRadius: 15, borderWidth: 1.5, borderColor: colors.scrapLine, alignItems: 'center', justifyContent: 'center' },
  arrow: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.6)' },
});
