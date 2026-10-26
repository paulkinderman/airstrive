import { useEffect, useState } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import { useAuth } from '@/auth/AuthProvider';
import { useDataVersion } from '@/sync/events';
import { listGroupPeople, togetherLine } from './repo';

/** "With Sam" for a group grid's header; null for a grid of one's own. */
export function useTogetherLine(groupId: string | null): string | null {
  const db = useSQLiteContext();
  const { userId } = useAuth();
  const version = useDataVersion();
  const [line, setLine] = useState<string | null>(null);
  useEffect(() => {
    if (!groupId) { setLine(null); return; }
    listGroupPeople(db, groupId).then((people) => setLine(togetherLine(people, userId)));
  }, [db, groupId, userId, version]);
  return line;
}
