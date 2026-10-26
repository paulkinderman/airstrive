import { Alert } from 'react-native';
import type { useRouter } from 'expo-router';
import type { SQLiteDatabase } from 'expo-sqlite';
import { hasMoments } from '@/db/repo';

/**
 * "Do this together" from a grid's menu. Asks what should happen to moments already on the
 * grid (they stay Private unless the person says to share them), then opens the screen
 * that sets the group up.
 */
export async function startTogether(db: SQLiteDatabase, router: ReturnType<typeof useRouter>, userGridId: string) {
  const go = (share: boolean) => router.push({ pathname: '/together/start', params: { userGridId, share: share ? '1' : '0' } });
  if (!(await hasMoments(db, userGridId))) {
    Alert.alert(
      'Do this grid together?',
      'You and the friends you invite share one board. Anyone can do a square, and each of you adds your own words and photos to it. The grid leaves your profile and is only seen by the group.',
      [{ text: 'Cancel', style: 'cancel' }, { text: 'Continue', onPress: () => go(false) }],
    );
    return;
  }
  Alert.alert(
    'Share what you\'ve written so far?',
    'You and the friends you invite will share this board. Your moments here can be shared with them, or kept Private to you. You can change each one later.',
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Keep them Private', onPress: () => go(false) },
      { text: 'Share them', onPress: () => go(true) },
    ],
  );
}
