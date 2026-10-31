import type { AppNotification } from './api';

/** The sentence a notification shows, split so the names can be bold. */
export function describe(n: AppNotification): { text: string; bold?: boolean }[] {
  const who = { text: n.actorUsername, bold: true };
  const grid = { text: n.gridTitle ?? 'a grid', bold: true };
  switch (n.kind) {
    case 'friend_request':
      return n.state === 'pending' ? [who, { text: ' wants to be friends' }] : [who, { text: ' asked to be friends. You\'re friends now.' }];
    case 'friend_accepted':
      return [{ text: 'You and ' }, who, { text: ' are friends now' }];
    case 'group_invite':
      return n.state === 'pending'
        ? [who, { text: ' invited you to do ' }, grid, { text: ' together' }]
        : [who, { text: ' invited you to ' }, grid, { text: '. You joined.' }];
    case 'group_joined':
      return [who, { text: ' joined ' }, grid];
    case 'group_moment':
      return [who, { text: ` added “${n.momentTitle?.trim() || 'a moment'}” to ` }, grid];
  }
}

/** "5 min", "2h", "Yesterday", "Tue", then a date. */
export function when(iso: string, now = Date.now()): string {
  const t = Date.parse(iso);
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return 'Just now';
  if (s < 3600) return `${Math.round(s / 60)} min`;
  if (s < 86400) return `${Math.round(s / 3600)}h`;
  const d = new Date(t);
  const days = Math.floor((new Date(now).setHours(0, 0, 0, 0) - new Date(t).setHours(0, 0, 0, 0)) / 86400000);
  if (days <= 1) return 'Yesterday';
  if (days < 7) return d.toLocaleDateString(undefined, { weekday: 'short' });
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
