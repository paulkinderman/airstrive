import { Alert, Platform, Share } from 'react-native';
import { supabase } from '@/lib/supabase';
import type { Database } from '@/db/database.types';
import type { SquareState } from '@/db/repo';
import type { Relation } from './api';
import type { Invite } from './links';

/**
 * The share links behind "Join my grid", "Try this grid" and "See my grid", and the
 * preview every kind of link shows (supabase/migrations/20261102160000_share_links.sql).
 * Friend links themselves are in api.ts.
 */

type Row = Record<string, unknown>;

function client() {
  if (!supabase) throw new Error('Share links need a connection.');
  return supabase;
}

async function rpc<T>(fn: keyof Database['public']['Functions'], args?: Row): Promise<T> {
  const { data, error } = await client().rpc(fn, args as never);
  if (error) throw new Error(error.message);
  return data as T;
}

export interface GridCard { id: string; title: string; color: string; cols: number; rows: number; description: string; madeBy: string }

export interface PeekSquare { idx: number; state: SquareState; prompt: string; title: string | null }

export type InvitePreview =
  | { kind: 'f'; username: string; userId: string | null; relation: Relation | null }
  | { kind: 'g'; from: string; grid: GridCard; members: string[]; member: boolean }
  | { kind: 'a'; grid: GridCard; from: string | null; relation: Relation | null }
  | { kind: 'p'; owner: string; ownerId: string | null; relation: Relation | null; userGridId: string | null; grid: GridCard; squares: PeekSquare[] };

const asRelation = (v: unknown): Relation | null =>
  v === 'self' || v === 'friends' || v === 'requested' || v === 'incoming' || v === 'none' ? v : null;

const str = (v: unknown): string | null => (v == null ? null : String(v));

function card(g: Row): GridCard {
  return {
    id: String(g.id), title: String(g.title), color: String(g.color), cols: Number(g.cols), rows: Number(g.rows),
    description: String(g.description ?? ''), madeBy: String(g.made_by ?? ''),
  };
}

/** Turns invite_preview's answer into a typed preview. Exported for tests. */
export function readPreview(kind: Invite['kind'], r: Row | null): InvitePreview | null {
  if (!r) return null;
  switch (kind) {
    case 'f':
      return { kind, username: String(r.username), userId: str(r.user_id), relation: asRelation(r.relation) };
    case 'g':
      return {
        kind, from: String(r.from ?? 'someone'), grid: card(r.grid as Row),
        members: ((r.members as unknown[]) ?? []).map(String), member: !!r.member,
      };
    case 'a':
      return { kind, grid: card(r.grid as Row), from: str(r.from), relation: asRelation(r.relation) };
    case 'p':
      return {
        kind, owner: String(r.owner ?? 'someone'), ownerId: str(r.owner_id), relation: asRelation(r.relation),
        userGridId: str(r.user_grid_id), grid: card(r.grid as Row),
        squares: ((r.squares as Row[]) ?? []).map((s) => ({
          idx: Number(s.idx), state: s.state as SquareState, prompt: String(s.prompt ?? ''), title: str(s.title),
        })),
      };
  }
}

/** What a link is for, or null when it doesn't work. Works signed out. */
export async function previewInvite(i: Invite): Promise<InvitePreview | null> {
  const args: Row = { kind: i.kind, code: i.code };
  if (i.kind === 'a' && i.from) args.from_code = i.from;
  return readPreview(i.kind, await rpc<Row | null>('invite_preview', args));
}

export const resetFriendCode = () => rpc<string>('reset_friend_code');

export const groupLinkCode = (groupId: string) => rpc<string>('group_link', { grp: groupId });
export const stopGroupLink = (groupId: string) => rpc<void>('stop_group_link', { grp: groupId });
/** The group grid's id, or null when the link doesn't work. */
export const joinGroupLink = (code: string) => rpc<string | null>('join_group_link', { code });

/**
 * A peek link for one of your grids. The grid has to be on the server, with its audience,
 * so `syncNow` runs first, and once more if the server hasn't got it yet.
 */
export async function peekLinkCode(userGridId: string, syncNow: () => Promise<void>): Promise<string> {
  await syncNow();
  try {
    return await rpc<string>('peek_link', { user_grid: userGridId });
  } catch (e) {
    if (!(e instanceof Error && /grid not found|grid is private/.test(e.message))) throw e;
    await syncNow();
    return await rpc<string>('peek_link', { user_grid: userGridId });
  }
}
export const stopPeekLink = (userGridId: string) => rpc<void>('stop_peek_link', { user_grid: userGridId });
export const acceptPeekLink = async (code: string) => (await rpc<string>('accept_peek_link', { code })) === 'friends';

/**
 * Sends a link: the share sheet on a phone, and on the web the browser's share sheet where
 * there is one (phones), or the clipboard.
 */
export async function shareLink(message: string, link: string): Promise<void> {
  if (Platform.OS !== 'web') {
    await Share.share({ message: `${message} ${link}` });
    return;
  }
  const nav = globalThis.navigator as Navigator | undefined;
  if (nav?.share && /iphone|ipad|android/i.test(nav.userAgent)) {
    try {
      await nav.share({ text: message, url: link });
      return;
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') return; // closed without sharing
      // not allowed here: copy instead
    }
  }
  try {
    await nav?.clipboard.writeText(link);
    Alert.alert('Link copied', link);
  } catch {
    Alert.alert('Your link', link);
  }
}
