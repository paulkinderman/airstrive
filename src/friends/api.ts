import { supabase } from '@/lib/supabase';
import type { Database, TablesInsert } from '@/db/database.types';
import type { SquareState } from '@/db/repo';
import type { ReportReason } from '@/atlas/catalog';
import { asAudience, type Audience } from './audience';
import { showable } from '@/lib/remoteImage';

/**
 * Friends and other people's profiles. None of this is stored on the phone: it's read
 * from the server when a screen opens, through functions that return only what the
 * signed-in person may see (supabase/migrations/20261027000001_friends.sql).
 */

/** Where the signed-in person stands with someone. */
export type Relation = 'self' | 'friends' | 'requested' | 'incoming' | 'none';

export interface Person { id: string; username: string; relation: Relation }
export interface Friend { id: string; username: string; since: string }
export interface FriendRequest { id: string; username: string; createdAt: string }

export interface ProfileGrid {
  userGridId: string;
  gridId: string;
  title: string;
  color: string;
  cols: number;
  rows: number;
  audience: Audience;
  completedAt: string | null;
  states: SquareState[];
}

export interface Profile {
  id: string;
  username: string;
  bio: string;
  relation: Relation;
  grids: ProfileGrid[];
}

export interface SharedPhoto { id: string; storagePath: string; isCover: boolean; width: number; height: number }

export interface SharedMoment { id: string; title: string; body: string; happenedOn: string; fill: string; photos: SharedPhoto[] }

export interface SharedSquare { idx: number; state: SquareState; prompt: string; cluster: string; moment: SharedMoment | null }

export interface SharedBoard {
  userGridId: string;
  ownerId: string;
  owner: string;
  audience: Audience;
  completedAt: string | null;
  grid: { id: string; title: string; color: string; cols: number; rows: number; description: string; madeBy: string; revealIcon: string };
  squares: SharedSquare[];
}

type Row = Record<string, unknown>;

function client() {
  if (!supabase) throw new Error('AirStrive needs a connection for friends.');
  return supabase;
}

/** Function names are checked against the generated types; arguments and results are cast here. */
async function rpc<T>(fn: keyof Database['public']['Functions'], args?: Row): Promise<T> {
  const { data, error } = await client().rpc(fn, args as never);
  if (error) throw new Error(error.message);
  return data as T;
}

const asRelation = (v: unknown): Relation =>
  v === 'self' || v === 'friends' || v === 'requested' || v === 'incoming' ? v : 'none';

export async function searchUsernames(prefix: string): Promise<Person[]> {
  if (prefix.trim().length < 3) return [];
  const rows = await rpc<Row[]>('search_usernames', { prefix: prefix.trim() });
  return (rows ?? []).map((r) => ({ id: String(r.id), username: String(r.username), relation: asRelation(r.relation) }));
}

/** 'friends' when they had already asked you. */
export async function requestFriend(userId: string): Promise<'requested' | 'friends'> {
  return (await rpc<string>('request_friend', { target: userId })) === 'friends' ? 'friends' : 'requested';
}

export const respondRequest = (userId: string, accept: boolean) => rpc<void>('respond_request', { other: userId, accept });
export const cancelRequest = (userId: string) => rpc<void>('cancel_request', { other: userId });
export const removeFriend = (userId: string) => rpc<void>('remove_friend', { other: userId });
export const blockUser = (userId: string) => rpc<void>('block_user', { other: userId });
export const unblockUser = (userId: string) => rpc<void>('unblock_user', { other: userId });

export async function listFriends(): Promise<Friend[]> {
  const rows = await rpc<Row[]>('my_friends');
  return (rows ?? []).map((r) => ({ id: String(r.id), username: String(r.username ?? 'someone'), since: String(r.since) }));
}

/** A moment a friend shared lately, for From friends on the wide home screen. */
export interface FriendMoment {
  id: string; userId: string; username: string; title: string; happenedOn: string;
  fill: string; gridTitle: string; gridColor: string; coverPath: string | null;
}

export async function listFriendMoments(limit = 6): Promise<FriendMoment[]> {
  const rows = await rpc<Row[]>('friend_moments', { lim: limit });
  return (rows ?? []).map((r) => ({
    id: String(r.moment_id), userId: String(r.user_id), username: String(r.username ?? 'someone'), title: String(r.title),
    happenedOn: String(r.happened_on), fill: String(r.fill ?? ''), gridTitle: String(r.grid_title), gridColor: String(r.grid_color),
    coverPath: (r.cover_path as string) ?? null,
  }));
}

export async function listRequests(): Promise<FriendRequest[]> {
  const rows = await rpc<Row[]>('my_friend_requests');
  return (rows ?? []).map((r) => ({ id: String(r.id), username: String(r.username ?? 'someone'), createdAt: String(r.created_at) }));
}

