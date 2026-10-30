import { useCallback, useRef, useState } from 'react';
import { View, Pressable, StyleSheet, useWindowDimensions, ScrollView, Alert } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Circle } from 'react-native-svg';
import { loadBoard, spendFreebie, removeFromShelf, hasMoments, setGridShared, getMomentForSquare, type BoardSquare } from '@/db/repo';
import { useSync } from '@/sync/SyncProvider';
import { useAuth } from '@/auth/AuthProvider';
import { useDataVersion } from '@/sync/events';
import { shortDate } from '@/lib/ids';
import { Text } from '@/ui/Text';
import { Tile } from '@/ui/Tile';
import { Button } from '@/ui/Button';
import { Menu, type MenuItem } from '@/ui/Menu';
import { useWideLayout } from '@/ui/wide';
import { WideGrid } from '@/wide/WideGrid';
import { GridAudienceMenu } from '@/friends/GridAudienceMenu';
import { AUDIENCE_LABEL, gridAudienceLine } from '@/friends/audience';
import { startTogether } from '@/groups/startTogether';
import { useTogetherLine } from '@/groups/useTogetherLine';
import { colors, radius } from '@/theme';

type Board = NonNullable<Awaited<ReturnType<typeof loadBoard>>>;

export default function GridScreen() {
  const { id, select } = useLocalSearchParams<{ id: string; select?: string }>();
  return useWideLayout() ? <WideGrid id={id} select={select} /> : <PhoneGrid id={id} select={select} />;
}

