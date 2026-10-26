import { Alert } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { hasNarrowerMoments, setGridAudience } from '@/db/repo';
import { useSync } from '@/sync/SyncProvider';
import { Menu } from '@/ui/Menu';
import { AUDIENCES, AUDIENCE_LABEL, AUDIENCE_NOTE, isWider, type Audience } from './audience';

/** The "Who can see this grid" sheet on a grid page. */
export function GridAudienceMenu({
  visible, userGridId, current, onClose, onChanged,
}: { visible: boolean; userGridId: string; current: Audience; onClose: () => void; onChanged: () => void }) {
  const db = useSQLiteContext();
  const sync = useSync();

  const apply = async (a: Audience, moments: boolean) => {
    await setGridAudience(db, userGridId, a, moments);
    sync.request();
    onChanged();
  };

  const choose = async (a: Audience) => {
    if (a === current) return;
    if (isWider(a, current) && (await hasNarrowerMoments(db, userGridId, a))) {
      Alert.alert(
        `Share the moments already here with ${a === 'public' ? 'everyone' : 'friends'}?`,
        'New moments will be shared either way. You can change any moment on its own page.',
        [
          { text: 'Just new ones', onPress: () => void apply(a, false) },
          { text: 'Share them too', onPress: () => void apply(a, true) },
        ],
      );
      return;
    }
    await apply(a, false);
  };

  return (
    <Menu
      visible={visible}
      title="Who can see this grid"
      note="Moments can be narrower than their grid. Place, weather and who you were with are never shown to others."
      items={[...AUDIENCES].reverse().map((a) => ({
        label: `${a === current ? '✓ ' : ''}${AUDIENCE_LABEL[a]} · ${AUDIENCE_NOTE[a]}`,
        onPress: () => void choose(a),
      }))}
      onClose={onClose}
    />
  );
}
