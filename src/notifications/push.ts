import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { supabase } from '@/lib/supabase';

/**
 * Push notifications on the phone. The app never asks for permission by itself: the
 * person turns pushes on from Notifications or Manage push notifications. Once allowed,
 * each launch registers this phone's Expo push token with the account, and signing out
 * removes it. The server decides what to send (supabase/functions/send-push).
 */

// A push that arrives while the app is open still shows as a banner.
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: true }),
});

/** on: allowed. ask: never asked. off: turned off in iOS Settings. unavailable: this build can't. */
export type PushStatus = 'on' | 'ask' | 'off' | 'unavailable';

/** What a tap on a push carries (push_payload in the notifications migration). */
export interface PushData {
  notificationId?: string;
  kind?: string;
  actorId?: string;
  groupId?: string;
  squareStateId?: string;
}

export const pushSupported = true;

export async function pushStatus(): Promise<PushStatus> {
  try {
    const p = await Notifications.getPermissionsAsync();
    if (p.granted || p.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) return 'on';
    return p.canAskAgain ? 'ask' : 'off';
  } catch {
    return 'unavailable';
  }
}

async function token(): Promise<string | null> {
  const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
  try {
    return (await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined)).data;
  } catch {
    // No push entitlement in this build, or no connection.
    return null;
  }
}

async function register(): Promise<void> {
  if (!supabase) return;
  const t = await token();
  if (!t) return;
  await supabase.rpc('register_push_token', { token: t, platform: Platform.OS === 'ios' ? 'ios' : 'android' });
}

/** On launch: keeps the server's copy of this phone's token fresh, without asking. */
export async function registerIfAllowed(): Promise<void> {
  if ((await pushStatus()) === 'on') await register().catch(() => {});
}

/** Shows iOS's "Allow notifications?" (only possible once), and registers if allowed. */
export async function turnOnPush(): Promise<PushStatus> {
  try {
    const r = await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowBadge: true, allowSound: true } });
    if (r.granted) { await register().catch(() => {}); return 'on'; }
    return r.canAskAgain ? 'ask' : 'off';
  } catch {
    return 'unavailable';
  }
}

/** Before signing out, so the next person on this phone doesn't get the last one's pushes. */
export async function forgetPush(): Promise<void> {
  if (!supabase || (await pushStatus()) !== 'on') return;
  const t = await token();
  if (t) await supabase.rpc('unregister_push_token', { token: t });
}

export function setBadge(n: number) {
  Notifications.setBadgeCountAsync(n).catch(() => {});
}

export function onPushReceived(cb: () => void): () => void {
  const sub = Notifications.addNotificationReceivedListener(() => cb());
  return () => sub.remove();
}

/** Taps on a push, including the one that launched the app. Each tap is handled once. */
export function onPushTapped(cb: (data: PushData) => void): () => void {
  const seen = new Set<string>();
  const handle = (r: Notifications.NotificationResponse | null) => {
    if (!r || r.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    const key = r.notification.request.identifier;
    if (seen.has(key)) return;
    seen.add(key);
    cb((r.notification.request.content.data ?? {}) as PushData);
    Notifications.clearLastNotificationResponseAsync().catch(() => {});
  };
  Notifications.getLastNotificationResponseAsync().then(handle).catch(() => {});
  const sub = Notifications.addNotificationResponseReceivedListener(handle);
  return () => sub.remove();
}
