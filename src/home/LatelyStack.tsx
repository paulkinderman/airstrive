import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import type { Moment } from '@/db/repo';
import { Text } from '@/ui/Text';
import { colors, fonts } from '@/theme';

/** How many polaroids are drawn at once; the rest wait their turn underneath. */
const DRAWN = 4;

/** A steady tilt and nudge per moment, so a photo keeps its angle as the stack moves. */
function lean(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  const r = (n: number) => ((h >>> n) % 1000) / 1000;
  return { rotate: (r(0) - 0.5) * 16, x: (r(3) - 0.5) * 36, y: (r(6) - 0.5) * 8, tape: (r(9) - 0.5) * 10 };
}

function shortDate(day: string) {
  return new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * Your newest moments as taped polaroids, newest on top. A quick sideways swipe flicks the top
 * photo away to show the one underneath, and it rejoins the stack at the bottom. Tap to open it.
 */
export function LatelyStack({ moments, onOpen }: { moments: Moment[]; onOpen: (momentId: string) => void }) {
  const [order, setOrder] = useState(moments);
  useEffect(() => setOrder(moments), [moments]);
  const pan = useRef(new Animated.ValueXY()).current;
  const busy = useRef(false);
  const sideways = useRef(false);
  // The responder is made once, so it reads the current stack and handler through refs.
  const latest = useRef({ order, onOpen });
  latest.current = { order, onOpen };

  // The stack owns the touch from the start, so a tap opens the top photo; it lets go to the
  // screen's scroll until the drag turns sideways, then keeps it for the flick.
  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => !busy.current,
    onPanResponderGrant: () => { sideways.current = false; },
    onPanResponderMove: (_, g) => {
      if (!sideways.current && Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy)) sideways.current = true;
      pan.setValue({ x: g.dx, y: sideways.current ? g.dy : 0 });
    },
    onPanResponderTerminationRequest: () => !sideways.current,
    onPanResponderRelease: (_, g) => {
      const dist = Math.hypot(g.dx, g.dy);
      if (dist < 8) {
        pan.setValue({ x: 0, y: 0 });
        const top = latest.current.order[0];
        if (top) latest.current.onOpen(top.id);
      } else if (sideways.current && latest.current.order.length > 1 && (Math.hypot(g.vx, g.vy) > 0.5 || dist > 110)) {
        busy.current = true;
        const k = 520 / Math.max(dist, 1);
        Animated.timing(pan, { toValue: { x: g.dx * k, y: g.dy * k }, duration: 260, useNativeDriver: false }).start(() => {
          // The flicked photo stays off-screen until the reordered stack renders (below);
          // resetting the offset here would put it back on top for a frame.
          setOrder((o) => [...o.slice(1), o[0]]);
        });
      } else {
        Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: false }).start();
      }
    },
    onPanResponderTerminate: () => Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: false }).start(),
  }), [pan]);

  // Once the new top photo is in place, bring the offset back, before the screen paints.
  useLayoutEffect(() => {
    pan.setValue({ x: 0, y: 0 });
    busy.current = false;
  }, [order, pan]);

  const spin = pan.x.interpolate({ inputRange: [-300, 300], outputRange: ['-25deg', '25deg'] });
  const drawn = order.slice(0, DRAWN).reverse();

  return (
    <View style={styles.stack} {...responder.panHandlers}>
      {drawn.map((m, i) => {
        const isTop = i === drawn.length - 1;
        const l = lean(m.id);
        const photo = m.photos.find((p) => p.isCover) ?? m.photos[0];
        // No pointer events inside: on the web a photo would start a native image drag and cancel the flick.
        const card = (
          <View pointerEvents="none" style={styles.polaroid}>
            <View style={[styles.tape, { transform: [{ rotate: `${l.tape}deg` }] }]} />
            {photo
              ? <Image source={photo.uri} cachePolicy="disk" contentFit="cover" style={styles.photo} />
              : <View style={[styles.photo, { backgroundColor: m.fill.startsWith('#') ? m.fill : m.gridColor }]} />}
            <Text variant="hand" numberOfLines={2} style={styles.caption}>{m.title || m.prompt}</Text>
            <Text variant="label" numberOfLines={1} style={styles.meta}>{m.gridTitle} · {shortDate(m.happenedOn)}</Text>
          </View>
        );
        const tilt = [{ translateX: l.x }, { translateY: l.y }, { rotate: `${l.rotate}deg` }];
        if (!isTop) return <View key={m.id} pointerEvents="none" style={[styles.slot, { transform: tilt }]}>{card}</View>;
        return (
          <Animated.View
            key={m.id}
            accessible
            accessibilityRole="button"
            accessibilityLabel={`Open ${m.title || m.prompt}`}
            accessibilityHint="Swipe sideways to see the next photo"
            accessibilityActions={[{ name: 'activate' }]}
            onAccessibilityAction={() => onOpen(m.id)}
            style={[styles.slot, { transform: [...pan.getTranslateTransform(), { rotate: spin }, ...tilt] }]}>
            {card}
          </Animated.View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  // No text selection: on the web, dragging across the caption would select it and cancel the flick.
  stack: { height: 250, alignItems: 'center', userSelect: 'none' },
  slot: { position: 'absolute', top: 16 },
  polaroid: {
    width: 176, padding: 8, paddingBottom: 0, borderRadius: 3, backgroundColor: '#fff',
    shadowColor: colors.ink, shadowOpacity: 0.25, shadowRadius: 10, shadowOffset: { width: 0, height: 6 }, elevation: 4,
  },
  photo: { height: 132, borderRadius: 2, backgroundColor: colors.tileHidden },
  tape: { position: 'absolute', zIndex: 1, top: -9, left: 58, width: 60, height: 20, backgroundColor: 'rgba(245,196,81,0.78)' },
  caption: { fontSize: 19, lineHeight: 20, paddingTop: 7, paddingHorizontal: 3 },
  meta: { fontFamily: fonts.bodyBold, fontSize: 10, letterSpacing: 1.2, color: colors.scrapInk, paddingHorizontal: 3, paddingTop: 2, paddingBottom: 10 },
});
