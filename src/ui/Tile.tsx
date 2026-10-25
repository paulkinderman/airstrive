import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';
import type { BoardSquare } from '@/db/repo';
import { colors } from '@/theme';

const CYCLE_MS = 9000;
const FADE_MS = 1400;

/**
 * One square on the board. Done squares with several photos drift between them;
 * each tile starts at a different point in the cycle so the board shimmers rather than flips.
 */
export function Tile({
  square, size, color, selected, onPress,
}: { square: BoardSquare; size: number; color: string; selected: boolean; onPress: () => void }) {
  const uris = square.photoUris;
  const multi = uris.length > 1;
  const [front, setFront] = useState(0);
  const [back, setBack] = useState(1);
  const frontOpacity = useSharedValue(1);

  useEffect(() => {
    if (!multi) return;
    const offset = (square.idx * 1700) % CYCLE_MS;
    let i = 0;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      i += 1;
      setBack(i % uris.length);
      frontOpacity.value = withTiming(0, { duration: FADE_MS, easing: Easing.inOut(Easing.ease) }, () => {});
      timer = setTimeout(() => {
        setFront(i % uris.length);
        frontOpacity.value = 1;
        timer = setTimeout(tick, CYCLE_MS - FADE_MS);
      }, FADE_MS);
    };
    timer = setTimeout(tick, offset + 2000);
    return () => clearTimeout(timer);
  }, [multi, uris.length, square.idx, frontOpacity]);

  const frontStyle = useAnimatedStyle(() => ({ opacity: frontOpacity.value }));

  const radius = Math.max(6, size * 0.27);
  const ring = selected ? { borderWidth: 3, borderColor: colors.ink } : null;

  if (square.state === 'done' && uris.length > 0) {
    return (
      <Pressable onPress={onPress} style={[{ width: size, height: size, borderRadius: radius, overflow: 'hidden' }, ring]}>
        <Image source={{ uri: uris[back] ?? uris[0] }} style={StyleSheet.absoluteFill} contentFit="cover" />
        <Animated.View style={[StyleSheet.absoluteFill, frontStyle]}>
          <Image source={{ uri: uris[front] }} style={StyleSheet.absoluteFill} contentFit="cover" />
        </Animated.View>
      </Pressable>
    );
  }

  const bg = square.state === 'done' ? color : square.state === 'revealed' ? colors.card : colors.tileHidden;
  return (
    <Pressable
      onPress={onPress}
      style={[
        { width: size, height: size, borderRadius: radius, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' },
        square.state === 'revealed' && { borderWidth: 1.5, borderColor: colors.lineStrong },
        ring,
      ]}
    >
      {square.state === 'revealed' && (
        <View style={{ width: size * 0.27, height: size * 0.27, borderRadius: size * 0.14, backgroundColor: color }} />
      )}
    </Pressable>
  );
}
