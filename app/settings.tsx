import { useCallback, useEffect, useState } from 'react';
import { View, ScrollView, Pressable, StyleSheet, Alert, ActivityIndicator, Platform } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { goBack } from '@/lib/goBack';
import { useSQLiteContext } from 'expo-sqlite';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import Svg, { Path } from 'react-native-svg';
import { useAuth } from '@/auth/AuthProvider';
import { useSync } from '@/sync/SyncProvider';
import { buildExport } from '@/lib/exportData';
import { shareZip } from '@/lib/share';
import { privacyUrl, supportUrl } from '@/friends/links';
import { listBlocked, listFriends, unblockUser } from '@/friends/api';
import { useLoad } from '@/friends/useLoad';
import { Text } from '@/ui/Text';
import { Button } from '@/ui/Button';
import { colors, radius } from '@/theme';

function ago(iso: string | null) {
  if (!iso) return 'not yet';
  const s = Math.round((Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString();
}

/** True only once `on` has held for `ms`, so a quick sync doesn't flash a spinner. */
function useSettled(on: boolean, ms: number) {
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    if (!on) { setSettled(false); return; }
    const t = setTimeout(() => setSettled(true), ms);
    return () => clearTimeout(t);
  }, [on, ms]);
  return settled;
}

export default function Settings() {
  const db = useSQLiteContext();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const auth = useAuth();
  const sync = useSync();
  const [exporting, setExporting] = useState<string | null>(null);
  const slowSync = useSettled(sync.running, 800);

  useFocusEffect(useCallback(() => { void sync.syncNow(); }, [sync.syncNow]));
  const blocked = useLoad(() => (auth.configured ? listBlocked() : Promise.resolve([])), [auth.configured]);

  const syncLine = !auth.configured
    ? 'This build keeps everything on this phone only.'
    : sync.failed > 0
      ? `${sync.failed} change${sync.failed === 1 ? '' : 's'} couldn't sync.`
      : sync.pending > 0
        ? `${sync.pending} change${sync.pending === 1 ? '' : 's'} waiting to back up.`
        : `Everything is backed up. Last synced ${ago(sync.lastSyncedAt)}.`;

  const exportData = async () => {
    if (exporting) return;
    try {
      setExporting('Getting photos from your other phones');
      await sync.syncNow();
      const friends = auth.configured ? await listFriends().catch(() => null) : null;
      const uri = await buildExport(db, auth.username ?? 'me', setExporting, friends);
      setExporting(null);
      await shareZip(uri);
    } catch (e) {
      Alert.alert("Couldn't finish the export", e instanceof Error ? e.message : 'Try again in a moment.');
    } finally {
      setExporting(null);
    }
  };

  const signOut = () => {
    const unsynced = auth.configured && sync.pending + sync.failed > 0;
    Alert.alert(
      'Sign out?',
      unsynced
        ? `${sync.pending + sync.failed} changes haven't backed up yet and will be lost. Connect to the internet first to keep them.`
        : 'Your grids and moments stay in your account. This phone forgets them until you sign in again.',
      [{ text: 'Cancel', style: 'cancel' }, { text: 'Sign out', style: 'destructive', onPress: () => void auth.signOut() }],
    );
  };

  const deleteAccount = () => {
    Alert.alert(
      'Delete your account?',
      'This permanently deletes every grid, moment and photo in your account, on every phone. Export first if you want to keep them. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete everything',
          style: 'destructive',
          onPress: () =>
            Alert.alert('Are you sure?', 'Your scrapbook will be gone for good.', [
              { text: 'Keep my account', style: 'cancel' },
              {
                text: 'Delete',
                style: 'destructive',
                onPress: async () => {
                  try { await auth.deleteAccount(); } catch (e) {
                    Alert.alert("Couldn't delete the account", e instanceof Error ? e.message : 'Check your connection and try again.');
                  }
                },
              },
            ]),
        },
      ],
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.paper }}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => goBack(router, '/profile')} style={styles.iconButton} accessibilityLabel="Back">
          <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={colors.ink} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"><Path d="M15 5l-7 7 7 7" /></Svg>
        </Pressable>
        <Text variant="label">Settings</Text>
        <View style={styles.iconButton} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: insets.bottom + 32 }}>
        <View style={[styles.card, { flexDirection: 'row', alignItems: 'center', gap: 14 }]}>
          <View style={styles.avatar}><Text variant="display" style={{ fontSize: 26, lineHeight: 30, color: '#fff' }}>{(auth.username ?? '?').slice(0, 1).toUpperCase()}</Text></View>
          <View style={{ flex: 1 }}>
            <Text variant="title" style={{ fontSize: 22 }}>{auth.username}</Text>
            <Text variant="body" style={{ fontSize: 13, color: colors.muted }}>Each grid is private until you choose who can see it.</Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text variant="label">Backup</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {slowSync && <ActivityIndicator size="small" color={colors.muted} />}
            <Text variant="body" style={{ flex: 1, color: sync.failed > 0 ? colors.danger : colors.ink }}>{syncLine}</Text>
          </View>
          {auth.configured && (sync.failed > 0
            ? <Button label="Try again" kind="secondary" onPress={sync.retry} />
            : <Button label="Sync now" kind="secondary" onPress={sync.syncNow} disabled={slowSync} />)}
        </View>

        <View style={styles.card}>
          <Text variant="label">Your data</Text>
          <Text variant="body" style={{ color: colors.muted, fontSize: 14 }}>
            A zip with every moment as JSON, all your photos, and {Platform.OS === 'web' ? 'Memory Lane as a page you can print' : 'a PDF of Memory Lane'}.
          </Text>
          <Button label={exporting ? `${exporting}…` : 'Export my data'} kind="secondary" onPress={exportData} disabled={!!exporting} />
        </View>

        {blocked.data && blocked.data.length > 0 && (
          <View style={styles.card}>
            <Text variant="label">Blocked</Text>
            {blocked.data.map((b) => (
              <View key={b.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Text variant="bodyBold" style={{ flex: 1 }}>{b.username}</Text>
                <Button label="Unblock" kind="quiet" onPress={async () => { await unblockUser(b.id).catch(() => {}); await blocked.reload(); }} />
              </View>
            ))}
          </View>
        )}

        <View style={[styles.card, { gap: 4 }]}>
          <Button label="Help and contact" kind="quiet" onPress={() => Linking.openURL(supportUrl)} style={{ alignSelf: 'flex-start' }} />
          <Button label="Privacy policy" kind="quiet" onPress={() => Linking.openURL(privacyUrl)} style={{ alignSelf: 'flex-start' }} />
        </View>

        <View style={[styles.card, { gap: 4 }]}>
          <Button label="Sign out" kind="quiet" onPress={signOut} style={{ alignSelf: 'flex-start' }} />
          {auth.configured && <Button label="Delete account" kind="danger" onPress={deleteAccount} style={{ alignSelf: 'flex-start' }} />}
        </View>

        <Text variant="caption" style={{ textAlign: 'center', paddingTop: 8 }}>
          AirStrive {Constants.expoConfig?.version ?? ''} · Moments over metrics
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10, paddingBottom: 6 },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  card: { padding: 16, borderRadius: radius.lg, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, gap: 10 },
  avatar: { width: 56, height: 56, borderRadius: 18, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
});
