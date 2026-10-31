import { useCallback, useState } from 'react';
import { View, ScrollView, Pressable, StyleSheet, Switch, ActivityIndicator, AppState, Linking, Alert } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { goBack } from '@/lib/goBack';
import { useLoad } from '@/friends/useLoad';
import { BackIcon } from '@/friends/bits';
import { KINDS, pushOff, setPush, type NotificationKind } from '@/notifications/api';
import { pushStatus, pushSupported, turnOnPush, type PushStatus } from '@/notifications/push';
import { Text } from '@/ui/Text';
import { Button } from '@/ui/Button';
import { colors, radius } from '@/theme';

const STATUS_LINE: Record<PushStatus, string> = {
  on: 'On. AirStrive can show alerts and a badge.',
  ask: 'Off. Turn them on to hear about friends and shared grids.',
  off: 'Off in iOS Settings. Turn on Allow Notifications for AirStrive there.',
  unavailable: "This version of the app can't receive pushes.",
};

/** Manage push notifications: this phone's permission, and one switch per kind for the account. */
export default function PushSettings() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [status, setStatus] = useState<PushStatus | null>(null);
  const prefs = useLoad(() => pushOff(), []);
  const [off, setOff] = useState<NotificationKind[] | null>(null);
  const muted = off ?? prefs.data ?? [];

  // Coming back from iOS Settings shows what changed there.
  useFocusEffect(useCallback(() => {
    void pushStatus().then(setStatus);
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') void pushStatus().then(setStatus); });
    return () => sub.remove();
  }, []));

  const toggle = async (kind: NotificationKind, on: boolean) => {
    const before = muted;
    setOff(on ? muted.filter((k) => k !== kind) : [...muted, kind]);
    try { setOff(await setPush(kind, on)); } catch {
      setOff(before);
      Alert.alert("Couldn't save that", 'Check your connection and try again.');
    }
  };

  const phoneSwitch = async (on: boolean) => {
    if (on && status === 'ask') setStatus(await turnOnPush());
    // iOS only asks once; after that the switch lives in Settings.
    else void Linking.openSettings();
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.paper }}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => goBack(router, '/notifications')} style={styles.iconButton} accessibilityLabel="Back"><BackIcon /></Pressable>
        <Text variant="label">Push notifications</Text>
        <View style={styles.iconButton} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 8, gap: 14, paddingBottom: insets.bottom + 32 }}>
        <View style={styles.card}>
          <Text variant="label">{pushSupported ? 'On this phone' : 'On the web'}</Text>
          {pushSupported ? (
            <View style={styles.line}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="bodyBold">Push notifications</Text>
                <Text variant="caption" style={{ color: colors.muted }}>{status ? STATUS_LINE[status] : ' '}</Text>
              </View>
              {status && status !== 'unavailable' ? (
                <Switch value={status === 'on'} onValueChange={(v) => void phoneSwitch(v)} accessibilityLabel="Push notifications on this phone" />
              ) : null}
            </View>
          ) : (
            <Text variant="body" style={{ color: colors.muted }}>Pushes go to the AirStrive app on your iPhone. These choices apply there.</Text>
          )}
          {status === 'off' ? <Button label="Open iOS Settings" kind="secondary" onPress={() => void Linking.openSettings()} /> : null}
        </View>

        <View style={[styles.card, { gap: 0, paddingVertical: 6 }]}>
          <Text variant="label" style={{ paddingVertical: 10 }}>Send me a push when</Text>
          {prefs.loading && !prefs.data ? <ActivityIndicator color={colors.muted} style={{ padding: 12 }} /> : null}
          {prefs.error && !prefs.data ? (
            <Text variant="body" style={{ color: colors.muted, paddingBottom: 10 }}>Couldn't reach AirStrive. Try again when you're back online.</Text>
          ) : null}
          {prefs.data ? KINDS.map(({ kind, label, note }, i) => (
            <View key={kind} style={[styles.line, styles.kind, i === 0 && { borderTopWidth: 0 }]}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="bodyBold">{label}</Text>
                {note ? <Text variant="caption" style={{ color: colors.muted }}>{note}</Text> : null}
              </View>
              <Switch value={!muted.includes(kind)} onValueChange={(v) => void toggle(kind, v)} accessibilityLabel={label} />
            </View>
          )) : null}
        </View>

        <Text variant="caption" style={{ paddingHorizontal: 4 }}>
          Everything still shows in Notifications on your profile. These choices follow your account to every phone.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10, paddingBottom: 6 },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  card: { padding: 16, borderRadius: radius.lg, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, gap: 10 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  kind: { paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.line },
});
