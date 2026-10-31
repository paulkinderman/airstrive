import { supabase } from '@/lib/supabase';
import type { Database } from '@/db/database.types';

/**
 * Notifications live on the server only, like friends: read when a screen opens, through
 * functions that return the signed-in person's own (supabase/migrations/20261031180000_notifications.sql).
 */

export type NotificationKind = 'friend_request' | 'friend_accepted' | 'group_invite' | 'group_joined' | 'group_moment';

/** Where a request or invite stands now. Everything else is 'done'. */
export type NotificationState = 'pending' | 'done';

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  actorId: string | null;
  actorUsername: string;
  groupId: string | null;
  gridTitle: string | null;
  gridColor: string | null;
  momentId: string | null;
  squareStateId: string | null;
  momentTitle: string | null;
  state: NotificationState;
  createdAt: string;
  readAt: string | null;
}

/** Each kind, in the order the push settings list them. */
export const KINDS: { kind: NotificationKind; label: string; note?: string }[] = [
  { kind: 'friend_request', label: 'Someone asks to be friends' },
  { kind: 'friend_accepted', label: 'Someone accepts', note: 'Or adds you with your QR code' },
  { kind: 'group_invite', label: "I'm invited to do a grid together" },
  { kind: 'group_moment', label: 'Someone posts in a grid we share' },
  { kind: 'group_joined', label: 'Someone joins a grid we share' },
];

type Row = Record<string, unknown>;

async function rpc<T>(fn: keyof Database['public']['Functions'], args?: Row): Promise<T> {
  if (!supabase) throw new Error('AirStrive needs a connection for notifications.');
  const { data, error } = await supabase.rpc(fn, args as never);
  if (error) throw new Error(error.message);
  return data as T;
}

const str = (v: unknown) => (v == null ? null : String(v));

export async function listNotifications(limit = 100): Promise<AppNotification[]> {
  const rows = await rpc<Row[]>('my_notifications', { lim: limit });
  return (rows ?? []).map((r) => ({
    id: String(r.id),
    kind: r.kind as NotificationKind,
    actorId: str(r.actor_id),
    actorUsername: String(r.actor_username ?? 'someone'),
    groupId: str(r.group_id),
    gridTitle: str(r.grid_title),
    gridColor: str(r.grid_color),
    momentId: str(r.moment_id),
    squareStateId: str(r.square_state_id),
    momentTitle: str(r.moment_title),
    state: r.state === 'pending' ? 'pending' : 'done',
    createdAt: String(r.created_at),
    readAt: str(r.read_at),
  }));
}

export const unreadCount = () => rpc<number>('unread_notifications').then((n) => Number(n ?? 0));

/** One notification, or all of them. */
export const markRead = (id?: string) => rpc<void>('mark_notifications_read', id ? { notification: id } : {});

export async function pushOff(): Promise<NotificationKind[]> {
  return ((await rpc<string[]>('my_push_off')) ?? []) as NotificationKind[];
}

export async function setPush(kind: NotificationKind, on: boolean): Promise<NotificationKind[]> {
  return ((await rpc<string[]>('set_push_kind', { kind, push: on })) ?? []) as NotificationKind[];
}

export { describe, when } from './text';
