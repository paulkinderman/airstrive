import { useLocalSearchParams } from 'expo-router';
import { reportGrid } from '@/atlas/catalog';
import { ReportForm } from '@/ui/ReportForm';

export default function ReportGrid() {
  const { gridId, title } = useLocalSearchParams<{ gridId: string; title?: string }>();
  return (
    <ReportForm
      heading={title ? `What's wrong with “${title}”?` : "What's wrong with this grid?"}
      sentLine="Someone will look at it soon. If it breaks the rules it comes out of the Atlas."
      alreadyLine="You've already reported this grid. We'll look at it soon."
      send={(reason, note) => reportGrid(gridId, reason, note)}
    />
  );
}
