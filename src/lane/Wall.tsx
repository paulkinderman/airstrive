import { View, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import type { Chapter, Moment } from '@/db/repo';
import { shortDate } from '@/lib/ids';
import { chapterCaption } from '@/lib/printables';
import { Text } from '@/ui/Text';
import { SquareEmoji, fillLook } from '@/ui/SquareLook';
import { colors, fonts } from '@/theme';

/** Each page keeps the same small tilt every time the wall is drawn. */
function tilt(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  h = Math.abs(h);
  return { rot: (h % 50) / 10 - 2.5, tape: ((h >> 6) % 10) - 5 };
}

/** One moment on the Memory Lane wall: a polaroid taped down with its grid's color. */
export function WallPolaroid({ moment: m, width, onPress }: { moment: Moment; width: number; onPress: () => void }) {
  const cover = m.photos.find((p) => p.isCover) ?? m.photos[0];
  const fill = fillLook(m.fill, m.gridColor);
  const t = tilt(m.id);
  const photo = width - 16;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.polaroid, { width, transform: [{ rotate: `${t.rot}deg` }, { scale: pressed ? 0.98 : 1 }] }]}
      accessibilityRole="link"
      accessibilityLabel={`${m.title}, ${m.gridTitle}, ${shortDate(m.happenedOn)}`}
    >
      {cover
        ? <Image source={{ uri: cover.uri }} style={{ width: photo, height: photo, backgroundColor: colors.line }} contentFit="cover" cachePolicy="memory-disk" />
        : (
          <View style={{ width: photo, height: photo, backgroundColor: fill.bg, alignItems: 'center', justifyContent: 'center' }}>
            {fill.emoji ? <SquareEmoji emoji={fill.emoji} size={photo * 0.32} /> : null}
          </View>
        )}
      <Text numberOfLines={2} style={styles.caption}>{m.title}</Text>
      <Text variant="label" numberOfLines={1} style={styles.meta}>{m.gridTitle} · {shortDate(m.happenedOn).replace(/, \d+$/, '')}</Text>
      <View style={[styles.tape, { left: width / 2 - 32, backgroundColor: m.gridColor, transform: [{ rotate: `${t.tape}deg` }] }]} />
    </Pressable>
  );
}

/** A finished grid on the wall: its whole mosaic on a dark card that spans the row. */
export function WallChapter({ chapter: c, onPress }: { chapter: Chapter; onPress: () => void }) {
  const cell = c.cols >= 10 ? 6 : 8;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.chapter, pressed && { opacity: 0.9 }]}
      accessibilityRole="link"
      accessibilityLabel={`Chapter: ${c.gridTitle}, grid complete`}
    >
      <View style={{ width: c.cols * cell + (c.cols - 1) * 2, flexDirection: 'row', flexWrap: 'wrap', gap: 2 }}>
        {c.tiles.map((uri, i) =>
          uri
            ? <Image key={i} source={{ uri }} style={{ width: cell, height: cell, borderRadius: 2 }} contentFit="cover" />
            : <View key={i} style={{ width: cell, height: cell, borderRadius: 2, backgroundColor: c.gridColor }} />,
        )}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="label" style={{ fontSize: 10, letterSpacing: 1.5, color: c.gridColor }}>Chapter · grid complete</Text>
        <Text variant="title" numberOfLines={2} style={{ color: '#fff' }}>{c.gridTitle}</Text>
        <Text variant="hand" style={{ fontSize: 20, lineHeight: 24, color: '#D5DAE1' }}>{chapterCaption(c.momentCount, c.firstOn, c.lastOn)}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  polaroid: {
    backgroundColor: '#fff', paddingTop: 8, paddingHorizontal: 8, borderRadius: 3,
    shadowColor: '#5C4A2A', shadowOpacity: 0.18, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 4,
  },
  caption: { fontFamily: fonts.hand, fontSize: 20, lineHeight: 21, minHeight: 50, color: colors.ink, paddingTop: 8, paddingHorizontal: 2 },
  meta: { fontSize: 9, lineHeight: 13, letterSpacing: 1.3, color: colors.scrapInk, paddingHorizontal: 2, paddingTop: 3, paddingBottom: 10 },
  tape: { position: 'absolute', top: -8, width: 64, height: 18, opacity: 0.7 },
  chapter: {
    width: '100%', flexDirection: 'row', alignItems: 'center', gap: 16,
    backgroundColor: colors.night, borderRadius: 16, padding: 16,
  },
});
