import { useCallback, useState, type ReactNode } from 'react';
import { View, StyleSheet } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Image } from 'expo-image';
import { listOpenSquares, listShelf, type Moment, type Page } from '@/db/repo';
import { useAuth } from '@/auth/AuthProvider';
import { useDataVersion } from '@/sync/events';
import { monthName, shortDate } from '@/lib/ids';
import { Text } from '@/ui/Text';
import { SquareEmoji, fillLook } from '@/ui/SquareLook';
import { colors, fonts } from '@/theme';

/** The covers and endpapers around Memory Lane's pages, in the order you turn through them. */
export type CoverKind = 'front' | 'insideFront' | 'blank' | 'insideBack' | 'back';
export type BookItem = Page | { kind: CoverKind; key: string };

export const isCover = (item: BookItem): item is { kind: CoverKind; key: string } =>
  item.kind !== 'moment' && item.kind !== 'chapter';

/**
 * The whole book in reading order: front cover, inside cover, the pages oldest first, the
 * inside back cover and the back cover. `spreads` adds a blank leaf after an odd page count, so
 * the inside back cover faces the last page and the back cover lands on the left like a real book's.
 */
export function bookItems(pagesOldestFirst: Page[], spreads: boolean): BookItem[] {
  const blank = spreads && pagesOldestFirst.length % 2 === 1 ? [{ kind: 'blank' as const, key: 'cover:blank' }] : [];
  return [
    { kind: 'front', key: 'cover:front' },
    { kind: 'insideFront', key: 'cover:insideFront' },
    ...pagesOldestFirst,
    ...blank,
    { kind: 'insideBack', key: 'cover:insideBack' },
    { kind: 'back', key: 'cover:back' },
  ];
}

export const coverTitle: Record<CoverKind, string> = {
  front: 'Cover', insideFront: 'Inside cover', blank: 'Inside back cover', insideBack: 'Inside back cover', back: 'Back cover',
};

export interface BookInfo {
  name: string | null;
  newest: Moment | null;
  first: Moment | null;
  since: string | null;
  count: number;
  grids: { title: string; color: string; count: number }[];
  next: { prompt: string; gridTitle: string; idx: number } | null;
}

/** What the covers say, from the pages (newest first) and the shelf. */
export function useBookInfo(pages: Page[] | null): BookInfo {
  const db = useSQLiteContext();
  const { username } = useAuth();
  const version = useDataVersion();
  const [next, setNext] = useState<BookInfo['next']>(null);

  useFocusEffect(useCallback(() => {
    let live = true;
    (async () => {
      const [shelf, open] = await Promise.all([listShelf(db), listOpenSquares(db)]);
      const g = shelf.find((s) => !s.completedAt && open.get(s.userGridId)?.length);
      const sq = g && open.get(g.userGridId)?.[0];
      if (live) setNext(g && sq ? { prompt: sq.prompt, gridTitle: g.title, idx: sq.idx } : null);
    })();
    return () => { live = false; };
  }, [db, version]));

  const list = pages ?? [];
  const moments = list.filter((p): p is Extract<Page, { kind: 'moment' }> => p.kind === 'moment').map((p) => p.moment);
  const counts = new Map<string, { title: string; color: string; count: number }>();
  for (const p of list) {
    const g = p.kind === 'moment' ? { title: p.moment.gridTitle, color: p.moment.gridColor } : { title: p.chapter.gridTitle, color: p.chapter.gridColor };
    const c = counts.get(g.title) ?? { ...g, count: 0 };
    c.count += 1;
    counts.set(g.title, c);
  }
  const oldest = list[list.length - 1];
  return {
    name: username,
    newest: moments[0] ?? null,
    first: moments[moments.length - 1] ?? null,
    since: oldest ? `${monthName(oldest.date)} ${oldest.date.slice(0, 4)}` : null,
    count: list.length,
    grids: [...counts.values()].sort((a, b) => b.count - a.count),
    next,
  };
}

const KRAFT = '#D8C3A0';
const KRAFT_INK = '#3A2E1E';
const KRAFT_MUTED = '#6E5A3C';
const ENDPAPER = '#E9DCC4';

