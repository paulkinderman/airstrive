import { useCallback, useEffect, type ReactNode } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN, scheduleOnUI } from 'react-native-worklets';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

const TURN_MS = 520;
/** A turn that's let go past this far, or flicked, finishes; otherwise the page falls back. */
const COMMIT = 0.35;
const FLICK = 500;

export type Turn = (dir: 1 | -1) => void;

/**
 * Pages you turn like a book's, bound on the left edge of the screen. Swiping left lifts the
 * page in front and turns it over the spine to show the next one under it; swiping right
 * brings the previous page back over. `turn` does the same from a button. Items are in
 * reading order, and only the page in front and its two neighbours are drawn.
 */
export function PageTurner<T>({ items, index, keyOf, onTurned, render }: {
  items: T[];
  index: number;
  keyOf: (item: T) => string;
  onTurned: (index: number) => void;
  render: (item: T, turn: Turn) => ReactNode;
}) {
  const { width } = useWindowDimensions();
  // How far through a turn: above 0 the front page is going over, below 0 the previous one is coming back.
  const p = useSharedValue(0);
  // The page in front as the UI thread sees it. It moves the moment a turn lands, before React catches up.
  const at = useSharedValue(index);
  const count = useSharedValue(items.length);
  const busy = useSharedValue(false);

  useEffect(() => { count.value = items.length; }, [count, items.length]);
  useEffect(() => { at.value = index; busy.value = false; }, [at, busy, index]);

  const landed = useCallback((i: number) => onTurned(i), [onTurned]);

  const finish = (dir: 1 | -1, from: number) => {
    'worklet';
    busy.value = true;
    p.value = withTiming(dir, { duration: TURN_MS * (1 - Math.abs(from)) + 140, easing: Easing.out(Easing.cubic) }, (done) => {
      if (!done) return;
      // Same frame: the turned page is out of sight and the next one is in front, so nothing blinks.
      at.value += dir;
      p.value = 0;
      scheduleOnRN(landed, at.value);
    });
  };

  const turn = useCallback<Turn>((dir) => {
    const to = at.value + dir;
    if (busy.value || to < 0 || to >= count.value) return;
    scheduleOnUI(finish, dir, 0);
  }, [at, busy, count, finish]);

  const pan = Gesture.Pan()
    .activeOffsetX([-12, 12])
    .failOffsetY([-14, 14])
    .onUpdate((e) => {
      if (busy.value) return;
      const dir = e.translationX < 0 ? 1 : -1;
      const to = at.value + dir;
      p.value = to < 0 || to >= count.value ? 0 : dir * Math.min(Math.abs(e.translationX) / (width * 0.9), 1);
    })
    .onEnd((e) => {
      if (busy.value || p.value === 0) return;
      const dir = p.value > 0 ? 1 : -1;
      if (Math.abs(p.value) > COMMIT || -e.velocityX * dir > FLICK) finish(dir, p.value);
      else p.value = withTiming(0, { duration: 260, easing: Easing.out(Easing.quad) });
    });

  const from = Math.max(0, index - 1);
  const drawn = items.slice(from, index + 2).map((item, k) => ({ item, pos: from + k })).reverse();

  return (
    <GestureDetector gesture={pan}>
      <View style={{ flex: 1, overflow: 'hidden' }}>
        {drawn.map(({ item, pos }) => (
          <Leaf key={keyOf(item)} pos={pos} at={at} p={p}>{render(item, turn)}</Leaf>
        ))}
      </View>
    </GestureDetector>
  );
}

/** How far a page `d` places from the front stands up off the book, in radians, while a turn is `turned` through. */
function leafAngle(d: number, turned: number) {
  'worklet';
  if (d === 0) return Math.acos(1 - Math.max(turned, 0));
  if (d === -1) return Math.acos(Math.max(-turned, 0));
  return d < -1 ? Math.PI / 2 : 0;
}

/**
 * One page. Its angle is picked so the free edge stays under your finger: a page turned
 * `f` of the way across shows its edge at (1 - f) of the width.
 */
function Leaf({ pos, at, p, children }: { pos: number; at: SharedValue<number>; p: SharedValue<number>; children: ReactNode }) {
  const leaf = useAnimatedStyle(() => {
    const a = leafAngle(pos - at.value, p.value);
    return {
      opacity: a >= Math.PI / 2 - 0.001 ? 0 : 1,
      transform: [{ perspective: 1400 }, { rotateY: `${(-a * 180) / Math.PI}deg` }],
    };
  });
  // The lifted page darkens toward its free edge as it curls away from the light.
  const curl = useAnimatedStyle(() => ({ opacity: Math.min(1, (leafAngle(pos - at.value, p.value) / (Math.PI / 2)) * 1.4) }));
  // The page underneath sits in the turning page's shadow until it's uncovered.
  const shadow = useAnimatedStyle(() => {
    const d = pos - at.value;
    const f = Math.abs(p.value);
    const under = (d === 1 && p.value > 0) || (d === 0 && p.value < 0);
    return { opacity: under ? 0.22 * Math.min(1, f * 5) * (1 - f) : 0 };
  });

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.leaf, leaf]}>
      {children}
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#2B2216' }, shadow]} />
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, curl]}>
        <Svg width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 100 100">
          <Defs>
            <LinearGradient id="curl" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor="#2B2216" stopOpacity={0} />
              <Stop offset="0.55" stopColor="#2B2216" stopOpacity={0.08} />
              <Stop offset="0.88" stopColor="#2B2216" stopOpacity={0.3} />
              <Stop offset="0.96" stopColor="#FFFFFF" stopOpacity={0.25} />
              <Stop offset="1" stopColor="#2B2216" stopOpacity={0.35} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100" height="100" fill="url(#curl)" />
        </Svg>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  leaf: { transformOrigin: 'left center', backfaceVisibility: 'hidden' },
});
