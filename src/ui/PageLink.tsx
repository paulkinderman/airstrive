import { Pressable, View } from 'react-native';
import type { useRouter } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import type { Page } from '@/db/repo';
import { Text } from './Text';
import { colors } from '@/theme';

export function openPage(router: ReturnType<typeof useRouter>, p: Page) {
  if (p.kind === 'moment') router.replace({ pathname: '/lane/[momentId]', params: { momentId: p.moment.id } });
  else router.replace({ pathname: '/lane/chapter/[userGridId]', params: { userGridId: p.chapter.userGridId } });
}

/** Previous / next page in Memory Lane, a moment or a chapter cover. */
export function PageLink({ page, dir, onPress, dark }: { page: Page | null; dir: 'prev' | 'next'; onPress: (p: Page) => void; dark?: boolean }) {
  const ink = dark ? '#AEB5C0' : colors.scrapInk;
  if (!page) {
    return <Text variant="bodyBold" style={{ fontSize: 13, color: dark ? '#6B7280' : '#C9BDA8' }}>{dir === 'prev' ? 'First page' : 'Newest'}</Text>;
  }
  const title = page.kind === 'moment' ? page.moment.title : `${page.chapter.gridTitle}, complete`;
  const color = page.kind === 'moment' ? page.moment.gridColor : page.chapter.gridColor;
  return (
    <Pressable onPress={() => onPress(page)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, height: 44, maxWidth: '48%' }}>
      {dir === 'prev' && <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={ink} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"><Path d="M15 5l-7 7 7 7" /></Svg>}
      <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: color }} />
      <Text variant="bodyBold" numberOfLines={1} style={{ fontSize: 13, color: ink, flexShrink: 1 }}>{title}</Text>
      {dir === 'next' && <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={ink} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"><Path d="M9 5l7 7-7 7" /></Svg>}
    </Pressable>
  );
}
