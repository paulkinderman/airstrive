import { useEffect, useState } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { listFriendMoments, photoUrls, type FriendMoment } from '@/friends/api';
import { useLoad } from '@/friends/useLoad';
import { Avatar } from '@/friends/bits';
import { useAuth } from '@/auth/AuthProvider';
import { useAtlas } from '@/atlas/catalog';
import { featured } from '@/atlas/picks';
import { todayLocal } from '@/lib/ids';
import { Text } from '@/ui/Text';
import { SquareEmoji, fillLook } from '@/ui/SquareLook';
import { colors, radius } from '@/theme';

const SHOWN = 3;

/** today, yesterday, a weekday within the week, then a date. */
function when(day: string): string {
  const today = new Date(`${todayLocal()}T00:00:00`);
  const then = new Date(`${day.slice(0, 10)}T00:00:00`);
  const days = Math.round((today.getTime() - then.getTime()) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return then.toLocaleDateString(undefined, { weekday: 'short' });
  return then.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * The top of the wide home screen's right panel: moments your friends shared lately. With
 * nothing from friends (or no connection), it suggests grids from the Atlas instead.
 * `onShelf` is the grids you already have, which the suggestions leave out.
 */
export function FromFriends({ onShelf }: { onShelf: string[] }) {
  const { configured } = useAuth();
  const feed = useLoad(() => (configured ? listFriendMoments(SHOWN) : Promise.resolve([])), [configured]);
  const moments = feed.data ?? [];
  const [covers, setCovers] = useState<Map<string, string>>(new Map());

  const paths = moments.map((m) => m.coverPath).filter((p): p is string => !!p);
  const pathsKey = paths.join('|');
  useEffect(() => {
    if (paths.length === 0) return;
    let live = true;
    photoUrls(paths).then((m) => { if (live) setCovers(m); }).catch(() => {});
    return () => { live = false; };
  }, [pathsKey]);

  if (feed.loading && !feed.data) return <View style={{ minHeight: 120 }} />;
  if (moments.length === 0) return <NewGrids onShelf={onShelf} />;

  return (
    <View style={styles.section}>
      <Text variant="label">From friends</Text>
      {moments.map((m) => <FriendRow key={m.id} moment={m} cover={m.coverPath ? covers.get(m.coverPath) ?? null : null} />)}
    </View>
  );
}

function FriendRow({ moment: m, cover }: { moment: FriendMoment; cover: string | null }) {
  const router = useRouter();
  const fill = fillLook(m.fill, m.gridColor);
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/people/[userId]', params: { userId: m.userId } })}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.9 }]}
      accessibilityRole="link"
      accessibilityLabel={`${m.username}: ${m.title}, ${m.gridTitle}`}
    >
      {cover
        ? <Image source={{ uri: cover, cacheKey: m.coverPath ?? undefined }} style={styles.thumb} contentFit="cover" cachePolicy="memory-disk" />
        : <View style={[styles.thumb, { backgroundColor: fill.bg, alignItems: 'center', justifyContent: 'center' }]}>{fill.emoji ? <SquareEmoji emoji={fill.emoji} size={26} /> : null}</View>}
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <Text variant="bodyBold" numberOfLines={2} style={{ lineHeight: 19 }}>{m.title}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Avatar userId={m.userId} name={m.username} size={18} />
          <Text variant="body" numberOfLines={1} style={{ fontSize: 12, color: colors.muted, flex: 1 }}>
            {m.username} · {m.gridTitle} · {when(m.happenedOn)}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

/** Grids from the Atlas you haven't started, for when there's nothing from friends. */
function NewGrids({ onShelf }: { onShelf: string[] }) {
  const router = useRouter();
  const atlas = useAtlas();
  const picks = featured((atlas.data ?? []).filter((g) => !onShelf.includes(g.id))).slice(0, SHOWN);
  if (picks.length === 0) return null;
  return (
    <View style={styles.section}>
      <Text variant="label">Find a new grid</Text>
      {picks.map((g) => (
        <Pressable
          key={g.id}
          onPress={() => router.push({ pathname: '/atlas/[gridId]', params: { gridId: g.id } })}
          style={({ pressed }) => [styles.row, { paddingLeft: 14 }, pressed && { opacity: 0.9 }]}
          accessibilityRole="link"
          accessibilityLabel={`${g.title}, see the grid`}
        >
          <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: g.color }} />
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Text variant="bodyBold" numberOfLines={1}>{g.title}</Text>
            <Text variant="body" numberOfLines={1} style={{ fontSize: 12, color: colors.muted }}>
              {g.starters.slice(0, 2).join(' · ') || g.description}
            </Text>
          </View>
          <View style={styles.plus}><Text variant="bodyBold" style={{ fontSize: 16, lineHeight: 18 }}>+</Text></View>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 10 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 8, paddingRight: 12,
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, minHeight: 62,
  },
  thumb: { width: 56, height: 56, borderRadius: 10 },
  plus: { width: 28, height: 28, borderRadius: 9, borderWidth: 1.5, borderColor: colors.lineStrong, alignItems: 'center', justifyContent: 'center' },
});
