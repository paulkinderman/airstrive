import type { ReactNode } from 'react';
import { ScrollView, View, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { SIZES, startingSquares } from '@/data/types';
import { Text } from '@/ui/Text';
import { colors, radius } from '@/theme';
import type { AtlasGrid } from './picks';

/**
 * The grid preview from the design: a colored header, a peek at the board with the
 * starting squares outlined, and the first prompts you'd start with. The buttons along
 * the bottom come from whoever shows it (the Atlas or onboarding).
 */
export function GridPreview({
  grid, onBack, footer, headerAction,
}: { grid: AtlasGrid; onBack: () => void; footer: ReactNode; headerAction?: ReactNode }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { cols, rows, freebies } = SIZES[grid.size];
  const start = new Set(startingSquares(grid.size));
  const gap = 5;
  const cell = Math.min(30, Math.floor((width - 40 - gap * (cols - 1)) / cols));
  const by = grid.isOfficial ? 'AirStrive' : grid.madeBy;

  return (
    <View style={{ flex: 1, backgroundColor: colors.paper }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        <View style={[styles.header, { backgroundColor: grid.color, paddingTop: insets.top + 8 }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Pressable onPress={onBack} style={styles.icon} accessibilityLabel="Back">
              <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"><Path d="M15 5l-7 7 7 7" /></Svg>
            </Pressable>
            {headerAction ?? <View style={styles.icon} />}
          </View>
          <Text variant="label" style={{ color: '#fff', opacity: 0.9 }}>{grid.theme} · by {by}</Text>
          <Text variant="display" style={{ color: '#fff', fontSize: 34, lineHeight: 37 }}>{grid.title}</Text>
          {grid.description ? <Text variant="body" style={{ color: '#fff', opacity: 0.95, lineHeight: 21 }}>{grid.description}</Text> : null}
          <Text variant="bodyBold" style={{ color: '#fff', opacity: 0.9, fontSize: 13 }}>
            {SIZES[grid.size].label} · {cols * rows} squares · {freebies} freebie{freebies === 1 ? '' : 's'}
          </Text>
        </View>

        <View style={{ padding: 20, gap: 10 }}>
          <Text variant="label">A peek at the board</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap, width: cols * cell + (cols - 1) * gap }}>
            {Array.from({ length: cols * rows }, (_, i) => (
              <View
                key={i}
                style={{
                  width: cell, height: cell, borderRadius: Math.max(4, cell * 0.27),
                  backgroundColor: start.has(i) ? colors.card : colors.tileHidden,
                  borderWidth: start.has(i) ? 1.5 : 0, borderColor: grid.color,
                }}
              />
            ))}
          </View>
          <Text variant="caption">
            You start with the {grid.size === 'tiny' ? 'two middle squares' : 'four center squares'} revealed. The rest you find.
          </Text>
        </View>

        {grid.starters.length > 0 && (
          <View style={{ paddingHorizontal: 20, gap: 10 }}>
            <Text variant="label">Your first {grid.size === 'tiny' ? 'two' : 'four'}</Text>
            {grid.starters.map((s) => (
              <View key={s} style={styles.starter}>
                <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: grid.color }} />
                <Text variant="bodyBold" style={{ flex: 1 }}>{s}</Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>{footer}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingBottom: 22, gap: 8 },
  icon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginHorizontal: -10 },
  starter: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14, borderRadius: radius.lg, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, minHeight: 48 },
  footer: { paddingHorizontal: 20, paddingTop: 12, backgroundColor: colors.card, borderTopWidth: 1, borderTopColor: colors.line, flexDirection: 'row', gap: 10 },
});
