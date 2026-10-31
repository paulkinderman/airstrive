/** The web app has no pushes; Notifications still shows everything. */
export type PushStatus = 'on' | 'ask' | 'off' | 'unavailable';
export interface PushData { notificationId?: string; kind?: string; actorId?: string; groupId?: string; squareStateId?: string }

export const pushSupported = false;
export const pushStatus = async (): Promise<PushStatus> => 'unavailable';
export const registerIfAllowed = async () => {};
export const turnOnPush = async (): Promise<PushStatus> => 'unavailable';
export const forgetPush = async () => {};
export const setBadge = (_n: number) => {};
export const onPushReceived = (_cb: () => void) => () => {};
export const onPushTapped = (_cb: (data: PushData) => void) => () => {};
