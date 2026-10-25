import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/ui/Text';
import { colors } from '@/theme';

export default function Atlas() {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: colors.paper, paddingTop: insets.top + 16, paddingHorizontal: 20, gap: 8 }}>
      <Text variant="display">Atlas</Text>
      <Text variant="body" style={{ color: colors.muted }}>
        Browsing, adopting and making grids arrives in the next update. For now, all six starter grids are on your shelf.
      </Text>
    </View>
  );
}
