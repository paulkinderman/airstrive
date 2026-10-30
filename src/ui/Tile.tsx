import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';
import type { BoardSquare } from '@/db/repo';
import { colors } from '@/theme';
import { RevealMark, SquareEmoji, fillLook } from './SquareLook';

const CYCLE_MS = 9000;
const FADE_MS = 1400;
const RETRY_MS = 400;
const MAX_WAIT_MS = 6000;

/**
 * One square on the board. A revealed square shows the grid's icon (`revealIcon`, '' for
 * the dot); a done square with no photo shows its moment's fill.
 * Done squares with several photos drift between them;
 * each tile starts at a different point in the cycle so the board shimmers rather than flips.
 *
 * Two image layers sit on top of each other and take turns. Only the hidden layer ever
 * changes its picture, and a fade only starts once that picture has loaded, so the
 * visible image never swaps or blanks mid-view.
 */
export function Tile({
  square, size, color, revealIcon = '', selected, onPress, onHover,
}: {
  square: BoardSquare; size: number; color: string; revealIcon?: string; selected: boolean; onPress: () => void; onHover?: (on: boolean) => void;
}) {
  const uris = square.photoUris;
  const multi = uris.length > 1;
  const urisKey = uris.join('|');
  // Which photo each layer holds. Layer B sits on top; its opacity decides which one shows.
  const [aIdx, setAIdx] = useState(0);
  const [bIdx, setBIdx] = useState(1);
  const bOpacity = useSharedValue(0);
  const loaded = useRef<{ a?: string; b?: string }>({});

  useEffect(() => {
    if (!multi) return;
    Image.prefetch(uris).catch(() => {});
    setAIdx(0);
    setBIdx(1);
    bOpacity.value = 0;
    const offset = (square.idx * 1700) % CYCLE_MS;
    let step = 0; // the photo on screen is uris[step % n], on layer A when step is even
    let waited = 0;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const next = step + 1;
      const nextLayer = next % 2 === 0 ? 'a' : 'b';
      const want = uris[next % uris.length];
      if (loaded.current[nextLayer] !== want && waited < MAX_WAIT_MS) {
        // The incoming photo isn't decoded yet; hold the current one a little longer.
        waited += RETRY_MS;
        timer = setTimeout(tick, RETRY_MS);
        return;
      }
      waited = 0;
      step = next;
      bOpacity.value = withTiming(nextLayer === 'b' ? 1 : 0, { duration: FADE_MS, easing: Easing.inOut(Easing.cubic) });
      timer = setTimeout(() => {
        // The layer we just faded away from is now hidden: load the photo after this one into it.
        const after = (step + 1) % uris.length;
        if (nextLayer === 'b') setAIdx(after);
        else setBIdx(after);
        timer = setTimeout(tick, CYCLE_MS - FADE_MS);
      }, FADE_MS);
    };
    timer = setTimeout(tick, offset + 2000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [multi, urisKey, square.idx, bOpacity]);

  const bStyle = useAnimatedStyle(() => ({ opacity: bOpacity.value }));
  const aUri = uris[aIdx] ?? uris[0];
  const bUri = uris[bIdx] ?? uris[0];

  const radius = Math.max(6, size * 0.27);
  // Screen readers and the UI tests find squares by these.
  const a11y = {
    testID: `square-${square.idx}`,
    accessibilityRole: 'button' as const,
    accessibilityLabel: square.state === 'hidden' ? `Square ${square.idx + 1}, hidden` : `Square ${square.idx + 1}, ${square.prompt}, ${square.state}`,
    accessibilityState: { selected },
  };
  const ring = selected ? { borderWidth: 3, borderColor: colors.ink } : null;
  const hover = onHover ? { onHoverIn: () => onHover(true), onHoverOut: () => onHover(false) } : null;

  if (square.state === 'done' && uris.length > 0) {
    return (
      <Pressable {...a11y} onPress={onPress} {...hover} style={[{ width: size, height: size, borderRadius: radius, overflow: 'hidden' }, ring]}>
        <Image
          source={{ uri: aUri }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          cachePolicy="memory-disk"
          onLoad={() => { loaded.current.a = aUri; }}
        />
        {multi && (
          <Animated.View style={[StyleSheet.absoluteFill, bStyle]} pointerEvents="none">
            <Image
              source={{ uri: bUri }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              cachePolicy="memory-disk"
              onLoad={() => { loaded.current.b = bUri; }}
            />
          </Animated.View>
        )}
      </Pressable>
    );
  }

  const fill = fillLook(square.state === 'done' ? square.fill : '', color);
  const bg = square.state === 'done' ? fill.bg : square.state === 'revealed' ? colors.card : colors.tileHidden;
  return (
    <Pressable
      {...a11y}
      onPress={onPress}
      {...hover}
      style={[
        { width: size, height: size, borderRadius: radius, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' },
        square.state === 'revealed' && { borderWidth: 1.5, borderColor: colors.lineStrong },
        ring,
      ]}
    >
      {square.state === 'revealed' && <RevealMark icon={revealIcon} color={color} size={size} />}
      {square.state === 'done' && fill.emoji ? <SquareEmoji emoji={fill.emoji} size={size * 0.5} /> : null}
    </Pressable>
  );
}
