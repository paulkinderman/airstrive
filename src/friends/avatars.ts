import { useEffect, useState } from 'react';
import { useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';
import { supabase } from '@/lib/supabase';
import { getMeta, setMeta } from '@/db/queue';
import { newId } from '@/lib/ids';
import type { AvatarImage } from '@/lib/avatarImage';
import { useAuth } from '@/auth/AuthProvider';

/**
 * Profile pictures. Nothing about other people is kept in the phone's tables, so
 * pictures are asked for by user id when something shows them, a batch at a time, and
 * the server answers only for the people the viewer may see (yourself, friends, people
 * in a group grid with you: supabase/migrations/20261030000001_profile_pictures.sql).
 * The answers are kept in `meta` so they still show offline, and signing out clears it.
 */

const BUCKET = 'avatars';
const KEY = 'avatars';
/** How long an answer is trusted before asking again. Signed links last a day. */
const FRESH = 30 * 60 * 1000;
const LINK_SECONDS = 24 * 60 * 60;

/** What to give expo-image: the link, and the stored path as its cache key so a new link doesn't download again. */
export interface AvatarSource { uri: string; cacheKey: string }

interface Entry { path: string | null; url: string | null; at: number }

const entries = new Map<string, Entry>();
const listeners = new Set<() => void>();
const waiting = new Set<string>();
let owner: string | null = null;
let restored: Promise<void> | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

const notify = () => { for (const l of listeners) l(); };

function reset(me: string | null) {
  if (owner === me) return;
  owner = me;
  entries.clear();
  waiting.clear();
  restored = null;
  notify();
}

function restore(db: SQLiteDatabase): Promise<void> {
  restored ??= getMeta(db, KEY).then((kept) => {
    if (!kept) return;
    const saved = JSON.parse(kept) as Record<string, { path: string | null; url: string | null }>;
    for (const [id, e] of Object.entries(saved)) if (!entries.has(id)) entries.set(id, { ...e, at: 0 });
    notify();
  }).catch(() => {});
  return restored;
}

async function keep(db: SQLiteDatabase) {
  const out: Record<string, { path: string | null; url: string | null }> = {};
  for (const [id, e] of entries) out[id] = { path: e.path, url: e.url };
  await setMeta(db, KEY, JSON.stringify(out)).catch(() => {});
}

async function fetchBatch(db: SQLiteDatabase, ids: string[]) {
  if (!supabase || ids.length === 0) return;
  const forOwner = owner;
  const at = Date.now();
  try {
    const { data, error } = await supabase.rpc('avatars', { ids });
    if (error) throw error;
    const rows = (data ?? []) as { id: string; avatar_path: string }[];
    const urls = new Map<string, string>();
    if (rows.length) {
      const signed = await supabase.storage.from(BUCKET).createSignedUrls(rows.map((r) => r.avatar_path), LINK_SECONDS);
      if (signed.error) throw signed.error;
      for (const s of signed.data ?? []) if (s.path && s.signedUrl) urls.set(s.path, s.signedUrl);
    }
    if (owner !== forOwner) return;
    for (const id of ids) {
      const r = rows.find((row) => row.id === id);
      entries.set(id, r ? { path: r.avatar_path, url: urls.get(r.avatar_path) ?? null, at } : { path: null, url: null, at });
    }
    notify();
    await keep(db);
  } catch {
    // Offline: keep what was there, and ask again in a minute.
    if (owner !== forOwner) return;
    for (const id of ids) {
      const e = entries.get(id);
      entries.set(id, { path: e?.path ?? null, url: e?.url ?? null, at: at - FRESH + 60_000 });
    }
  }
}

function request(db: SQLiteDatabase, id: string) {
  const e = entries.get(id);
  if (e && Date.now() - e.at < FRESH) return;
  waiting.add(id);
  if (timer) return;
  timer = setTimeout(async () => {
    timer = null;
    await restore(db);
    const ids = [...waiting].filter((x) => { const k = entries.get(x); return !k || Date.now() - k.at >= FRESH; });
    waiting.clear();
    for (let i = 0; i < ids.length; i += 200) await fetchBatch(db, ids.slice(i, i + 200));
  }, 30);
}

function sourceOf(id: string | null | undefined): AvatarSource | null {
  const e = id ? entries.get(id) : undefined;
  return e?.path && e.url ? { uri: e.url, cacheKey: e.path } : null;
}

/** Someone's picture, or null to show their initial: none set, not one you may see, or not loaded yet. */
export function useAvatar(userId: string | null | undefined): AvatarSource | null {
  const db = useSQLiteContext();
  const { userId: me } = useAuth();
  const [source, setSource] = useState(() => sourceOf(userId));

  useEffect(() => {
    reset(me);
    const update = () => setSource((prev) => {
      const next = sourceOf(userId);
      return prev?.uri === next?.uri && prev?.cacheKey === next?.cacheKey ? prev : next;
    });
    listeners.add(update);
    update();
    if (userId && supabase) {
      void restore(db).then(update);
      request(db, userId);
    }
    return () => { listeners.delete(update); };
  }, [db, me, userId]);

  return source;
}

function client() {
  if (!supabase) throw new Error('Profile pictures need an account.');
  return supabase;
}

/** Uploads a new picture, points the profile at it, and removes the one it replaces. */
export async function setMyAvatar(db: SQLiteDatabase, me: string, image: AvatarImage): Promise<void> {
  const path = `${me}/${newId()}.jpg`;
  const storage = client().storage.from(BUCKET);
  const { error: upError } = await storage.upload(path, image.bytes, { contentType: 'image/jpeg' });
  if (upError) throw new Error(upError.message);
  const { data: old, error } = await client().rpc('set_avatar', { path });
  if (error) {
    await storage.remove([path]).catch(() => {});
    throw new Error(error.message);
  }
  if (old) await storage.remove([String(old)]).catch(() => {});
  entries.set(me, { path, url: image.uri, at: 0 });
  notify();
  await keep(db);
  request(db, me);
}

/** Takes the picture off the profile and deletes the file. */
export async function removeMyAvatar(db: SQLiteDatabase, me: string): Promise<void> {
  const { data: old, error } = await client().rpc('set_avatar', { path: null as unknown as string });
  if (error) throw new Error(error.message);
  if (old) await client().storage.from(BUCKET).remove([String(old)]).catch(() => {});
  entries.set(me, { path: null, url: null, at: Date.now() });
  notify();
  await keep(db);
}