function PhoneGrid({ id, select }: { id: string; select?: string }) {
  const db = useSQLiteContext();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [board, setBoard] = useState<Board | null>(null);
  const [selected, setSelected] = useState<string | null>(select ?? null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [audienceOpen, setAudienceOpen] = useState(false);
  const sync = useSync();
  const { userId, configured } = useAuth();
  const version = useDataVersion();
  const together = useTogetherLine(board?.groupId ?? null);

  // A square is picked for you once, on an unfinished grid. A finished grid opens on the whole board,
  // and a square you put down stays down.
  const autoPicked = useRef(!!select);

  const reload = useCallback(async () => {
    const b = await loadBoard(db, id);
    setBoard(b);
    if (b && !autoPicked.current) {
      autoPicked.current = true;
      if (!b.completedAt) {
        const first = b.squares.find((s) => s.state === 'revealed') ?? b.squares[0];
        setSelected(first?.squareStateId ?? null);
      }
    }
    return b;
  }, [db, id, version]);

  // Coming back to a group grid checks for what the others added.
  useFocusEffect(useCallback(() => { void reload().then((b) => { if (b?.groupId) sync.request(); }); }, [reload]));

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
      {
        text: 'Use it',
        onPress: async () => {
          const r = await spendFreebie(db, s.squareStateId);
          sync.request();
          if (r?.completedGrid) router.push({ pathname: '/lane/chapter/[userGridId]', params: { userGridId: r.completedGrid } });
          else reload();
        },
      },
    ]);
  };

  const mine = !!board.authorId && board.authorId === userId;

  const onRemove = async () => {
    if (await hasMoments(db, id)) {
      Alert.alert('This grid has moments', 'Grids with moments stay on your shelf so nothing in Memory Lane goes missing.');
      return;
    }
    Alert.alert(`Remove ${board.title}?`, 'It comes off your shelf. You can add it again from the Atlas any time.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive',
        onPress: async () => { await removeFromShelf(db, id); sync.request(); router.back(); },
      },
    ]);
  };

  const onShare = async () => {
    await setGridShared(db, board.gridId, !board.isPublic);
    sync.request();
    reload();
  };

  const openTogether = () => router.push({ pathname: '/together/[groupId]', params: { groupId: id } });
  const menuItems: MenuItem[] = board.groupId ? [
    { label: 'People in this grid', onPress: openTogether },
    ...(mine ? [{ label: board.isPublic ? 'Stop sharing to the Atlas' : 'Share to the Atlas', onPress: onShare }] : []),
    { label: 'Preview and copy', onPress: () => router.push({ pathname: '/atlas/[gridId]', params: { gridId: board.gridId } }) },
    { label: 'Leave this grid', destructive: true, onPress: openTogether },
  ] : [
    { label: `Who can see this: ${AUDIENCE_LABEL[board.audience]}`, onPress: () => setAudienceOpen(true) },
    ...(configured ? [{ label: 'Do this together', onPress: () => void startTogether(db, router, id) }] : []),
    ...(mine ? [{ label: board.isPublic ? 'Stop sharing to the Atlas' : 'Share to the Atlas', onPress: onShare }] : []),
    { label: 'Preview and copy', onPress: () => router.push({ pathname: '/atlas/[gridId]', params: { gridId: board.gridId } }) },
    { label: 'Remove from your grids', destructive: true, onPress: onRemove },
  ];
  const onMenu = () => setMenuOpen(true);

  return (
    <View style={{ flex: 1, backgroundColor: colors.paper }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: sq ? 260 : insets.bottom + 24 }}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.iconButton} accessibilityLabel="Back">
            <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={colors.ink} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"><Path d="M15 5l-7 7 7 7" /></Svg>
          </Pressable>
          <Text variant="label">Grid</Text>
          <View style={{ flexDirection: 'row' }}>
          <Pressable onPress={onMenu} style={styles.iconButton} accessibilityLabel="More">
            <Svg width={22} height={22} viewBox="0 0 24 24" fill={colors.ink}>
              <Circle cx={5} cy={12} r={2} /><Circle cx={12} cy={12} r={2} /><Circle cx={19} cy={12} r={2} />
            </Svg>
          </Pressable>
          {board.completedAt ? (
            <Pressable onPress={() => router.push({ pathname: '/lane/chapter/[userGridId]', params: { userGridId: id } })} style={styles.iconButton} accessibilityLabel="Chapter cover">
              <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={colors.ink} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                <Path d="M4 4h7a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H4z" /><Path d="M20 4h-7a3 3 0 0 0-3 3v13a2 2 0 0 1 2-2h8z" />
              </Svg>
            </Pressable>
          ) : null}
          </View>
        </View>

        <View style={{ paddingHorizontal: 20, gap: 4 }}>
          <Text variant="display">{board.title}</Text>
          <Text variant="body" style={{ fontSize: 14, color: colors.muted }}>
            {doneCount} moment{doneCount === 1 ? '' : 's'} · {revealedCount} revealed · {board.freebiesLeft} freebie{board.freebiesLeft === 1 ? '' : 's'} left
          </Text>
          {together ? (
            <Pressable onPress={openTogether} accessibilityRole="button">
              <Text variant="caption" style={{ color: colors.accentDeep, fontFamily: 'Nunito_700Bold' }}>{together === 'Just you so far' ? 'Just you so far · invite a friend' : `${together} · only the group sees this grid`}</Text>
            </Pressable>
          ) : board.audience !== 'private' && (
            <Pressable onPress={() => setAudienceOpen(true)} accessibilityRole="button">
              <Text variant="caption" style={{ color: colors.accentDeep, fontFamily: 'Nunito_700Bold' }}>{gridAudienceLine(board.audience)}</Text>
            </Pressable>
          )}
        </View>

        <View style={{ paddingHorizontal: 20, paddingTop: 18, flexDirection: 'row', flexWrap: 'wrap', gap }}>
          {board.squares.map((s) => (
            <Tile key={s.squareStateId} square={s} size={cell} color={board.color} selected={s.squareStateId === selected} onPress={() => setSelected((cur) => (cur === s.squareStateId ? null : s.squareStateId))} />
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
          <Pressable onPress={() => setSelected(null)} style={styles.close} accessibilityLabel="Close" hitSlop={8}>
            <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={colors.muted} strokeWidth={2.4} strokeLinecap="round"><Path d="M6 6l12 12M18 6L6 18" /></Svg>
          </Pressable>
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
      <Menu
        visible={menuOpen}
        title={board.title}
        note={mine ? (board.isPublic ? 'Its squares are in the Atlas. People who added it keep it if you stop sharing.' : 'Its squares are only on your shelf.') : undefined}
        items={menuItems}
        onClose={() => setMenuOpen(false)}
      />
      <GridAudienceMenu visible={audienceOpen} userGridId={id} current={board.audience} onClose={() => setAudienceOpen(false)} onChanged={reload} />
    </View>
  );
}

function DoneDetail({ square }: { square: BoardSquare }) {
  const db = useSQLiteContext();
  const version = useDataVersion();
  const [lines, setLines] = useState<string[]>([]);
  useFocusEffect(
    useCallback(() => {
      if (!square.momentId) { setLines(['Completed with a freebie. You can still add a moment.']); return; }
      getMomentForSquare(db, square.squareStateId).then((m) => {
        if (!m) return;
        const cut = (t: string, n: number) => (t.length > n ? t.slice(0, n) + '…' : t);
        const date = shortDate(m.happenedOn);
        // On a group grid, a line for each person who wrote something.
        if (m.groupId && m.entries.length > 0) setLines([date, ...m.entries.map((e) => `${e.name}: ${cut(e.body, 70)}`)]);
        else setLines([`${date}${m.body ? ' · ' + cut(m.body, 90) : ''}`]);
      });
    }, [db, square.momentId, square.squareStateId, version]),
  );
  return (
    <View style={{ gap: 2 }}>
      {lines.map((l, i) => <Text key={i} variant="body" style={{ fontSize: 14, color: colors.muted }}>{l}</Text>)}
    </View>
  );
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
  close: { position: 'absolute', top: 8, right: 8, width: 40, height: 40, alignItems: 'center', justifyContent: 'center', zIndex: 1 },
});
