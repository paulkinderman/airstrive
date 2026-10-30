import { useLocalSearchParams } from 'expo-router';
import { PhoneReader } from '@/lane/PhoneReader';

/** The page Memory Lane adds when a grid is finished (see ChapterSheet), in the page-turning reader. */
export default function ChapterCover() {
  const { userGridId } = useLocalSearchParams<{ userGridId: string }>();
  return <PhoneReader startKey={`chapter:${userGridId}`} />;
}
