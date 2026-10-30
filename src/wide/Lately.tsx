import { useEffect, useRef, useState } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';
import type { Moment } from '@/db/repo';
import { shortDate } from '@/lib/ids';
import { Text } from '@/ui/Text';
import { SquareEmoji, fillLook } from '@/ui/SquareLook';
import { colors, fonts } from '@/theme';

/** How many polaroids are drawn; the rest of the stack waits underneath. */
const DRAWN = 5;
const CARD = 220;
const FLICK_MS = 480;
/** A swipe flicks the top photo when it covers this many pixels within WINDOW_MS. */
const FLICK_PX = 70;
const WINDOW_MS = 90;

/** The top moment the last time the stack was shown, so a new one can be taped on as it arrives. */
let seenTop: string | null = null;

/** Each moment keeps the same tilt and nudge every time it's drawn. */
function lie(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  h = Math.abs(h);
  return { rot: (h % 140) / 10 - 7, x: ((h >> 4) % 28) - 14, y: ((h >> 9) % 12) - 6, tape: ((h >> 12) % 12) - 6 };
}

/**
 * Lately: your newest moments as a stack of taped-down polaroids, newest on top. A quick swipe
 * across the top one flicks it off so you can see the one underneath; it goes back in at the
 * bottom. Clicking the top one opens its page in Memory Lane.
 */
export function Lately({ moments }: { moments: Moment[] }) {
  const router = useRouter();
  const [offset, setOffset] = useState(0);
  const area = useRef<HTMLElement | null>(null);
  const busy = useRef(false);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const spin = useSharedValue(0);
  const opacity = useSharedValue(1);
  const scale = useSharedValue(1);
  const topStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { rotate: `${spin.value}deg` }, { scale: scale.value }],
  }));

  const newest = moments[0]?.id ?? null;

  // A moment logged since the stack was last shown drops on and gets taped down.
  useEffect(() => {
    setOffset(0);
    if (newest && seenTop && newest !== seenTop) {
      ty.value = -220; opacity.value = 0; scale.value = 1.06;
      ty.value = withTiming(0, { duration: 520, easing: Easing.out(Easing.back(1.4)) });
      opacity.value = withTiming(1, { duration: 360 });
      scale.value = withTiming(1, { duration: 520 });
    }
    if (newest) seenTop = newest;
  }, [newest]);

  // Watches the mouse (or a finger) over the stack for a quick swipe.
  useEffect(() => {
    const el = area.current;
    if (!el || typeof el.addEventListener !== 'function' || moments.length < 2) return;
    el.style.touchAction = 'none';
    let trail: { x: number; y: number; t: number }[] = [];
    const onMove = (e: PointerEvent) => {
      const now = e.timeStamp;
      trail.push({ x: e.clientX, y: e.clientY, t: now });
      trail = trail.filter((p) => now - p.t <= WINDOW_MS);
      if (busy.current || trail.length < 2) return;
      const dx = e.clientX - trail[0].x;
      const dy = e.clientY - trail[0].y;
      const dist = Math.hypot(dx, dy);
      if (dist < FLICK_PX) return;
      busy.current = true;
      trail = [];
      const k = 560 / dist;
      const ease = { duration: FLICK_MS, easing: Easing.out(Easing.cubic) };
      tx.value = withTiming(dx * k, ease);
      ty.value = withTiming(dy * k, ease);
      spin.value = withTiming((dx < 0 ? -1 : 1) * (25 + (dist % 25)), ease);
      opacity.value = withTiming(0, { duration: FLICK_MS, easing: Easing.in(Easing.quad) });
      setTimeout(() => {
        setOffset((o) => (o + 1) % moments.length);
        tx.value = 0; ty.value = 0; spin.value = 0; opacity.value = 1;
        busy.current = false;
      }, FLICK_MS);
    };
    const onLeave = () => { trail = []; };
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerleave', onLeave);
    return () => { el.removeEventListener('pointermove', onMove); el.removeEventListener('pointerleave', onLeave); };
  }, [moments.length]);

  if (moments.length === 0) {
    return (
      <View style={[styles.area, { alignItems: 'center', justifyContent: 'center' }]}>
        <View style={styles.empty}>
          <Text variant="hand" style={{ fontSize: 22, lineHeight: 26, color: colors.scrapInk, textAlign: 'center' }}>
            Your next moment lands here.
          </Text>
        </View>
      </View>
    );
  }

  // Bottom of the drawn pile first, so the top moment is drawn last.
  const drawn = Array.from({ length: Math.min(DRAWN, moments.length) }, (_, i) => moments[(offset + i) % moments.length]).reverse();

  return (
    <View style={{ gap: 6 }}>
      <View ref={(node) => { area.current = node as unknown as HTMLElement | null; }} style={styles.area}>
        {drawn.map((m, i) => {
          const top = i === drawn.length - 1;
          const l = lie(m.id);
          const place = { transform: [{ translateX: l.x }, { translateY: l.y }, { rotate: `${l.rot}deg` }] };
          return top ? (
            <Animated.View key={m.id} style={[styles.slot, topStyle]}>
              <Pressable onPress={() => router.push({ pathname: '/lane/[momentId]', params: { momentId: m.id } })} accessibilityRole="link" accessibilityLabel={`${m.title}, open in Memory Lane`}>
                <Polaroid moment={m} place={place} tape={l.tape} />
              </Pressable>
            </Animated.View>
          ) : (
            <View key={m.id} style={styles.slot} pointerEvents="none">
              <Polaroid moment={m} place={place} tape={l.tape} />
            </View>
          );
        })}
      </View>
      {moments.length > 1 && (
        <Text variant="hand" style={{ fontSize: 19, lineHeight: 22, color: colors.scrapInk, textAlign: 'center' }}>swipe to flick</Text>
      )}
    </View>
  );
}

