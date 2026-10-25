import { Pressable, StyleSheet, ViewStyle } from 'react-native';
import { Text } from './Text';
import { colors, radius } from '@/theme';

type Kind = 'primary' | 'secondary' | 'quiet' | 'danger';

export function Button({
  label, onPress, kind = 'primary', style, disabled, color,
}: { label: string; onPress: () => void; kind?: Kind; style?: ViewStyle; disabled?: boolean; color?: string }) {
  const bg = kind === 'primary' ? (color ?? colors.accent) : kind === 'secondary' ? colors.card : 'transparent';
  const fg = kind === 'danger' ? colors.danger : kind === 'quiet' ? colors.muted : colors.ink;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: bg, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 },
        kind === 'secondary' && styles.outline,
        kind === 'quiet' || kind === 'danger' ? styles.flat : null,
        style,
      ]}
    >
      <Text variant="bodyBold" style={{ color: fg }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { height: 50, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  outline: { borderWidth: 1.5, borderColor: colors.lineStrong },
  flat: { height: 44, paddingHorizontal: 8 },
});