/** A cover or endpaper, filling a page `width` wide. `spine` is the side the book is bound on. */
export function CoverFace({ kind, info, width, spine }: { kind: CoverKind; info: BookInfo; width: number; spine: 'left' | 'right' }) {
  const s = width / 270;
  if (kind === 'front') return <Front info={info} s={s} />;
  if (kind === 'back') return <Back info={info} s={s} />;
  if (kind === 'blank') return <View style={{ flex: 1, backgroundColor: '#FFFDF8' }} />;
  return (
    <View style={{ flex: 1, backgroundColor: ENDPAPER, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      <Motif s={s} seed={kind === 'insideBack' ? 11 : 0} colors={info.grids.map((g) => g.color)} />
      {kind === 'insideFront' ? <Bookplate info={info} s={s} /> : <NextCard info={info} s={s} />}
      <View pointerEvents="none" style={[styles.gutter, spine === 'left' ? { left: 0 } : { right: 0, transform: [{ scaleX: -1 }] }]} />
    </View>
  );
}

/** Kraft board, with the crease where it bends at the spine. */
function Kraft({ children, style, spine }: { children: ReactNode; style?: object; spine: 'left' | 'right' }) {
  return (
    <View style={[{ flex: 1, backgroundColor: KRAFT, overflow: 'hidden' }, style]}>
      {children}
      <View pointerEvents="none" style={[styles.hinge, spine === 'left' ? { left: 0 } : { right: 0, flexDirection: 'row-reverse' }]}>
        <View style={{ width: 6, backgroundColor: 'rgba(60,40,10,0.22)' }} />
        <View style={{ width: 3, backgroundColor: 'rgba(255,255,255,0.18)' }} />
        <View style={{ width: 8, backgroundColor: 'rgba(60,40,10,0.1)' }} />
      </View>
    </View>
  );
}

function Front({ info, s }: { info: BookInfo; s: number }) {
  const m = info.newest;
  const cover = m ? m.photos.find((p) => p.isCover) ?? m.photos[0] : undefined;
  const fill = m ? fillLook(m.fill, m.gridColor) : null;
  const photo = 150 * s;
  return (
    <Kraft spine="left" style={{ paddingTop: 24 * s, paddingBottom: 20 * s, paddingLeft: 34 * s, paddingRight: 22 * s, gap: 12 * s }}>
      <View style={[styles.window, { borderRadius: 14 * s }]}>
        {m ? (
          <View style={[styles.polaroid, { padding: 7 * s, paddingBottom: 9 * s, transform: [{ rotate: '-4deg' }] }]}>
            {cover
              ? <Image source={{ uri: cover.uri }} style={{ width: photo, height: photo }} contentFit="cover" />
              : <View style={{ width: photo, height: photo, backgroundColor: fill!.bg, alignItems: 'center', justifyContent: 'center' }}>{fill!.emoji ? <SquareEmoji emoji={fill!.emoji} size={photo * 0.35} /> : null}</View>}
            <Text numberOfLines={1} style={{ fontFamily: fonts.hand, fontSize: 16 * s, lineHeight: 18 * s, color: colors.ink, paddingTop: 6 * s, maxWidth: photo }}>{m.title}</Text>
            <View style={[styles.tape, { top: -8 * s, left: photo * 0.3, width: photo * 0.42, height: 14 * s, backgroundColor: m.gridColor }]} />
          </View>
        ) : (
          <Text style={{ fontFamily: fonts.hand, fontSize: 20 * s, color: '#F3E7D2', textAlign: 'center', paddingHorizontal: 20 * s }}>Your first moment goes here.</Text>
        )}
      </View>
      <Text style={{ fontFamily: fonts.hand, fontSize: 37 * s, lineHeight: 36 * s, color: KRAFT_INK }}>
        {info.name ? `${info.name}'s\n` : ''}Memory Lane
      </Text>
      {info.since && <Text variant="label" style={{ fontSize: 10 * s, lineHeight: 14 * s, letterSpacing: 2.2 * s, color: KRAFT_MUTED }}>Since {info.since}</Text>}
    </Kraft>
  );
}

function Back({ info, s }: { info: BookInfo; s: number }) {
  return (
    <Kraft spine="right" style={{ paddingTop: 26 * s, paddingBottom: 22 * s, paddingLeft: 24 * s, paddingRight: 34 * s, gap: 14 * s }}>
      {info.grids.length > 0 && <Text variant="label" style={{ fontSize: 10 * s, lineHeight: 14 * s, letterSpacing: 2.2 * s, color: KRAFT_MUTED }}>In this book</Text>}
      <View style={{ gap: 10 * s }}>
        {info.grids.slice(0, 8).map((g, i) => (
          <View key={g.title} style={{ paddingVertical: 7 * s, paddingHorizontal: 12 * s, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={[StyleSheet.absoluteFill, { backgroundColor: g.color, opacity: 0.72, borderRadius: 2, transform: [{ rotate: `${i % 2 ? 1 : -1.2}deg` }] }]} />
            <Text variant="bodyBold" numberOfLines={1} style={{ fontSize: 14 * s, lineHeight: 18 * s, color: KRAFT_INK, flexShrink: 1 }}>{g.title}</Text>
            <Text variant="bodyBold" style={{ fontSize: 12 * s, lineHeight: 16 * s, color: KRAFT_INK }}>{g.count} page{g.count === 1 ? '' : 's'}</Text>
          </View>
        ))}
      </View>
      <View style={{ flex: 1 }} />
      <Text style={{ fontFamily: fonts.hand, fontSize: 30 * s, lineHeight: 30 * s, color: KRAFT_INK, textAlign: 'center' }}>Moments over metrics.</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 * s }}>
        <View style={{ width: 25 * s, flexDirection: 'row', flexWrap: 'wrap', gap: 2 * s }}>
          {[0, 1, 0, 1, 0, 1, 0, 0, 0].map((on, i) => <View key={i} style={{ width: 7 * s, height: 7 * s, borderRadius: 2, backgroundColor: on ? colors.accent : 'rgba(110,90,60,0.35)' }} />)}
        </View>
        <Text variant="label" style={{ fontSize: 11 * s, lineHeight: 15 * s, letterSpacing: 1.5 * s, color: KRAFT_MUTED }}>AirStrive · {new Date().getFullYear()}</Text>
      </View>
    </Kraft>
  );
}

/** The endpaper pattern: rows of small rounded squares, a few in the book's grid colors. */
function Motif({ s, seed, colors: tints }: { s: number; seed: number; colors: string[] }) {
  const cell = 21 * s;
  const gap = 7 * s;
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { padding: 14 * s, flexDirection: 'row', flexWrap: 'wrap', gap, opacity: 0.5, overflow: 'hidden' }]}>
      {Array.from({ length: 9 * 14 }, (_, i) => {
        const h = (i * 37 + seed) % 23;
        const tint = tints.length > 0 && (h === 3 || h === 9) ? tints[(i + seed) % tints.length] : null;
        return <View key={i} style={{ width: cell, height: cell, borderRadius: 4 * s, backgroundColor: tint ?? '#D6C6A8', opacity: tint ? 0.6 : 1 }} />;
      })}
    </View>
  );
}

