import { useLocalSearchParams } from 'expo-router';
import { reportMoment } from '@/friends/api';
import { ReportForm } from '@/ui/ReportForm';

export default function ReportMoment() {
  const { momentId, title } = useLocalSearchParams<{ momentId: string; title?: string }>();
  return (
    <ReportForm
      heading={title ? `What's wrong with “${title}”?` : "What's wrong with this moment?"}
      sentLine="Someone will look at it soon. If it breaks the rules, only its owner will see it."
      alreadyLine="You've already reported this moment. We'll look at it soon."
      send={(reason, note) => reportMoment(momentId, reason, note)}
    />
  );
}
