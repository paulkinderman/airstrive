import { useCallback, useRef, useState } from 'react';
import { View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { listPages, type Page } from '@/db/repo';
import { goBack } from '@/lib/goBack';
import { useDataVersion } from '@/sync/events';
import { colors } from '@/theme';
import { PageTurner } from './PageTurner';
import { MomentSheet } from './MomentSheet';
import { ChapterSheet } from './ChapterSheet';
import { CoverSheet } from './CoverSheet';
import { bookItems, isCover, useBookInfo, type BookItem } from './Covers';

const keyOf = (p: BookItem) => p.key;

/**
 * Memory Lane read like a book on a phone, from the front cover through the pages oldest first
 * to the back cover: swipe or tap the links at the bottom to turn the page. `startKey` is the
 * page it opens on: a moment id, `chapter:<id>`, or `cover` for the front cover.
 */
export function PhoneReader({ startKey }: { startKey: string }) {
  const db = useSQLiteContext();
  const router = useRouter();
  const version = useDataVersion();
  const [pages, setPages] = useState<Page[] | null>(null);
  const [index, setIndex] = useState(0);
  // The page in front, so a refresh after an edit keeps you where you'd turned to.
  const showing = useRef(startKey === 'cover' ? 'cover:front' : startKey);
  const order = useRef<BookItem[]>([]);
  const info = useBookInfo(pages);

  useFocusEffect(
    useCallback(() => {
      listPages(db).then((all) => {
        const items = bookItems([...all].reverse(), false);
        const i = items.findIndex((p) => p.key === showing.current);
        if (i < 0) { goBack(router, '/lane'); return; }
        order.current = items;
        setPages(all);
        setIndex(i);
      });
    }, [db, router, version]),
  );

  const onTurned = useCallback((i: number) => {
    showing.current = order.current[i]?.key ?? showing.current;
    setIndex(i);
  }, []);

  const render = (p: BookItem, turn: (dir: 1 | -1) => void) => {
    const i = order.current.indexOf(p);
    const nav = { prev: order.current[i - 1] ?? null, next: order.current[i + 1] ?? null, turn };
    if (isCover(p)) return <CoverSheet kind={p.kind} info={info} {...nav} />;
    // Page numbers count the pages only, after the front cover and its endpaper.
    const page = i - 1;
    return p.kind === 'moment' ? <MomentSheet moment={p.moment} page={page} {...nav} /> : <ChapterSheet chapter={p.chapter} page={page} {...nav} />;
  };

  if (!pages) return <View style={{ flex: 1, backgroundColor: colors.scrap }} />;

  const current = order.current[index];
  return (
    <View style={{ flex: 1, backgroundColor: colors.scrap }}>
      <StatusBar style={current?.kind === 'chapter' ? 'light' : 'dark'} />
      <PageTurner items={order.current} index={index} keyOf={keyOf} onTurned={onTurned} render={render} />
    </View>
  );
}
