import { useLocalSearchParams } from 'expo-router';
import { useWideLayout } from '@/ui/wide';
import { Book } from '@/wide/Book';
import { PhoneReader } from '@/lane/PhoneReader';

export default function ScrapbookPageScreen() {
  const { momentId } = useLocalSearchParams<{ momentId: string }>();
  return useWideLayout() ? <Book startKey={momentId} /> : <PhoneReader startKey={momentId} />;
}
