import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** Null when the env vars are missing, so the page can say so instead of crashing. */
export const supabase: SupabaseClient | null =
  url && anonKey
    ? createClient(url, anonKey, {
        auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      })
    : null;

export function db(): SupabaseClient {
  if (!supabase) throw new Error('Supabase is not configured');
  return supabase;
}

/** Escapes % and _ so a search box value matches literally inside an ilike pattern. */
export function likePattern(q: string): string {
  return `%${q.trim().replace(/[\\%_]/g, (c) => '\\' + c)}%`;
}

export const DAY = 24 * 60 * 60 * 1000;

export function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function errorText(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message);
  return String(e);
}

// Row shapes for the columns this tool selects.

export type Square = { idx: number; prompt: string; cluster: string };

export type ReportRow = {
  id: string;
  reason: string;
  note: string;
  created_at: string;
  target_kind: 'grid' | 'moment' | 'user';
  grid_id: string | null;
  moment_id: string | null;
  user_id: string | null;
  reported: { username: string | null; sharing_suspended: boolean } | null;
  reporter: { username: string | null } | null;
  grid: {
    id: string;
    title: string;
    color: string;
    theme: string;
    made_by: string;
    cols: number;
    rows: number;
    is_hidden: boolean;
  } | null;
};

/** What admin_moment() returns for a reported moment. */
export type ReportedMoment = {
  id: string;
  title: string;
  body: string;
  happened_on: string;
  owner: string | null;
  grid: string;
  hidden: boolean;
  photos: string[];
};

export type GridRow = {
  id: string;
  title: string;
  color: string;
  theme: string;
  made_by: string;
  is_public: boolean;
  is_hidden: boolean;
  hidden_at: string | null;
  shared_at: string | null;
  author_id: string | null;
  author: { username: string | null } | null;
};

export type PersonRow = {
  id: string;
  username: string | null;
  created_at: string;
  sharing_suspended: boolean;
  is_admin: boolean;
};
