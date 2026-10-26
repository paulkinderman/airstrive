import { Pressable, View, StyleSheet } from 'react-native';
import { Text } from '@/ui/Text';
import { colors, radius } from '@/theme';
import { AUDIENCES, AUDIENCE_LABEL, AUDIENCE_NOTE, isWider, type Audience } from './audience';

/** Private, Friends or Public as three side-by-side choices. Choices wider than `max` are shown but can't be picked. */
export function AudiencePicker({
  value, onChange, max = 'public', color = colors.ink,
}: { value: Audience; onChange: (a: Audience) => void; max?: Audience; color?: string }) {
  return (
    <View style={styles.row} accessibilityRole="radiogroup">
      {AUDIENCES.map((a) => {
        const off = isWider(a, max);
        const on = value === a;
        return (
          <Pressable
            key={a}
            onPress={() => !off && onChange(a)}
            disabled={off}
            accessibilityRole="radio"
            accessibilityState={{ selected: on, disabled: off }}
            accessibilityLabel={`${AUDIENCE_LABEL[a]}, ${AUDIENCE_NOTE[a]}`}
            style={[styles.option, on && { borderColor: color, borderWidth: 2 }, off && { opacity: 0.4 }]}
          >
            <Text variant="bodyBold" style={{ fontSize: 14 }}>{AUDIENCE_LABEL[a]}</Text>
            <Text variant="caption" style={{ color: colors.muted, textAlign: 'center' }}>{AUDIENCE_NOTE[a]}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8 },
  option: {
    flex: 1, minHeight: 64, paddingHorizontal: 6, paddingVertical: 8, borderRadius: radius.md, borderWidth: 1.5,
    borderColor: colors.lineStrong, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', gap: 2,
  },
});
