import { useWideLayout } from '@/ui/wide';
import { WideHome } from '@/wide/WideHome';
import { PhoneHome } from '@/home/PhoneHome';

export default function Home() {
  return useWideLayout() ? <WideHome /> : <PhoneHome />;
}
