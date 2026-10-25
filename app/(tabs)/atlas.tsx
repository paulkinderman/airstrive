import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/ui/Text';
import { colors } from '@/theme';

export default function Atlas() {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: colors.paper, paddingTop: insets.top + 16, paddingHorizontal: 20, gap: 8 }}>
      <Text variant="display">Atlas</Text>
      <Text variant="body" style={{ color: colors.muted }}>Browsing and making grids arrives in v2. For now, Running is on your shelf.</Text>
    </View>
  );
}
