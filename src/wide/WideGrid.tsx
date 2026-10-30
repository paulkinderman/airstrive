import { useCallback, useEffect, useState } from 'react';
import { View, Pressable, StyleSheet, ScrollView, Alert, useWindowDimensions } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Image } from 'expo-image';
import Svg, { Path, Circle } from 'react-native-svg';
import {
  loadBoard, spendFreebie, removeFromShelf, hasMoments, setGridShared, getMomentForSquare,
  type BoardSquare, type Moment,
} from '@/db/repo';
import { useSync } from '@/sync/SyncProvider';
import { useAuth } from '@/auth/AuthProvider';
import { useDataVersion } from '@/sync/events';
import { shortDate } from '@/lib/ids';
import { Text } from '@/ui/Text';
import { Tile } from '@/ui/Tile';
import { Button } from '@/ui/Button';
import { Menu, type MenuItem } from '@/ui/Menu';
import { GridAudienceMenu } from '@/friends/GridAudienceMenu';
import { AUDIENCE_LABEL, gridAudienceLine } from '@/friends/audience';
import { startTogether } from '@/groups/startTogether';
import { useTogetherLine } from '@/groups/useTogetherLine';
import { MomentWords } from '@/groups/MomentWords';
import { colors, fonts, radius } from '@/theme';
import { Mosaic } from './Mosaic';

type Board = NonNullable<Awaited<ReturnType<typeof loadBoard>>>;

const PANEL = 400;
const GAP = 8;

/**
 * The grid on a computer screen: the whole board on the left, the chosen square on the right.
 * Hovering a square previews it; arrow keys move, Enter logs or opens, M shows the mosaic.
 */
