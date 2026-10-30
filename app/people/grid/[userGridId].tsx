import { useMemo, useState } from 'react';
import { View, ScrollView, Pressable, StyleSheet, useWindowDimensions, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { goBack } from '@/lib/goBack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { getSharedBoard, photoUrls, type SharedBoard } from '@/friends/api';
import { useLoad } from '@/friends/useLoad';
import { BackIcon } from '@/friends/bits';
import type { BoardSquare } from '@/db/repo';
import { shortDate } from '@/lib/ids';
import { Text } from '@/ui/Text';
import { Tile } from '@/ui/Tile';
import { colors, radius } from '@/theme';

/** Someone else's grid, read-only, with the moments they share with the viewer. */
export default function SharedGrid() {
  const { userGridId } = useLocalSearchParams<{ userGridId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [selected, setSelected] = useState<number | null>(null);

  const loaded = useLoad(async () => {
    const board = await getSharedBoard(userGridId);
    if (!board) return null;
    const paths = board.squares.flatMap((s) => s.moment?.photos.map((p) => p.storagePath) ?? []);
    return { board, urls: await photoUrls(paths) };
  }, [userGridId]);

  const board: SharedBoard | null = loaded.data?.board ?? null;
  const urls = loaded.data?.urls;

  const squares: BoardSquare[] = useMemo(() => (board?.squares ?? []).map((s) => {
    const uris = (s.moment?.photos ?? []).map((p) => urls?.get(p.storagePath)).filter((u): u is string => !!u);
    return {
      squareStateId: String(s.idx), idx: s.idx, state: s.state, prompt: s.prompt, hint: '', cluster: s.cluster,
      viaFreebie: false, momentId: s.moment?.id ?? null, fill: s.moment?.fill ?? '', coverUri: uris[0] ?? null, photoUris: uris,
    };
  }), [board, urls]);

  if (!board) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.paper, paddingTop: insets.top + 8 }}>
        <Pressable onPress={() => goBack(router, '/profile')} style={[styles.iconButton, { marginLeft: 10 }]} accessibilityLabel="Back"><BackIcon /></Pressable>
        <View style={{ padding: 24 }}>
          {loaded.loading ? <ActivityIndicator color={colors.muted} /> : (
            <Text variant="body" style={{ color: colors.muted }}>
              {loaded.error ? "Couldn't reach AirStrive. Check your connection." : "This grid isn't shared with you."}
            </Text>
          )}
        </View>
      </View>
    );
  }

  const gap = 6;
  const cols = board.grid.cols;
  const cell = Math.floor((Math.min(width, 640) - 40 - gap * (cols - 1)) / cols);
  const sq = selected === null ? null : board.squares.find((s) => s.idx === selected) ?? null;
  const moment = sq?.moment ?? null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.paper }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: 320 }}>
        <View style={styles.header}>
          <Pressable onPress={() => goBack(router, '/profile')} style={styles.iconButton} accessibilityLabel="Back"><BackIcon /></Pressable>
          <Text variant="label">{board.owner}'s grid</Text>
          <View style={styles.iconButton} />
        </View>
        <View style={{ paddingHorizontal: 20, gap: 4 }}>
          <Text variant="display">{board.grid.title}</Text>
          {board.completedAt ? <Text variant="body" style={{ fontSize: 14, color: colors.muted }}>Complete</Text> : null}
        </View>
        <View style={{ paddingHorizontal: 20, paddingTop: 18, flexDirection: 'row', flexWrap: 'wrap', gap, maxWidth: 640 }}>
          {squares.map((s) => (
            <Tile key={s.idx} square={s} size={cell} color={board.grid.color} revealIcon={board.grid.revealIcon} selected={s.idx === selected} onPress={() => setSelected(s.idx)} />
          ))}
        </View>
      </ScrollView>

      {sq && (
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.grabber} />
          {sq.state === 'hidden' ? (
            <>
              <Text variant="label">Hidden square</Text>
              <Text variant="title" style={{ fontSize: 22 }}>Still a mystery</Text>
            </>
          ) : moment ? (
            <ScrollView style={{ maxHeight: 360 }} contentContainerStyle={{ gap: 8 }}>
              <Text variant="label" style={{ color: colors.accentDeep }}>{shortDate(moment.happenedOn)}</Text>
              <Text variant="title" style={{ fontSize: 22 }}>{moment.title}</Text>
              {moment.body ? <Text variant="hand">{moment.body}</Text> : null}
              {moment.photos.length > 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingVertical: 4 }}>
                  {moment.photos.map((p) => {
                    const uri = urls?.get(p.storagePath);
                    return uri ? <Image key={p.id} source={{ uri }} style={styles.photo} contentFit="cover" /> : null;
                  })}
                </ScrollView>
              )}
              <Pressable
                onPress={() => router.push({ pathname: '/report/moment/[momentId]', params: { momentId: moment.id, title: moment.title } })}
                style={{ paddingVertical: 8 }}
              >
                <Text variant="caption" style={{ color: colors.muted }}>Report this moment</Text>
              </Pressable>
            </ScrollView>
          ) : (
            <>
              <Text variant="label">Square {sq.idx + 1}{sq.cluster ? ` · ${sq.cluster}` : ''}</Text>
              <Text variant="title" style={{ fontSize: 22 }}>{sq.prompt}</Text>
            </>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10, paddingBottom: 6 },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  sheet: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    backgroundColor: colors.card, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl,
    paddingHorizontal: 20, paddingTop: 12, gap: 8,
    shadowColor: colors.ink, shadowOpacity: 0.12, shadowRadius: 20, shadowOffset: { width: 0, height: -6 }, elevation: 12,
  },
  grabber: { width: 40, height: 5, borderRadius: 3, backgroundColor: colors.line, alignSelf: 'center', marginBottom: 6 },
  photo: { width: 140, height: 140, borderRadius: 14, backgroundColor: colors.line },
});
