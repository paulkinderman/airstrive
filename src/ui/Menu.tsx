import { useEffect, useRef } from 'react';
import { Modal, Platform, Pressable, View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from './Text';
import { colors, radius } from '@/theme';

export interface MenuItem { label: string; onPress: () => void; destructive?: boolean }

/**
 * A small sheet of actions. Alert can't hold more than three buttons on Android.
 * Given an anchor, it drops down from that corner of the screen instead of rising from the bottom.
 *
 * An item's action runs once the sheet has gone. On iOS an Alert or a screen opened while
 * the sheet is still closing never appears, so there it waits for onDismiss.
 */
export function Menu({ visible, title, note, items, onClose, anchor }: {
  visible: boolean; title?: string; note?: string; items: MenuItem[]; onClose: () => void;
  /** Where a dropdown hangs from, measured from the top right of the screen. */
  anchor?: { top: number; right: number };
}) {
  const insets = useSafeAreaInsets();
  const pending = useRef<(() => void) | null>(null);
  const runPending = () => {
    const action = pending.current;
    pending.current = null;
    action?.();
  };
  useEffect(() => {
    if (visible || !pending.current || Platform.OS === 'ios') return;
    const t = setTimeout(runPending, 0);
    return () => clearTimeout(t);
  }, [visible]);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} onDismiss={runPending}>
      <Pressable style={anchor ? styles.clearScrim : styles.scrim} onPress={onClose} accessibilityLabel="Close menu">
        <Pressable
          style={anchor ? [styles.dropdown, { top: anchor.top, right: anchor.right }] : [styles.sheet, { paddingBottom: insets.bottom + 12 }]}
          onPress={() => {}}
        >
          {title || note ? (
            <View style={{ paddingHorizontal: 20, paddingBottom: 8, gap: 4 }}>
              {title ? <Text variant="title">{title}</Text> : null}
              {note ? <Text variant="caption" style={{ color: colors.muted }}>{note}</Text> : null}
            </View>
          ) : null}
          {items.map((it, i) => (
            <Pressable
              key={it.label}
              onPress={() => { pending.current = it.onPress; onClose(); }}
              style={({ pressed }) => [styles.item, anchor && i === 0 && !title && !note && { borderTopWidth: 0 }, pressed && { backgroundColor: colors.paper }]}
            >
              <Text variant="bodyBold" style={{ color: it.destructive ? colors.danger : colors.ink }}>{it.label}</Text>
            </Pressable>
          ))}
          {anchor ? null : (
            <Pressable onPress={onClose} style={styles.item}>
              <Text variant="bodyBold" style={{ color: colors.muted }}>Cancel</Text>
            </Pressable>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(31,41,55,0.35)', justifyContent: 'flex-end' },
  clearScrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.15)' },
  dropdown: {
    position: 'absolute', minWidth: 220, backgroundColor: colors.card, borderRadius: radius.md, paddingVertical: 4,
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 8,
  },
  sheet: { backgroundColor: colors.card, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingTop: 20 },
  item: { minHeight: 52, justifyContent: 'center', paddingHorizontal: 20, borderTopWidth: 1, borderTopColor: colors.line },
});
