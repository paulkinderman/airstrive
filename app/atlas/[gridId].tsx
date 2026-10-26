import { useCallback, useState } from 'react';
import { View, Pressable, Alert } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import Svg, { Path } from 'react-native-svg';
import { ensureTemplate, findGrid } from '@/atlas/catalog';
import { GridPreview } from '@/atlas/GridPreview';
import type { AtlasGrid } from '@/atlas/picks';
import { adoptGrid, startGrid } from '@/data/seed';
import { shelfCopyOf } from '@/db/repo';
import { useAuth } from '@/auth/AuthProvider';
import { useSync } from '@/sync/SyncProvider';
import { Button } from '@/ui/Button';
import { colors } from '@/theme';

export default function AtlasPreview() {
  const { gridId } = useLocalSearchParams<{ gridId: string }>();
  const db = useSQLiteContext();
  const router = useRouter();
  const { userId, configured } = useAuth();
  const sync = useSync();
  const [grid, setGrid] = useState<AtlasGrid | null>(null);
  const [copy, setCopy] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let live = true;
      (async () => {
        const g = await findGrid(db, gridId);
        const c = await shelfCopyOf(db, gridId);
        if (live) { setGrid(g); setCopy(c); }
      })();
      return () => { live = false; };
    }, [db, gridId]),
  );

  if (!grid) return <View style={{ flex: 1, backgroundColor: colors.paper }} />;

  const add = async () => {
    if (busy || !userId) return;
    setBusy(true);
    try {
      if (!(await ensureTemplate(db, grid.id))) {
        Alert.alert("Couldn't add it", 'Adding a grid needs a connection the first time. Try again when you are back online.');
        return;
      }
      const ug = await adoptGrid(db, userId, grid.id);
      sync.request();
      router.replace({ pathname: '/grid/[id]', params: { id: ug } });
    } finally {
      setBusy(false);
    }
  };

  // A fresh copy for doing it together, even if it's already on the shelf.
  const together = async () => {
    if (busy || !userId) return;
    setBusy(true);
    try {
      if (!(await ensureTemplate(db, grid.id))) {
        Alert.alert("Couldn't add it", 'Doing a grid together needs a connection. Try again when you are back online.');
        return;
      }
      const ug = await startGrid(db, grid.id);
      router.replace({ pathname: '/together/start', params: { userGridId: ug, share: '0' } });
    } finally {
      setBusy(false);
    }
  };

  const mine = !!grid.authorId && grid.authorId === userId;
  const canReport = !grid.isOfficial && !mine;

  return (
    <GridPreview
      grid={grid}
      onBack={() => router.back()}
      headerAction={
        canReport ? (
          <Pressable
            onPress={() => router.push({ pathname: '/report/[gridId]', params: { gridId: grid.id, title: grid.title } })}
            style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginHorizontal: -10 }}
            accessibilityLabel="Report this grid"
          >
            <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M5 21V4h11l-1.5 4L16 12H5" />
            </Svg>
          </Pressable>
        ) : undefined
      }
      footer={
        <View style={{ flex: 1, gap: 10 }}>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {copy ? (
              <Button label="On your shelf · open it" kind="secondary" onPress={() => router.replace({ pathname: '/grid/[id]', params: { id: copy } })} style={{ flex: 1 }} />
            ) : (
              <Button label={busy ? 'Adding…' : 'Add to your grids'} onPress={add} disabled={busy} style={{ flex: 1 }} />
            )}
            <Pressable
              onPress={() => router.push({ pathname: '/make', params: { from: grid.id } })}
              style={{ width: 50, height: 50, borderRadius: 14, borderWidth: 1.5, borderColor: colors.lineStrong, alignItems: 'center', justifyContent: 'center' }}
              accessibilityLabel="Copy and edit"
            >
              <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={colors.ink} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                <Path d="M4 20h4l10-10-4-4L4 16z" /><Path d="M13 7l4 4" />
              </Svg>
            </Pressable>
          </View>
          {configured && <Button label="Do this together with friends" kind="secondary" onPress={together} disabled={busy} />}
        </View>
      }
    />
  );
}
