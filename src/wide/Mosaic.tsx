import { useEffect } from 'react';
import { Modal, Platform, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import type { BoardSquare } from '@/db/repo';
import { Tile } from '@/ui/Tile';
import { Text } from '@/ui/Text';
import { colors } from '@/theme';

/**
 * The whole grid filling the window on a dark wall, photos drifting between each other.
 * Hidden squares stay quiet and revealed ones glow faintly, so a half-done grid still reads.
 */
export function Mosaic({
  visible, title, color, cols, squares, onClose,
}: { visible: boolean; title: string; color: string; cols: number; squares: BoardSquare[]; onClose: () => void }) {
  const { width, height } = useWindowDimensions();
  const rows = Math.ceil(squares.length / cols);
  const gap = cols >= 10 ? 5 : 7;
  const cell = Math.floor(Math.min((width - 96 - gap * (cols - 1)) / cols, (height - 150 - gap * (rows - 1)) / rows));
  const done = squares.filter((s) => s.state === 'done').length;

  useEffect(() => {
    if (!visible || Platform.OS !== 'web') return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [visible, onClose]);

  const fullscreen = () => {
    if (Platform.OS !== 'web') return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.();
  };

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={styles.wall}>
        <View style={styles.top}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: color }} />
            <Text variant="title" style={{ color: '#fff' }}>{title}</Text>
            <Text variant="bodyBold" style={{ color: '#8B93A1', fontSize: 14 }}>{done} of {squares.length}</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {Platform.OS === 'web' && (
              <Pressable onPress={fullscreen} style={styles.button} accessibilityLabel="Full screen">
                <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#C9CED6" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                  <Path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
                </Svg>
              </Pressable>
            )}
            <Pressable onPress={onClose} style={styles.button} accessibilityLabel="Close mosaic">
              <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#C9CED6" strokeWidth={2.4} strokeLinecap="round"><Path d="M6 6l12 12M18 6L6 18" /></Svg>
            </Pressable>
          </View>
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: cols * cell + (cols - 1) * gap, flexDirection: 'row', flexWrap: 'wrap', gap }}>
            {squares.map((s) =>
              s.state === 'done' ? (
                <Tile key={s.squareStateId} square={s} size={cell} color={color} selected={false} onPress={() => {}} />
              ) : (
                <View
                  key={s.squareStateId}
                  style={{
                    width: cell, height: cell, borderRadius: Math.max(6, cell * 0.27),
                    backgroundColor: s.state === 'hidden' ? 'rgba(255,255,255,0.05)' : color,
                    opacity: s.state === 'revealed' ? 0.22 : 1,
                  }}
                />
              ),
            )}
          </View>
        </View>
        <Text variant="hand" style={{ color: '#8B93A1', textAlign: 'center', fontSize: 22, paddingBottom: 18 }}>
          {done === squares.length ? 'Every square, a moment.' : 'Still filling in.'}
        </Text>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wall: { flex: 1, backgroundColor: colors.night },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 28, paddingTop: 18, paddingBottom: 10 },
  button: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
});