export function WideGrid({ id, select }: { id: string; select?: string }) {
  const db = useSQLiteContext();
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const [board, setBoard] = useState<Board | null>(null);
  const [selected, setSelected] = useState<string | null>(select ?? null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [audienceOpen, setAudienceOpen] = useState(false);
  const [mosaic, setMosaic] = useState(false);
  const [focused, setFocused] = useState(false);
  const sync = useSync();
  const { userId, configured } = useAuth();
  const version = useDataVersion();
  const together = useTogetherLine(board?.groupId ?? null);

  const reload = useCallback(async () => {
    const b = await loadBoard(db, id);
    setBoard(b);
    if (b && !selected) {
      const first = b.squares.find((s) => s.state === 'revealed') ?? b.squares[0];
      setSelected(first?.squareStateId ?? null);
    }
    return b;
  }, [db, id, selected, version]);

  // Coming back to a group grid checks for what the others added.
  useFocusEffect(useCallback(() => {
    void reload().then((b) => { if (b?.groupId) sync.request(); });
    setFocused(true);
    return () => setFocused(false);
  }, [reload]));

  const sq = board?.squares.find((s) => s.squareStateId === selected) ?? null;

  const logOrOpen = useCallback((s: BoardSquare) => {
    if (s.state === 'revealed' || (s.state === 'done' && !s.momentId)) {
      router.push({ pathname: '/moment/[squareId]', params: { squareId: s.squareStateId } });
    } else if (s.state === 'done' && s.momentId) {
      router.push({ pathname: '/lane/[momentId]', params: { momentId: s.momentId } });
    }
  }, [router]);

  // Arrow keys walk the board, Enter acts on the square, M opens the mosaic.
  useEffect(() => {
    if (!board || !focused || mosaic || menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (document.querySelector('.as-alert-backdrop')) return;
      const i = board.squares.findIndex((s) => s.squareStateId === selected);
      const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -board.cols, ArrowDown: board.cols }[e.key];
      if (step !== undefined) {
        e.preventDefault();
        const col = i % board.cols;
        if ((e.key === 'ArrowLeft' && col === 0) || (e.key === 'ArrowRight' && col === board.cols - 1)) return;
        const next = board.squares[i + step];
        if (next) { setSelected(next.squareStateId); setHovered(null); }
      } else if (e.key === 'Enter' && sq) {
        e.preventDefault();
        logOrOpen(sq);
      } else if (e.key === 'm' || e.key === 'M') {
        setMosaic(true);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [board, focused, mosaic, menuOpen, selected, sq, logOrOpen]);

  if (!board) return <View style={{ flex: 1, backgroundColor: colors.paper }} />;

  const rows = Math.ceil(board.squares.length / board.cols);
  const boardMaxW = width - PANEL - 48 * 2 - 48;
  const boardMaxH = height - 240;
  const cell = Math.max(24, Math.floor(Math.min((boardMaxW - GAP * (board.cols - 1)) / board.cols, (boardMaxH - GAP * (rows - 1)) / rows, 104)));
  const boardW = board.cols * cell + (board.cols - 1) * GAP;
  const doneCount = board.squares.filter((s) => s.state === 'done').length;
  const revealedCount = board.squares.filter((s) => s.state === 'revealed').length;
  const peek = board.squares.find((s) => s.squareStateId === hovered && s.squareStateId !== selected) ?? null;

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
      { text: 'Remove', style: 'destructive', onPress: async () => { await removeFromShelf(db, id); sync.request(); router.back(); } },
    ]);
  };
  const onShare = async () => { await setGridShared(db, board.gridId, !board.isPublic); sync.request(); reload(); };
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

  const peekIdx = peek ? board.squares.indexOf(peek) : -1;
  const peekCol = peekIdx % board.cols;
  const peekRow = Math.floor(peekIdx / board.cols);
  const peekLeft = peekCol < board.cols / 2 ? (peekCol + 1) * (cell + GAP) + 4 : peekCol * (cell + GAP) - 236;
  const peekTop = Math.max(0, Math.min(peekRow * (cell + GAP) - 20, rows * (cell + GAP) - 260));

  return (
    <View style={{ flex: 1, backgroundColor: colors.paper }}>
      <View style={styles.top}>
        <Pressable onPress={() => router.back()} style={styles.back} accessibilityLabel="Back">
          <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={colors.ink} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"><Path d="M15 5l-7 7 7 7" /></Svg>
          <Text variant="bodyBold">Grids</Text>
        </Pressable>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Pressable onPress={() => setMosaic(true)} style={styles.pill} accessibilityLabel="Mosaic mode">
            <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={colors.ink} strokeWidth={2.2} strokeLinejoin="round">
              <Path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" />
            </Svg>
            <Text variant="bodyBold" style={{ fontSize: 14 }}>Mosaic</Text>
          </Pressable>
          {board.completedAt ? (
            <Pressable onPress={() => router.push({ pathname: '/lane/chapter/[userGridId]', params: { userGridId: id } })} style={styles.pill}>
              <Text variant="bodyBold" style={{ fontSize: 14 }}>Chapter cover</Text>
            </Pressable>
          ) : null}
          <Pressable onPress={() => setMenuOpen(true)} style={styles.iconButton} accessibilityLabel="More">
            <Svg width={22} height={22} viewBox="0 0 24 24" fill={colors.ink}><Circle cx={5} cy={12} r={2} /><Circle cx={12} cy={12} r={2} /><Circle cx={19} cy={12} r={2} /></Svg>
          </Pressable>
        </View>
      </View>

      <View style={styles.body}>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <View style={{ width: boardW, gap: 4, paddingBottom: 16 }}>
            <Text variant="display" style={{ fontSize: 40, lineHeight: 44 }}>{board.title}</Text>
            <Text variant="body" style={{ fontSize: 15, color: colors.muted }}>
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
          <View style={{ width: boardW, flexDirection: 'row', flexWrap: 'wrap', gap: GAP }}>
            {board.squares.map((s) => (
              <Tile
                key={s.squareStateId} square={s} size={cell} color={board.color} revealIcon={board.revealIcon}
                selected={s.squareStateId === selected}
                onPress={() => { setSelected(s.squareStateId); setHovered(null); }}
                onHover={(on) => setHovered((h) => (on ? s.squareStateId : h === s.squareStateId ? null : h))}
              />
            ))}
            {peek && (
              <View pointerEvents="none" style={[styles.peek, { left: peekLeft, top: peekTop }]}>
                <Peek square={peek} color={board.color} />
              </View>
            )}
          </View>
          <Text variant="caption" style={{ color: colors.muted, paddingTop: 16 }}>
            Arrow keys to move · Enter to {sq?.state === 'done' ? 'open the page' : 'log a moment'} · M for the mosaic
          </Text>
        </View>

        <View style={styles.panel}>
          <ScrollView contentContainerStyle={{ padding: 24, gap: 10 }}>
            {sq ? <SquarePanel square={sq} color={board.color} freebiesLeft={board.freebiesLeft} onAct={() => logOrOpen(sq)} onFreebie={() => onFreebie(sq)} /> : null}
          </ScrollView>
        </View>
      </View>

      <Menu
        visible={menuOpen}
        title={board.title}
        note={mine ? (board.isPublic ? 'Its squares are in the Atlas. People who added it keep it if you stop sharing.' : 'Its squares are only on your shelf.') : undefined}
        items={menuItems}
        onClose={() => setMenuOpen(false)}
      />
      <GridAudienceMenu visible={audienceOpen} userGridId={id} current={board.audience} onClose={() => setAudienceOpen(false)} onChanged={reload} />
      <Mosaic visible={mosaic} title={board.title} color={board.color} cols={board.cols} squares={board.squares} onClose={() => setMosaic(false)} />
    </View>
  );
}

