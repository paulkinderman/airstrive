import { Modal, Pressable, View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from './Text';
import { colors, radius } from '@/theme';

export interface MenuItem { label: string; onPress: () => void; destructive?: boolean }

/** A small sheet of actions. Alert can't hold more than three buttons on Android. */
export function Menu({ visible, title, note, items, onClose }: { visible: boolean; title: string; note?: string; items: MenuItem[]; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close menu">
        <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]} onPress={() => {}}>
          <View style={{ paddingHorizontal: 20, paddingBottom: 8, gap: 4 }}>
            <Text variant="title">{title}</Text>
            {note ? <Text variant="caption" style={{ color: colors.muted }}>{note}</Text> : null}
          </View>
          {items.map((it) => (
            <Pressable
              key={it.label}
              onPress={() => { onClose(); it.onPress(); }}
              style={({ pressed }) => [styles.item, pressed && { backgroundColor: colors.paper }]}
            >
              <Text variant="bodyBold" style={{ color: it.destructive ? colors.danger : colors.ink }}>{it.label}</Text>
            </Pressable>
          ))}
          <Pressable onPress={onClose} style={styles.item}>
            <Text variant="bodyBold" style={{ color: colors.muted }}>Cancel</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(31,41,55,0.35)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.card, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingTop: 20 },
  item: { minHeight: 52, justifyContent: 'center', paddingHorizontal: 20, borderTopWidth: 1, borderTopColor: colors.line },
});
