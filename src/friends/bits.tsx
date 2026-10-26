import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Text } from '@/ui/Text';
import { colors } from '@/theme';

/** A person's first letter in a rounded square, in place of a photo. */
export function Initial({ name, size = 36 }: { name: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 3, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' }}>
      <Text variant="bodyBold" style={{ color: '#fff', fontSize: size * 0.45, lineHeight: size * 0.6 }}>{name.slice(0, 1).toUpperCase()}</Text>
    </View>
  );
}

export function Chevron() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={colors.faint} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M9 6l6 6-6 6" />
    </Svg>
  );
}

export function BackIcon({ color = colors.ink }: { color?: string }) {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"><Path d="M15 5l-7 7 7 7" /></Svg>
  );
}
