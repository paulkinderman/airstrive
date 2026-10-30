import { useEffect, useState } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, useReducedMotion } from 'react-native-reanimated';
import type { OpenSquare, ShelfGrid } from '@/db/repo';
import { Text } from '@/ui/Text';
import { MiniGrid } from '@/ui/MiniGrid';
import { colors, radius } from '@/theme';

/** How long each open square stays as Next up. */
const NEXT_MS = 4000;
const FADE_MS = 280;

/**
 * A grid on the phone home screen, half the width: the whole grid small, and Next up turning
 * through its open squares with that square ringed. `stagger` keeps the cards from turning together.
 */
export function GridTile({ grid, open, stagger }: { grid: ShelfGrid; open: OpenSquare[]; stagger: number }) {
  const router = useRouter();
  const still = useReducedMotion();
  const [turn, setTurn] = useState(0);
  const fade = useSharedValue(1);
  const fadeStyle = useAnimatedStyle(() => ({ opacity: fade.value }));
  const next = open.length ? open[turn % open.length] : null;

  useEffect(() => {
    if (open.length < 2 || still) return;
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
  }, [open.length, stagger, still]);

  const cell = grid.cols >= 10 ? 4 : grid.cols >= 8 ? 5 : 6;

  return (
    <Pressable
      onPress={() => router.push({ pathname: '/grid/[id]', params: next ? { id: grid.userGridId, select: next.squareStateId } : { id: grid.userGridId } })}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }]}
      accessibilityRole="link"
      accessibilityLabel={next ? `${grid.title}, next up: ${next.prompt}` : grid.title}
    >
      <View style={styles.top}>
        <MiniGrid states={grid.states} cols={grid.cols} color={grid.color} cell={cell} ring={next?.idx} />
        <Text variant="body" style={styles.count}>{grid.done} of {grid.total}</Text>
      </View>
      <Text variant="title" numberOfLines={2} style={{ fontSize: 17, lineHeight: 20 }}>{grid.title}</Text>
      {grid.completedAt ? (
        <Text variant="bodyBold" style={styles.nextText}>Complete</Text>
      ) : (
        <View>
          <Text variant="body" style={styles.count}>Next up</Text>
          <Animated.View style={fadeStyle}>
            <Text variant="bodyBold" numberOfLines={2} style={[styles.nextText, !next && { color: colors.muted }]}>
              {next ? next.prompt : 'Reveal a square'}
            </Text>
          </Animated.View>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1, gap: 8, padding: 12, borderRadius: radius.lg,
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line,
  },
  top: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6 },
  count: { fontSize: 12, lineHeight: 16, color: colors.muted },
  nextText: { fontSize: 13, lineHeight: 17, minHeight: 34 },
});