function Polaroid({ moment, place, tape }: { moment: Moment; place: object; tape: number }) {
  const cover = moment.photos.find((p) => p.isCover) ?? moment.photos[0];
  const fill = fillLook(moment.fill, moment.gridColor);
  return (
    <View style={[styles.polaroid, place]}>
      {cover
        ? <Image source={{ uri: cover.uri }} style={styles.photo} contentFit="cover" cachePolicy="memory-disk" />
        : <View style={[styles.photo, { backgroundColor: fill.bg, alignItems: 'center', justifyContent: 'center' }]}>{fill.emoji ? <SquareEmoji emoji={fill.emoji} size={64} /> : null}</View>}
      <Text numberOfLines={2} style={styles.caption}>{moment.body.trim() || moment.title}</Text>
      <Text variant="label" numberOfLines={1} style={styles.meta}>{moment.gridTitle} · {shortDate(moment.happenedOn).replace(/, \d+$/, '')}</Text>
      <View style={[styles.tape, { transform: [{ rotate: `${tape}deg` }] }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  area: { height: 330, alignItems: 'center' },
  slot: { position: 'absolute', top: 24 },
  polaroid: {
    width: CARD, backgroundColor: '#fff', paddingTop: 10, paddingHorizontal: 10, borderRadius: 3,
    shadowColor: '#1F2937', shadowOpacity: 0.28, shadowRadius: 14, shadowOffset: { width: 0, height: 8 },
  },
  photo: { width: CARD - 20, height: 170, borderRadius: 2, backgroundColor: colors.line },
  caption: { fontFamily: fonts.hand, fontSize: 21, lineHeight: 23, color: colors.ink, paddingTop: 8, paddingHorizontal: 4 },
  meta: { fontSize: 10, letterSpacing: 1.4, color: colors.scrapInk, paddingHorizontal: 4, paddingTop: 2, paddingBottom: 12 },
  tape: { position: 'absolute', top: -10, left: CARD / 2 - 35, width: 70, height: 22, backgroundColor: 'rgba(245,196,81,0.78)' },
  empty: { width: CARD, height: 250, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.scrapLine, borderRadius: 3, alignItems: 'center', justifyContent: 'center', padding: 20 },
});
