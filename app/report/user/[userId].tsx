import { useLocalSearchParams } from 'expo-router';
import { reportUser } from '@/friends/api';
import { ReportForm } from '@/ui/ReportForm';

export default function ReportUser() {
  const { userId, username } = useLocalSearchParams<{ userId: string; username?: string }>();
  return (
    <ReportForm
      heading={username ? `What's wrong with ${username}?` : "What's wrong with this person?"}
      sentLine="Someone will look at it soon. They won't know you reported them."
      alreadyLine="You've already reported this person. We'll look at it soon."
      send={(reason, note) => reportUser(userId, reason, note)}
    />
  );
}
