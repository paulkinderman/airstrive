import { Pressable, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { coverTitle, isCover, type BookItem } from '@/lane/Covers';
import { Text } from './Text';
import { colors } from '@/theme';

/** Previous / next page in Memory Lane: a moment, a chapter or one of the book's covers. */
export function PageLink({ page, dir, onPress, dark }: { page: BookItem | null; dir: 'prev' | 'next'; onPress: (p: BookItem) => void; dark?: boolean }) {
  const ink = dark ? '#AEB5C0' : colors.scrapInk;
  if (!page) {
    return <Text variant="bodyBold" style={{ fontSize: 13, color: dark ? '#6B7280' : '#C9BDA8' }}>{dir === 'prev' ? 'First page' : 'Newest'}</Text>;
  }
  const title = isCover(page) ? coverTitle[page.kind] : page.kind === 'moment' ? page.moment.title : `${page.chapter.gridTitle}, complete`;
  const color = isCover(page) ? null : page.kind === 'moment' ? page.moment.gridColor : page.chapter.gridColor;
  return (
    <Pressable onPress={() => onPress(page)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, height: 44, maxWidth: '48%' }}>
      {dir === 'prev' && <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={ink} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"><Path d="M15 5l-7 7 7 7" /></Svg>}
      {color && <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: color }} />}
      <Text variant="bodyBold" numberOfLines={1} style={{ fontSize: 13, color: ink, flexShrink: 1 }}>{title}</Text>
      {dir === 'next' && <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={ink} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"><Path d="M9 5l7 7-7 7" /></Svg>}
    </Pressable>
  );
}