function Card({ s, tape, rotate, children }: { s: number; tape: string; rotate: number; children: ReactNode }) {
  return (
    <View style={[styles.card, { width: '84%', padding: 16 * s, paddingBottom: 14 * s, gap: 6 * s, transform: [{ rotate: `${rotate}deg` }] }]}>
      <View style={[styles.tape, { top: -9 * s, left: '34%', width: '32%', height: 15 * s, backgroundColor: tape }]} />
      {children}
    </View>
  );
}

function Bookplate({ info, s }: { info: BookInfo; s: number }) {
  return (
    <Card s={s} tape={colors.accent} rotate={-1.5}>
      <Text variant="label" style={{ fontSize: 9.5 * s, lineHeight: 13 * s, letterSpacing: 2 * s, color: colors.scrapInk }}>This book belongs to</Text>
      <Text numberOfLines={1} style={[styles.dashed, { fontFamily: fonts.hand, fontSize: 34 * s, lineHeight: 38 * s, color: KRAFT_INK, paddingBottom: 6 * s }]}>{info.name ?? 'You'}</Text>
      {info.first && (
        <Text variant="body" style={{ fontSize: 12 * s, lineHeight: 17 * s, color: colors.muted }}>
          Started {shortDate(info.first.happenedOn)}, with “{info.first.title}.”
        </Text>
      )}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 * s, paddingTop: 2 * s }}>
        {info.grids.slice(0, 6).map((g) => (
          <View key={g.title} style={[styles.chip, { gap: 5 * s, paddingHorizontal: 9 * s, paddingVertical: 2 * s }]}>
            <View style={{ width: 7 * s, height: 7 * s, borderRadius: 2, backgroundColor: g.color }} />
            <Text variant="bodyBold" style={{ fontSize: 11 * s, lineHeight: 15 * s }}>{g.title}</Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

function NextCard({ info, s }: { info: BookInfo; s: number }) {
  return (
    <Card s={s} tape={info.grids[0]?.color ?? colors.accent} rotate={1.2}>
      <Text style={{ fontFamily: fonts.hand, fontSize: 28 * s, lineHeight: 30 * s, color: KRAFT_INK }}>The next page is still out there.</Text>
      <Text variant="body" style={[styles.dashed, { fontSize: 12 * s, lineHeight: 17 * s, color: colors.muted, paddingBottom: 8 * s }]}>
        {info.count} page{info.count === 1 ? '' : 's'} so far.
      </Text>
      {info.next && (
        <>
          <Text variant="label" style={{ fontSize: 9.5 * s, lineHeight: 13 * s, letterSpacing: 2 * s, color: colors.scrapInk }}>Next up</Text>
          <Text variant="bodyBold" style={{ fontSize: 12 * s, lineHeight: 17 * s }}>{info.next.prompt}</Text>
          <Text variant="body" style={{ fontSize: 12 * s, lineHeight: 17 * s, color: colors.muted }}>{info.next.gridTitle}, square {info.next.idx + 1}</Text>
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  window: {
    flex: 1, backgroundColor: '#B59D78', alignItems: 'center', justifyContent: 'center',
    borderTopWidth: 3, borderTopColor: 'rgba(60,40,10,0.28)', borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.3)',
  },
  polaroid: { backgroundColor: '#fff', shadowColor: '#3C280A', shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 8 }, elevation: 6 },
  tape: { position: 'absolute', opacity: 0.72, transform: [{ rotate: '4deg' }] },
  card: {
    backgroundColor: '#FFFDF8', borderRadius: 6,
    shadowColor: '#3C280A', shadowOpacity: 0.18, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 5,
  },
  dashed: { borderBottomWidth: 1.5, borderStyle: 'dashed', borderBottomColor: colors.scrapLine },
  chip: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: colors.scrapLine, borderRadius: 99 },
  hinge: { position: 'absolute', top: 0, bottom: 0, flexDirection: 'row' },
  gutter: { position: 'absolute', top: 0, bottom: 0, width: 18, backgroundColor: 'rgba(60,40,10,0.06)' },
});
