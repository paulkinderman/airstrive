import type { ReactNode } from 'react';
import { View } from 'react-native';
import Svg, { Circle, G, Path, Rect } from 'react-native-svg';
import { Text } from '@/ui/Text';
import { colors } from '@/theme';

// Logo direction C: a 3×3 grid with the top-middle square lit (the sun) and its two
// neighbors revealed. Same geometry as the app icon, cropped to the grid.
const CELL = 176;
const STEP = 217.9;
const LIT = 1;
const REVEALED = [3, 5];

export function Logo({ size = 88 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 611.8 611.8" accessibilityLabel="AirStrive logo">
      {Array.from({ length: 9 }, (_, i) => {
        const x = (i % 3) * STEP;
        const y = Math.floor(i / 3) * STEP;
        const on = i === LIT || REVEALED.includes(i);
        return (
          <Rect
            key={i} x={x} y={y} width={CELL} height={CELL} rx={46}
            fill={on ? colors.accent : colors.line} fillOpacity={REVEALED.includes(i) ? 0.55 : 1}
          />
        );
      })}
      <G transform={`translate(${STEP + 37.7} 37.7) scale(4.19)`}>
        <Circle cx={12} cy={12} r={5} fill="#FFFFFF" />
        <Path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2" stroke="#FFFFFF" strokeWidth={2.5} strokeLinecap="round" fill="none" />
      </G>
    </Svg>
  );
}

/**
 * Logo, name and slogan, centered. Every brand screen uses this so the logo sits in the
 * same place from launch to sign-in. Anything passed as children goes under the slogan.
 */
export function Brand({ children, textHidden = false }: { children?: ReactNode; textHidden?: boolean }) {
  return (
    <View style={{ alignSelf: 'stretch', alignItems: 'center', gap: 14 }}>
      <Logo />
      {/* Hidden (not removed) until the fonts load, so the logo doesn't move when they arrive. */}
      <View style={{ alignItems: 'center', opacity: textHidden ? 0 : 1 }}>
        <Text variant="display" style={{ fontSize: 44, lineHeight: 52, paddingTop: 6 }}>
          Air<Text variant="display" style={{ fontSize: 44, lineHeight: 52, color: colors.accent }}>Strive</Text>
        </Text>
        <Text variant="hand" style={{ fontSize: 30, lineHeight: 38, color: colors.muted }}>Moments over metrics.</Text>
      </View>
      {children}
    </View>
  );
}

/** A full brand-only screen: launch, loading and setup. */
export function BrandScreen({ children, textHidden }: { children?: ReactNode; textHidden?: boolean }) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.paper, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
      <Brand textHidden={textHidden}>{children}</Brand>
    </View>
  );
}
