import type { SQLiteDatabase } from 'expo-sqlite';
import { supabase } from '@/lib/supabase';
import { cachedFetch, type Cached } from '@/lib/remote';
import { useRemote } from '@/lib/useRemote';
import { listTemplates, getTemplate } from '@/db/repo';
import { ensureGrids, normalizeTs } from '@/sync/engine';
import { supabaseRemote } from '@/sync/supabaseRemote';
import { startsFor, type GridSize } from '@/data/types';
import { startersFrom, type AtlasGrid } from './picks';

const CACHE = 'atlas_cache';

async function localAtlas(db: SQLiteDatabase): Promise<AtlasGrid[]> {
  const out: AtlasGrid[] = [];
  for (const g of await listTemplates(db)) {
    if (!g.is_public && !g.is_official) continue;
    const t = await getTemplate(db, g.id);
    out.push({
      id: g.id, title: g.title, color: g.color, theme: g.theme, size: g.size, cols: g.cols, rows: g.rows,
      description: g.description, madeBy: g.made_by, authorId: g.author_id, isOfficial: g.is_official === 1,
      sharedAt: null, starters: startersFrom(g.size, t?.squares ?? [], g.starts), starts: startsFor(g.size, g.starts),
    });
  }
  return out;
}

function fromRpc(r: Record<string, unknown>): AtlasGrid {
  return {
    id: String(r.id), title: String(r.title), color: String(r.color), theme: String(r.theme), size: r.size as GridSize,
    cols: Number(r.cols), rows: Number(r.rows), description: String(r.description ?? ''), madeBy: String(r.made_by ?? ''),
    authorId: (r.author_id as string) ?? null, isOfficial: !!r.is_official, sharedAt: normalizeTs(r.shared_at),
    starters: (r.starters as string[]) ?? [], starts: startsFor(r.size as GridSize, r.starts),
  };
}

/**
 * Everything browsable in the Atlas. Fetched from the server when there's a connection
 * and kept on the phone, so the Atlas still opens offline with what it last saw (or, on a
 * phone that has never been online, the official grids it ships with).
 */
export async function loadAtlas(db: SQLiteDatabase): Promise<Cached<AtlasGrid[]>> {
  const client = supabase;
  const fetcher = client
    ? async () => {
        const { data, error } = await client.rpc('atlas_grids');
        if (error || !Array.isArray(data)) throw new Error(error?.message ?? 'atlas_grids returned no list');
        return data.map(fromRpc);
      }
    : null;
  return cachedFetch(db, CACHE, fetcher, () => localAtlas(db));
}

/** The Atlas for a screen: loads on focus, with refresh for pull-to-refresh. */
export function useAtlas() {
  return useRemote(loadAtlas);
}

/** One grid for the preview: from the Atlas if it's shared, otherwise from the phone (a private grid of your own). */
export async function findGrid(db: SQLiteDatabase, gridId: string): Promise<AtlasGrid | null> {
  const { data: grids } = await loadAtlas(db);
  const shared = grids.find((g) => g.id === gridId);
  if (shared) return shared;
  const t = await getTemplate(db, gridId);
  if (!t) return null;
  const g = t.grid;
  return {
    id: g.id, title: g.title, color: g.color, theme: g.theme, size: g.size, cols: g.cols, rows: g.rows,
    description: g.description, madeBy: g.made_by, authorId: g.author_id, isOfficial: g.is_official === 1,
    sharedAt: null, starters: startersFrom(g.size, t.squares, g.starts), starts: startsFor(g.size, g.starts),
  };
}

/** Makes sure a grid's template and squares are on the phone, fetching them if needed. */
export async function ensureTemplate(db: SQLiteDatabase, gridId: string): Promise<boolean> {
  if (await getTemplate(db, gridId)) return true;
  if (!supabase) return false;
  await ensureGrids(db, supabaseRemote(supabase), [gridId]);
  return !!(await getTemplate(db, gridId));
}

export type ReportReason = 'harassment' | 'hateful' | 'spam' | 'other';

export async function reportGrid(gridId: string, reason: ReportReason, note: string): Promise<'ok' | 'already' | 'error'> {
  if (!supabase) return 'error';
  const { error } = await supabase.from('reports').insert({ grid_id: gridId, reason, note: note.trim().slice(0, 500) });
  if (!error) return 'ok';
  return error.code === '23505' ? 'already' : 'error';
}
