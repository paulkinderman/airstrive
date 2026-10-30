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

const keyOf = (p: Page) => p.key;

/**
 * Memory Lane read like a book on a phone, oldest page first: swipe or tap the links at the
 * bottom to turn the page. `startKey` is the page it opens on, a moment id or `chapter:<id>`.
 */
export function PhoneReader({ startKey }: { startKey: string }) {
  const db = useSQLiteContext();
  const router = useRouter();
  const version = useDataVersion();
  const [pages, setPages] = useState<Page[] | null>(null);
  const [index, setIndex] = useState(0);
  // The page in front, so a refresh after an edit keeps you where you'd turned to.
  const showing = useRef(startKey);
  const order = useRef<Page[]>([]);

  useFocusEffect(
    useCallback(() => {
      listPages(db).then((all) => {
        const ordered = [...all].reverse();
        const i = ordered.findIndex((p) => p.key === showing.current);
        if (i < 0) { goBack(router, '/lane'); return; }
        order.current = ordered;
        setPages(ordered);
        setIndex(i);
      });
    }, [db, router, version]),
  );

  const onTurned = useCallback((i: number) => {
    showing.current = order.current[i]?.key ?? showing.current;
    setIndex(i);
  }, []);

  const render = useCallback((p: Page, turn: (dir: 1 | -1) => void) => {
    const i = order.current.indexOf(p);
    const nav = { page: i + 1, prev: order.current[i - 1] ?? null, next: order.current[i + 1] ?? null, turn };
    return p.kind === 'moment' ? <MomentSheet moment={p.moment} {...nav} /> : <ChapterSheet chapter={p.chapter} {...nav} />;
  }, []);

  if (!pages) return <View style={{ flex: 1, backgroundColor: colors.scrap }} />;

  return (
    <View style={{ flex: 1, backgroundColor: colors.scrap }}>
      <StatusBar style={pages[index]?.kind === 'chapter' ? 'light' : 'dark'} />
      <PageTurner items={pages} index={index} keyOf={keyOf} onTurned={onTurned} render={render} />
    </View>
  );
}