/** The card that floats beside a hovered square. */
function Peek({ square, color }: { square: BoardSquare; color: string }) {
  if (square.state === 'done' && square.coverUri) {
    return (
      <View style={styles.polaroid}>
        <Image source={{ uri: square.coverUri }} style={{ width: 200, height: 200 }} contentFit="cover" />
        <Text variant="hand" style={{ fontSize: 21, lineHeight: 23, paddingTop: 8 }} numberOfLines={2}>{square.prompt}</Text>
      </View>
    );
  }
  return (
    <View style={[styles.note, { borderTopColor: square.state === 'hidden' ? colors.lineStrong : color }]}>
      <Text variant="label" style={{ fontSize: 11 }}>{square.state === 'hidden' ? 'Hidden' : square.state === 'done' ? 'Done' : `Square ${square.idx + 1}`}</Text>
      <Text variant="title" style={{ fontSize: 17, lineHeight: 21 }}>{square.state === 'hidden' ? 'Still a mystery' : square.prompt}</Text>
    </View>
  );
}

/** The selected square, with room for its whole moment. */
function SquarePanel({
  square, color, freebiesLeft, onAct, onFreebie,
}: { square: BoardSquare; color: string; freebiesLeft: number; onAct: () => void; onFreebie: () => void }) {
  const db = useSQLiteContext();
  const router = useRouter();
  const version = useDataVersion();
  const [moment, setMoment] = useState<Moment | null>(null);

  useEffect(() => {
    let live = true;
    setMoment(null);
    if (square.momentId) getMomentForSquare(db, square.squareStateId).then((m) => { if (live) setMoment(m); });
    return () => { live = false; };
  }, [db, square.squareStateId, square.momentId, version]);

  if (square.state === 'hidden') {
    return (
      <>
        <Text variant="label">Hidden square</Text>
        <Text variant="display" style={{ fontSize: 28, lineHeight: 32 }}>Still a mystery</Text>
        <Text variant="body" style={{ color: colors.muted }}>Finish one of the squares next to it to find out what this one is.</Text>
      </>
    );
  }

  if (square.state === 'revealed') {
    return (
      <>
        <Text variant="label">Square {square.idx + 1} · {square.cluster}</Text>
        <Text variant="display" style={{ fontSize: 30, lineHeight: 34 }}>{square.prompt}</Text>
        {square.hint ? <Text variant="body" style={{ color: colors.muted }}>{square.hint}</Text> : null}
        <View style={{ gap: 10, paddingTop: 12 }}>
          <Button label="I did this" color={color} onPress={onAct} />
          <Button label={`Use a freebie (${freebiesLeft} left)`} kind="secondary" onPress={onFreebie} disabled={freebiesLeft < 1} />
        </View>
      </>
    );
  }

  const cover = moment?.photos.find((p) => p.isCover) ?? moment?.photos[0];
  const rest = moment?.photos.filter((p) => p !== cover) ?? [];
  return (
    <>
      <Text variant="label" style={{ color: colors.accentDeep }}>{square.viaFreebie ? 'Done · freebie' : 'Done'}{moment ? ` · ${shortDate(moment.happenedOn)}` : ''}</Text>
      <Text variant="display" style={{ fontSize: 28, lineHeight: 32 }}>{square.prompt}</Text>
      {cover ? (
        <View style={[styles.polaroid, { alignSelf: 'stretch', transform: [{ rotate: '-1.5deg' }], marginVertical: 8 }]}>
          <Image source={{ uri: cover.uri }} style={{ width: '100%', aspectRatio: 1 }} contentFit="cover" />
        </View>
      ) : null}
      {rest.length > 0 && (
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          {rest.map((p) => <Image key={p.id} source={{ uri: p.uri }} style={{ width: 64, height: 64, borderRadius: 6 }} contentFit="cover" />)}
        </View>
      )}
      {moment ? <MomentWords moment={moment} size={24} /> : null}
      {moment && (moment.place || moment.weather || moment.withPeople) ? (
        <Text variant="body" style={{ color: colors.muted, fontFamily: fonts.bodyBold, fontSize: 13 }}>
          {[moment.place, moment.weather, moment.withPeople && `With ${moment.withPeople}`].filter(Boolean).join(' · ')}
        </Text>
      ) : null}
      {!square.momentId && <Text variant="body" style={{ color: colors.muted }}>Completed with a freebie. You can still add a moment.</Text>}
      <View style={{ flexDirection: 'row', gap: 10, paddingTop: 8 }}>
        {square.momentId ? (
          <>
            <Button label="Open the page" kind="secondary" onPress={onAct} style={{ flex: 1 }} />
            <Button label="Edit" color={color} onPress={() => router.push({ pathname: '/moment/[squareId]', params: { squareId: square.squareStateId } })} style={{ flex: 1 }} />
          </>
        ) : (
          <Button label="Add a moment anyway" color={color} onPress={onAct} style={{ flex: 1 }} />
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 28, paddingTop: 16, paddingBottom: 8 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 44, paddingHorizontal: 6 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 40, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1.5, borderColor: colors.lineStrong, backgroundColor: colors.card },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, flexDirection: 'row', paddingHorizontal: 48, paddingTop: 8, paddingBottom: 24, gap: 48 },
  panel: {
    width: PANEL, alignSelf: 'stretch', backgroundColor: colors.card, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.line,
    shadowColor: colors.ink, shadowOpacity: 0.06, shadowRadius: 24, shadowOffset: { width: 0, height: 8 },
  },
  peek: { position: 'absolute', zIndex: 10 },
  polaroid: {
    backgroundColor: '#fff', padding: 10, paddingBottom: 14, borderRadius: 3,
    shadowColor: colors.ink, shadowOpacity: 0.2, shadowRadius: 18, shadowOffset: { width: 0, height: 8 },
  },
  note: {
    width: 232, backgroundColor: colors.card, borderRadius: radius.md, padding: 14, gap: 4, borderTopWidth: 4,
    shadowColor: colors.ink, shadowOpacity: 0.16, shadowRadius: 16, shadowOffset: { width: 0, height: 6 },
  },
});