export async function listBlocked(): Promise<{ id: string; username: string }[]> {
  const rows = await rpc<Row[]>('my_blocks');
  return (rows ?? []).map((r) => ({ id: String(r.id), username: String(r.username) }));
}

// ---------- codes (links and parsing in links.ts) ----------

export const myFriendCode = () => rpc<string>('my_friend_code');

export async function previewCode(code: string): Promise<Person | null> {
  const rows = await rpc<Row[]>('preview_friend_code', { code });
  const r = rows?.[0];
  return r ? { id: String(r.id), username: String(r.username), relation: asRelation(r.relation) } : null;
}

export async function acceptCode(code: string): Promise<boolean> {
  return (await rpc<string>('accept_friend_code', { code })) === 'friends';
}

// ---------- profiles ----------

export async function getProfile(userId: string): Promise<Profile | null> {
  const p = await rpc<Row | null>('profile', { target: userId });
  if (!p) return null;
  return {
    id: String(p.id),
    username: String(p.username ?? 'someone'),
    bio: String(p.bio ?? ''),
    relation: asRelation(p.relation),
    grids: ((p.grids as Row[]) ?? []).map((g) => ({
      userGridId: String(g.user_grid_id), gridId: String(g.grid_id), title: String(g.title), color: String(g.color),
      cols: Number(g.cols), rows: Number(g.rows), audience: asAudience(g.audience),
      completedAt: (g.completed_at as string) ?? null, states: ((g.states as SquareState[]) ?? []),
    })),
  };
}

export async function getSharedBoard(userGridId: string): Promise<SharedBoard | null> {
  const b = await rpc<Row | null>('profile_grid', { user_grid: userGridId });
  if (!b) return null;
  const g = b.grid as Row;
  return {
    userGridId: String(b.user_grid_id),
    ownerId: String(b.owner_id),
    owner: String(b.owner ?? 'someone'),
    audience: asAudience(b.audience),
    completedAt: (b.completed_at as string) ?? null,
    grid: {
      id: String(g.id), title: String(g.title), color: String(g.color), cols: Number(g.cols), rows: Number(g.rows),
      description: String(g.description ?? ''), madeBy: String(g.made_by ?? ''), revealIcon: String(g.reveal_icon ?? ''),
    },
    squares: ((b.squares as Row[]) ?? []).map((s) => {
      const m = s.moment as Row | null;
      return {
        idx: Number(s.idx), state: s.state as SquareState, prompt: String(s.prompt ?? ''), cluster: String(s.cluster ?? ''),
        moment: m ? {
          id: String(m.id), title: String(m.title), body: String(m.body ?? ''), happenedOn: String(m.happened_on),
          fill: String(m.fill ?? ''),
          photos: ((m.photos as Row[]) ?? []).map((p) => ({
            id: String(p.id), storagePath: String(p.storage_path), isCover: !!p.is_cover, width: Number(p.width), height: Number(p.height),
          })),
        } : null,
      };
    }),
  };
}

/**
 * Short-lived links for other people's photos. The storage policy lets a file through
 * only while its moment is visible to the viewer, so the links stop working once it isn't.
 */
export async function photoUrls(paths: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (paths.length === 0) return out;
  const { data, error } = await client().storage.from('photos').createSignedUrls(paths, 3600);
  if (error) throw new Error(error.message);
  await Promise.all((data ?? []).map(async (d) => {
    const { path, signedUrl } = d;
    if (signedUrl && path) out.set(path, await showable(signedUrl, path).catch(() => signedUrl));
  }));
  return out;
}

export async function saveBio(bio: string): Promise<void> {
  const { data: auth } = await client().auth.getUser();
  if (!auth.user) throw new Error('not signed in');
  const { error } = await client().from('users').update({ bio: bio.trim().slice(0, 280), updated_at: new Date().toISOString() }).eq('id', auth.user.id);
  if (error) throw new Error(error.message);
}

export async function myBio(): Promise<string> {
  const { data: auth } = await client().auth.getUser();
  if (!auth.user) return '';
  const { data } = await client().from('users').select('bio').eq('id', auth.user.id).maybeSingle();
  return String(data?.bio ?? '');
}

// ---------- reports ----------

async function report(row: TablesInsert<'reports'>): Promise<'ok' | 'already' | 'error'> {
  if (!supabase) return 'error';
  const { error } = await supabase.from('reports').insert(row);
  if (!error) return 'ok';
  return error.code === '23505' ? 'already' : 'error';
}

export const reportMoment = (momentId: string, reason: ReportReason, note: string) =>
  report({ target_kind: 'moment', moment_id: momentId, reason, note: note.trim().slice(0, 500) });

export const reportUser = (userId: string, reason: ReportReason, note: string) =>
  report({ target_kind: 'user', user_id: userId, reason, note: note.trim().slice(0, 500) });
