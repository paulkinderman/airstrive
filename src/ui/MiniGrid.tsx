import { View } from 'react-native';
import type { SquareState } from '@/db/repo';
import { colors } from '@/theme';

/** The home-shelf shape: solid color for done, faded for revealed, grey for hidden. Never photos. `ring` outlines one square. */
export function MiniGrid({
  states, cols, color, cell = 6, gap = 2, ring,
}: { states: SquareState[]; cols: number; color: string; cell?: number; gap?: number; ring?: number }) {
  return (
    <View style={{ width: cols * cell + (cols - 1) * gap, flexDirection: 'row', flexWrap: 'wrap', gap }}>
      {states.map((s, i) => (
        <View
          key={i}
          style={[{
            width: cell,
            height: cell,
            borderRadius: Math.max(1.5, cell / 4),
            backgroundColor: s === 'hidden' ? colors.line : color,
            opacity: s === 'revealed' && i !== ring ? 0.35 : 1,
          }, i === ring && { backgroundColor: colors.card, borderWidth: 1.5, borderColor: color }]}
        />
      ))}
    </View>
  );
}
