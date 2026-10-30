import { useCallback, useEffect, useState } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { loadBoard, type ShelfGrid } from '@/db/repo';
import { useDataVersion } from '@/sync/events';
import { Text } from '@/ui/Text';
import { Tile } from '@/ui/Tile';
import { colors, radius } from '@/theme';

type Board = NonNullable<Awaited<ReturnType<typeof loadBoard>>>;

/** How long each open square stays as Next up. */
const NEXT_MS = 4000;
const FADE_MS = 280;

/**
 * A grid you're working on, on the wide home screen: the whole board with photos in its done
 * squares, and Next up turning through its open squares, with that square ringed on the board.
 * `stagger` offsets the turns so the cards on the shelf don't all change at once.
 */
export function ShelfCard({ grid, width, stagger }: { grid: ShelfGrid; width: number; stagger: number }) {
  const db = useSQLiteContext();
  const router = useRouter();
  const version = useDataVersion();
  const [board, setBoard] = useState<Board | null>(null);
  const [turn, setTurn] = useState(0);
  const fade = useSharedValue(1);
  const fadeStyle = useAnimatedStyle(() => ({ opacity: fade.value }));

  useFocusEffect(useCallback(() => {
    let live = true;
    loadBoard(db, grid.userGridId).then((b) => { if (live) setBoard(b); });
    return () => { live = false; };
  }, [db, grid.userGridId, version]));

  const open = board?.squares.filter((s) => s.state === 'revealed') ?? [];
  const next = open.length ? open[turn % open.length] : null;

  useEffect(() => {
    if (open.length < 2) return;
    let interval: ReturnType<typeof setInterval>;
    let swap: ReturnType<typeof setTimeout>;
    const step = () => {
      fade.value = withTiming(0, { duration: FADE_MS });
      swap = setTimeout(() => {
        setTurn((t) => t + 1);
        fade.value = withTiming(1, { duration: FADE_MS });
      }, FADE_MS);
    };
    const start = setTimeout(() => { step(); interval = setInterval(step, NEXT_MS); }, NEXT_MS + stagger);
    return () => { clearTimeout(start); clearTimeout(swap); clearInterval(interval); fade.value = 1; };
  }, [open.length, stagger]);

  const goTo = (select?: string) => router.push({ pathname: '/grid/[id]', params: select ? { id: grid.userGridId, select } : { id: grid.userGridId } });

  // The board takes up to about 45% of the card, in whole pixels per square.
  const gap = grid.cols >= 10 ? 2 : 3;
  const cell = Math.max(6, Math.min(18, Math.floor((width * 0.42 - (grid.cols - 1) * gap) / grid.cols), Math.floor((190 - (grid.rows - 1) * gap) / grid.rows)));

  return (
    <View style={[styles.card, { width }]}>
      <View style={{ width: grid.cols * cell + (grid.cols - 1) * gap, flexDirection: 'row', flexWrap: 'wrap', gap }}>
        {board
          ? board.squares.map((s) => (
            <Tile
              key={s.squareStateId} square={s} size={cell} color={board.color} revealIcon={board.revealIcon}
              selected={false}
              onPress={() => goTo(s.squareStateId)}
            />
          ))
          : grid.states.map((_, i) => <View key={i} style={{ width: cell, height: cell, borderRadius: cell / 4, backgroundColor: colors.tileHidden }} />)}
        {next && (
          <View
            pointerEvents="none"
            style={[styles.ring, {
              left: (next.idx % grid.cols) * (cell + gap) - 3, top: Math.floor(next.idx / grid.cols) * (cell + gap) - 3,
              width: cell + 6, height: cell + 6, borderRadius: cell / 4 + 3, borderColor: board?.color ?? grid.color,
            }]}
          />
        )}
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <Pressable onPress={() => goTo()} accessibilityRole="link" accessibilityLabel={`Open ${grid.title}`} style={{ gap: 3 }}>
          <Text variant="title" numberOfLines={2} style={{ fontSize: 21, lineHeight: 25 }}>{grid.title}</Text>
          <Text variant="body" style={{ fontSize: 13, color: colors.muted }}>
            {grid.done} of {grid.total} · {grid.revealed} open
          </Text>
        </Pressable>
        <View style={{ marginTop: 10, gap: 2 }}>
          <Text variant="body" style={{ fontSize: 13, color: colors.muted }}>Next up</Text>
          {next ? (
            <Pressable onPress={() => goTo(next.squareStateId)} accessibilityRole="link" accessibilityLabel={`Next up: ${next.prompt}`}>
              <Animated.View style={fadeStyle}>
                <Text variant="bodyBold" numberOfLines={2} style={{ fontSize: 15, minHeight: 42 }}>{next.prompt}</Text>
              </Animated.View>
            </Pressable>
          ) : (
            <Text variant="bodyBold" style={{ fontSize: 15, color: colors.muted, minHeight: 42 }}>{board ? 'Every open square is done' : ' '}</Text>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  ring: { position: 'absolute', borderWidth: 2 },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 18, padding: 18, borderRadius: radius.lg,
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line,
  },
});
