import { useCallback, useState } from 'react';
import { View, Pressable, StyleSheet, useWindowDimensions, ScrollView, Alert } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { loadBoard, useFreebie, type BoardSquare } from '@/db/repo';
import { shortDate } from '@/lib/ids';
import { Text } from '@/ui/Text';
import { Tile } from '@/ui/Tile';
import { Button } from '@/ui/Button';
import { colors, radius } from '@/theme';

type Board = NonNullable<Awaited<ReturnType<typeof loadBoard>>>;

export default function GridScreen() {
  const { id, select } = useLocalSearchParams<{ id: string; select?: string }>();
  const db = useSQLiteContext();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [board, setBoard] = useState<Board | null>(null);
  const [selected, setSelected] = useState<string | null>(select ?? null);

  const reload = useCallback(async () => {
    const b = await loadBoard(db, id);
    setBoard(b);
    if (b && !selected) {
      const first = b.squares.find((s) => s.state === 'revealed') ?? b.squares[0];
      setSelected(first?.squareStateId ?? null);
    }
  }, [db, id, selected]);

  useFocusEffect(useCallback(() => { reload(); }, [reload]));

  if (!board) return <View style={{ flex: 1, backgroundColor: colors.paper }} />;

  const gap = 6;
  const cell = Math.floor((width - 40 - gap * (board.cols - 1)) / board.cols);
  const sq = board.squares.find((s) => s.squareStateId === selected) ?? null;
  const doneCount = board.squares.filter((s) => s.state === 'done').length;
  const revealedCount = board.squares.filter((s) => s.state === 'revealed').length;

  const onFreebie = async (s: BoardSquare) => {
    if (board.freebiesLeft < 1) { Alert.alert('No freebies left', 'This grid has used all of its freebies.'); return; }
    Alert.alert('Use a freebie?', `This marks "${s.prompt}" done without a moment and reveals its neighbors.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Use it', onPress: async () => { await useFreebie(db, s.squareStateId); reload(); } },
    ]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.paper }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: 260 }}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.iconButton} accessibilityLabel="Back">
            <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={colors.ink} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"><Path d="M15 5l-7 7 7 7" /></Svg>
          </Pressable>
          <Text variant="label">Grid</Text>
          <View style={styles.iconButton} />
        </View>

        <View style={{ paddingHorizontal: 20, gap: 4 }}>
          <Text variant="display">{board.title}</Text>
          <Text variant="body" style={{ fontSize: 14, color: colors.muted }}>
            {doneCount} moment{doneCount === 1 ? '' : 's'} · {revealedCount} revealed · {board.freebiesLeft} freebie{board.freebiesLeft === 1 ? '' : 's'} left
          </Text>
        </View>

        <View style={{ paddingHorizontal: 20, paddingTop: 18, flexDirection: 'row', flexWrap: 'wrap', gap }}>
          {board.squares.map((s) => (
            <Tile key={s.squareStateId} square={s} size={cell} color={board.color} selected={s.squareStateId === selected} onPress={() => setSelected(s.squareStateId)} />
          ))}
        </View>

        <View style={{ paddingHorizontal: 20, paddingTop: 16, flexDirection: 'row', gap: 14, flexWrap: 'wrap' }}>
          <Legend swatch={{ backgroundColor: board.color }} label="Done" />
          <Legend swatch={{ backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.lineStrong }} label="Revealed" />
          <Legend swatch={{ backgroundColor: colors.tileHidden }} label="Hidden" />
        </View>
      </ScrollView>

      {sq && (
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.grabber} />
          {sq.state === 'hidden' && (
            <>
              <Text variant="label">Hidden square</Text>
              <Text variant="title" style={{ fontSize: 22 }}>Still a mystery</Text>
              <Text variant="body" style={{ fontSize: 14, color: colors.muted }}>Finish one of the squares next to it to find out what this one is.</Text>
            </>
          )}
          {sq.state === 'revealed' && (
            <>
              <Text variant="label">Square {sq.idx + 1} · {sq.cluster}</Text>
              <Text variant="title" style={{ fontSize: 22 }}>{sq.prompt}</Text>
              {sq.hint ? <Text variant="body" style={{ fontSize: 14, color: colors.muted }}>{sq.hint}</Text> : null}
              <View style={{ flexDirection: 'row', gap: 10, paddingTop: 4 }}>
                <Button label="I did this" color={board.color} onPress={() => router.push({ pathname: '/moment/[squareId]', params: { squareId: sq.squareStateId } })} style={{ flex: 1 }} />
                <Button label="Freebie" kind="secondary" onPress={() => onFreebie(sq)} style={{ flex: 0.6 }} disabled={board.freebiesLeft < 1} />
              </View>
            </>
          )}
          {sq.state === 'done' && (
            <>
              <Text variant="label" style={{ color: colors.accentDeep }}>{sq.viaFreebie ? 'Done · freebie' : 'Done'}</Text>
              <Text variant="title" style={{ fontSize: 22 }}>{sq.prompt}</Text>
              <DoneDetail square={sq} />
              <View style={{ flexDirection: 'row', gap: 10, paddingTop: 4 }}>
                {sq.momentId ? (
                  <>
                    <Button label="Open the page" kind="secondary" onPress={() => router.push({ pathname: '/lane/[momentId]', params: { momentId: sq.momentId! } })} style={{ flex: 1 }} />
                    <Button label="Edit" color={board.color} onPress={() => router.push({ pathname: '/moment/[squareId]', params: { squareId: sq.squareStateId } })} style={{ flex: 1 }} />
                  </>
                ) : (
                  <Button label="Add a moment anyway" color={board.color} onPress={() => router.push({ pathname: '/moment/[squareId]', params: { squareId: sq.squareStateId } })} style={{ flex: 1 }} />
                )}
              </View>
            </>
          )}
        </View>
      )}
    </View>
  );
}

function DoneDetail({ square }: { square: BoardSquare }) {
  const db = useSQLiteContext();
  const [line, setLine] = useState('');
  useFocusEffect(
    useCallback(() => {
      if (!square.momentId) { setLine('Completed with a freebie. You can still add a moment.'); return; }
      db.getFirstAsync<{ happened_on: string; body: string }>('SELECT happened_on, body FROM moments WHERE id = ?', square.momentId)
        .then((m) => m && setLine(`${shortDate(m.happened_on)}${m.body ? ' · ' + m.body.slice(0, 90) + (m.body.length > 90 ? '…' : '') : ''}`));
    }, [db, square.momentId]),
  );
  return <Text variant="body" style={{ fontSize: 14, color: colors.muted }}>{line}</Text>;
}

function Legend({ swatch, label }: { swatch: object; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={[{ width: 12, height: 12, borderRadius: 4 }, swatch]} />
      <Text variant="caption" style={{ color: colors.muted, fontFamily: 'Nunito_700Bold' }}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10, paddingBottom: 6 },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  sheet: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    backgroundColor: colors.card, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl,
    paddingHorizontal: 20, paddingTop: 12, gap: 8,
    shadowColor: colors.ink, shadowOpacity: 0.12, shadowRadius: 20, shadowOffset: { width: 0, height: -6 }, elevation: 12,
  },
  grabber: { width: 40, height: 5, borderRadius: 3, backgroundColor: colors.line, alignSelf: 'center', marginBottom: 6 },
});
