import { useCallback, useState } from 'react';
import { ScrollView, View, Pressable, StyleSheet } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { listShelf, listSuggestions, type ShelfGrid, type Suggestion } from '@/db/repo';
import { Text } from '@/ui/Text';
import { MiniGrid } from '@/ui/MiniGrid';
import { useAuth } from '@/auth/AuthProvider';
import { useSync } from '@/sync/SyncProvider';
import { useDataVersion } from '@/sync/events';
import { colors, radius } from '@/theme';

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export default function Home() {
  const db = useSQLiteContext();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [shelf, setShelf] = useState<ShelfGrid[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const { username } = useAuth();
  const sync = useSync();
  const version = useDataVersion();

  useFocusEffect(
    useCallback(() => {
      let live = true;
      (async () => {
        const [s, sug] = await Promise.all([listShelf(db), listSuggestions(db)]);
        if (live) { setShelf(s); setSuggestions(sug); }
      })();
      return () => { live = false; };
    }, [db, version]),
  );

  const waiting = shelf.reduce((n, g) => n + g.revealed, 0);
  const day = new Date().toLocaleDateString(undefined, { weekday: 'long' });

  return (
    <ScrollView contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: 32 }} style={{ backgroundColor: colors.paper }}>
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <MiniGrid states={['hidden', 'done', 'hidden', 'revealed', 'hidden', 'revealed', 'hidden', 'hidden', 'hidden']} cols={3} color={colors.accent} cell={7} />
          <Text variant="title" style={{ fontSize: 24 }}>
            Air<Text variant="title" style={{ fontSize: 24, color: colors.accent }}>Strive</Text>
          </Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Pressable onPress={() => router.push('/profile')} style={[styles.roundButton, styles.avatar]} accessibilityLabel="Profile">
            <Text variant="title" style={{ fontSize: 18, color: '#fff' }}>{(username ?? '?').slice(0, 1).toUpperCase()}</Text>
            {sync.failed > 0 && <View style={styles.badge} />}
          </Pressable>
        </View>
      </View>

      <View style={{ paddingHorizontal: 20, paddingTop: 8, gap: 4 }}>
        <Text variant="display" style={{ fontSize: 30, lineHeight: 34 }}>{greeting()}{username ? `, ${username}` : ''}</Text>
        <Text variant="body" style={{ color: colors.muted }}>{day} · {waiting} square{waiting === 1 ? '' : 's'} waiting</Text>
      </View>

      {suggestions.length > 0 && (
        <View style={{ paddingTop: 22, gap: 10 }}>
          <Text variant="label" style={{ paddingHorizontal: 20 }}>Things to try</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 10 }}>
            {suggestions.map((s) => {
              return (
                <Pressable
                  key={s.squareStateId}
                  onPress={() => router.push({ pathname: '/grid/[id]', params: { id: s.userGridId, select: s.squareStateId } })}
                  style={styles.suggestion}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: s.gridColor }} />
                    <Text variant="label" style={{ fontSize: 11, letterSpacing: 1 }}>{s.gridTitle}</Text>
                  </View>
                  <Text variant="bodyBold" style={{ lineHeight: 20 }}>{s.prompt}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}

      <View style={{ paddingHorizontal: 20, paddingTop: 24, gap: 10 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <Text variant="label">Your grids</Text>
          <Pressable onPress={() => router.push('/make')}>
            <Text variant="bodyBold" style={{ fontSize: 13, color: colors.accentDeep }}>+ Create grid</Text>
          </Pressable>
        </View>
        {shelf.length === 0 && (
          <Pressable onPress={() => router.push('/atlas')} style={styles.empty}>
            <Text variant="title">Your shelf is empty</Text>
            <Text variant="body" style={{ fontSize: 14, color: colors.muted }}>
              Find a grid in the Atlas, or make your own about anything you like.
            </Text>
            <Text variant="bodyBold" style={{ fontSize: 14, color: colors.accentDeep }}>Open the Atlas</Text>
          </Pressable>
        )}
        {shelf.map((g) => (
          <Pressable key={g.userGridId} onPress={() => router.push({ pathname: '/grid/[id]', params: { id: g.userGridId } })} style={styles.gridCard}>
            <MiniGrid states={g.states} cols={g.cols} color={g.color} cell={g.cols >= 10 ? 5 : g.cols >= 8 ? 6 : 8} />
            <View style={{ flex: 1, gap: 3 }}>
              <Text variant="title" style={{ fontSize: 19 }}>{g.title}</Text>
              <Text variant="body" style={{ fontSize: 13, color: colors.muted }}>
                {g.completedAt ? 'Complete' : `${g.done} of ${g.total} · ${g.revealed} revealed`}
              </Text>
            </View>
            <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={colors.faint} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M9 6l6 6-6 6" />
            </Svg>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 12 },
  roundButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  suggestion: { width: 170, minHeight: 118, padding: 14, borderRadius: radius.lg, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, gap: 10 },
  avatar: { backgroundColor: colors.ink, borderColor: colors.ink },
  badge: { position: 'absolute', top: 0, right: 0, width: 12, height: 12, borderRadius: 6, backgroundColor: colors.danger, borderWidth: 2, borderColor: colors.paper },
  empty: { padding: 18, borderRadius: radius.lg, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.lineStrong, gap: 6 },
  gridCard: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderRadius: radius.lg, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, minHeight: 84 },
});
