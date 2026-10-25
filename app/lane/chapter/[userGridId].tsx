import { useCallback, useState } from 'react';
import { View, Pressable, ScrollView, StyleSheet, useWindowDimensions, Alert } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Image } from 'expo-image';
import Svg, { Path } from 'react-native-svg';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { getChapter, listPages, type Chapter, type Page } from '@/db/repo';
import { readBase64 } from '@/lib/files';
import { chapterCaption, posterHtml } from '@/lib/printables';
import { useDataVersion } from '@/sync/events';
import { PageLink, openPage } from '@/ui/PageLink';
import { Text } from '@/ui/Text';
import { Button } from '@/ui/Button';
import { colors } from '@/theme';

async function dataUri(path: string | null) {
  if (!path) return null;
  try {
    const mime = path.endsWith('.jpg') ? 'image/jpeg' : 'image/webp';
    return `data:${mime};base64,${await readBase64(path)}`;
  } catch {
    return null;
  }
}

async function posterFor(c: Chapter) {
  const tiles = await Promise.all(c.tilePaths.map(dataUri));
  return posterHtml({ gridTitle: c.gridTitle, gridColor: c.gridColor, cols: c.cols, tiles, caption: chapterCaption(c.momentCount, c.firstOn, c.lastOn) });
}

/** The page Memory Lane adds when a grid is finished: the whole mosaic, framed. */
export default function ChapterCover() {
  const { userGridId } = useLocalSearchParams<{ userGridId: string }>();
  const db = useSQLiteContext();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const version = useDataVersion();
  const [c, setC] = useState<Chapter | null>(null);
  const [nav, setNav] = useState<{ page: number; prev: Page | null; next: Page | null }>({ page: 0, prev: null, next: null });
  const [busy, setBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        const [chapter, all] = await Promise.all([getChapter(db, userGridId), listPages(db)]);
        if (!chapter) { router.back(); return; }
        setC(chapter);
        const i = all.findIndex((p) => p.key === `chapter:${userGridId}`);
        setNav({ page: all.length - i, prev: all[i + 1] ?? null, next: all[i - 1] ?? null });
      })();
    }, [db, userGridId, router, version]),
  );

  if (!c) return <View style={{ flex: 1, backgroundColor: colors.night }} />;

  const frame = Math.min(width - 48, 420);
  const gap = c.cols >= 10 ? 3 : 4;
  const cell = (frame - 20 - gap * (c.cols - 1)) / c.cols;

  const print = async () => {
    if (busy) return;
    setBusy(true);
    try { await Print.printAsync({ html: await posterFor(c) }); } catch { /* cancelled */ } finally { setBusy(false); }
  };

  const share = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const { uri } = await Print.printToFileAsync({ html: await posterFor(c) });
      await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: `${c.gridTitle}, complete` });
    } catch {
      Alert.alert("Couldn't make the poster", 'Try again in a moment.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.night }}>
      <StatusBar style="light" />
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.navigate('/lane')} style={styles.headerButton}>
          <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#AEB5C0" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"><Path d="M15 5l-7 7 7 7" /></Svg>
          <Text variant="bodyBold" style={{ fontSize: 14, color: '#AEB5C0' }}>Index</Text>
        </Pressable>
        <Text variant="label" style={{ color: '#AEB5C0' }}>Chapter · Page {nav.page}</Text>
        <Pressable onPress={share} style={[styles.headerButton, { width: 44, justifyContent: 'center' }]} accessibilityLabel="Share this page">
          <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#AEB5C0" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M12 3v12M7 8l5-5 5 5M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" />
          </Svg>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 20, paddingBottom: 20, alignItems: 'center', gap: 22 }}>
        <View style={[styles.frame, { width: frame, gap }]}>
          {c.tiles.map((uri, i) =>
            uri ? (
              <Image key={i} source={{ uri }} style={{ width: cell, height: cell }} contentFit="cover" />
            ) : (
              <View key={i} style={{ width: cell, height: cell, backgroundColor: c.gridColor }} />
            ),
          )}
        </View>

        <View style={{ alignItems: 'center', gap: 8 }}>
          <Text variant="label" style={{ color: c.gridColor, letterSpacing: 2.5 }}>Grid complete</Text>
          <Text variant="display" style={{ fontSize: 40, lineHeight: 44, color: '#fff', textAlign: 'center' }}>{c.gridTitle}</Text>
          <Text variant="hand" style={{ fontSize: 24, color: '#D5DAE1', textAlign: 'center' }}>{chapterCaption(c.momentCount, c.firstOn, c.lastOn)}</Text>
        </View>

        <View style={{ flexDirection: 'row', gap: 10, alignSelf: 'stretch' }}>
          <Button label="Print as poster" color={c.gridColor} onPress={print} disabled={busy} style={{ flex: 1 }} />
          <Pressable onPress={() => router.push({ pathname: '/grid/[id]', params: { id: userGridId } })} style={styles.secondary}>
            <Text variant="bodyBold" style={{ color: '#fff' }}>Open the grid</Text>
          </Pressable>
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <PageLink page={nav.prev} dir="prev" dark onPress={(p) => openPage(router, p)} />
        <PageLink page={nav.next} dir="next" dark onPress={(p) => openPage(router, p)} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingBottom: 4 },
  headerButton: { height: 44, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 6 },
  frame: {
    flexDirection: 'row', flexWrap: 'wrap', padding: 10, backgroundColor: '#fff',
    shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 30, shadowOffset: { width: 0, height: 10 }, elevation: 10,
  },
  secondary: { flex: 1, height: 50, borderRadius: 14, borderWidth: 1.5, borderColor: '#4B5563', alignItems: 'center', justifyContent: 'center' },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 10 },
});
