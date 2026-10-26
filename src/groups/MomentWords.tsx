import { View, type TextStyle } from 'react-native';
import type { Moment } from '@/db/repo';
import { Text } from '@/ui/Text';
import { colors } from '@/theme';

/** A moment's words: on a group grid, everyone's entry under their name. */
export function MomentWords({ moment, style, size }: { moment: Moment; style?: TextStyle | false; size?: number }) {
  const hand = [size ? { fontSize: size, lineHeight: size * 1.25 } : null, style || null];
  if (moment.groupId && moment.entries.length > 0) {
    return (
      <>
        {moment.entries.map((e, i) => (
          <View key={i} style={{ gap: 2 }}>
            <Text variant="label" style={{ fontSize: 11, letterSpacing: 1.2, color: colors.scrapInk }}>{e.name}</Text>
            <Text variant="hand" style={hand}>{e.body}</Text>
          </View>
        ))}
      </>
    );
  }
  if (moment.body) return <Text variant="hand" style={hand}>{moment.body}</Text>;
  return null;
}
