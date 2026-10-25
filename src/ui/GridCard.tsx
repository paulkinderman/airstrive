import { Pressable, View, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import type { AtlasGrid } from '@/atlas/picks';
import { Text } from './Text';
import { colors, radius } from '@/theme';

/** An Atlas card: the grid's color, name, its first prompts and who made it. */
export function GridCard({
  grid, onPress, selected, onToggle, width = 168,
}: { grid: AtlasGrid; onPress: () => void; selected?: boolean; onToggle?: () => void; width?: number }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, { width }, selected && { borderColor: grid.color, borderWidth: 2 }, pressed && { opacity: 0.9 }]}
      accessibilityRole="button"
      accessibilityLabel={`${grid.title}, ${grid.isOfficial ? 'by AirStrive' : `by ${grid.madeBy}`}`}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ width: 12, height: 12, borderRadius: 4, backgroundColor: grid.color }} />
        <Text variant="title" numberOfLines={2} style={{ fontSize: 18, lineHeight: 21, flex: 1 }}>{grid.title}</Text>
      </View>
      <Text variant="bodyBold" numberOfLines={3} style={{ fontSize: 12, lineHeight: 17, color: colors.muted }}>
        {grid.starters.slice(0, 3).join(' · ') || grid.description}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto' }}>
        <Text variant="bodyBold" numberOfLines={1} style={{ fontSize: 11, color: grid.isOfficial ? colors.faint : colors.accentDeep, flex: 1 }}>
          by {grid.isOfficial ? 'AirStrive' : grid.madeBy}
        </Text>
        {onToggle && (
          <Pressable
            onPress={onToggle}
            hitSlop={10}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: !!selected }}
            accessibilityLabel={selected ? `Remove ${grid.title}` : `Add ${grid.title}`}
            style={[styles.check, selected ? { backgroundColor: grid.color, borderColor: grid.color } : null]}
          >
            {selected ? (
              <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"><Path d="M5 12l5 5 9-10" /></Svg>
            ) : (
              <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={colors.ink} strokeWidth={2.6} strokeLinecap="round"><Path d="M12 5v14M5 12h14" /></Svg>
            )}
          </Pressable>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { minHeight: 132, padding: 14, borderRadius: radius.lg, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, gap: 8 },
  check: { width: 30, height: 30, borderRadius: 10, borderWidth: 1.5, borderColor: colors.lineStrong, alignItems: 'center', justifyContent: 'center' },
});
