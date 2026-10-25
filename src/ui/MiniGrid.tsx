import { View } from 'react-native';
import type { SquareState } from '@/db/repo';
import { colors } from '@/theme';

/** The home-shelf shape: solid color for done, faded for revealed, grey for hidden. Never photos. */
export function MiniGrid({
  states, cols, color, cell = 6, gap = 2,
}: { states: SquareState[]; cols: number; color: string; cell?: number; gap?: number }) {
  return (
    <View style={{ width: cols * cell + (cols - 1) * gap, flexDirection: 'row', flexWrap: 'wrap', gap }}>
      {states.map((s, i) => (
        <View
          key={i}
          style={{
            width: cell,
            height: cell,
            borderRadius: Math.max(1.5, cell / 4),
            backgroundColor: s === 'hidden' ? colors.line : color,
            opacity: s === 'revealed' ? 0.35 : 1,
          }}
        />
      ))}
    </View>
  );
}
