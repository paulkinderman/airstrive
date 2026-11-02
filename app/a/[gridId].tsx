import { Redirect, useLocalSearchParams } from 'expo-router';
import { cleanCode, cleanGridId } from '@/friends/links';
import { InviteGate } from '@/friends/InviteGate';

/** Where a "Try this grid" link lands: the grid's Atlas page, saying who sent it. */
export default function GridLink() {
  const params = useLocalSearchParams<{ gridId: string; f?: string }>();
  const gridId = cleanGridId(params.gridId);
  const from = cleanCode(params.f);
  return (
    <InviteGate invite={gridId ? (from ? { kind: 'a', code: gridId, from } : { kind: 'a', code: gridId }) : null}>
      {gridId
        ? <Redirect href={{ pathname: '/atlas/[gridId]', params: from ? { gridId, from } : { gridId } }} />
        : <Redirect href="/atlas" />}
    </InviteGate>
  );
}
