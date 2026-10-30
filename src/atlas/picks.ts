import { THEMES, gridMatch, rankThemes, type Theme } from './themes';
import { startsFor, type GridSize } from '@/data/types';

/** A grid as the Atlas shows it: enough for a card and a preview, without its squares. */
export interface AtlasGrid {
  id: string;
  title: string;
  color: string;
  theme: string;
  size: GridSize;
  cols: number;
  rows: number;
  description: string;
  madeBy: string;
  authorId: string | null;
  isOfficial: boolean;
  sharedAt: string | null;
  /** The prompts revealed when the grid starts, in board order. */
  starters: string[];
  /** The squares revealed when the grid starts. Missing from an Atlas cached before creators could pick them. */
  starts?: number[];
}

export function startersFrom(size: GridSize, squares: { idx: number; prompt: string }[], starts?: unknown): string[] {
  const start = startsFor(size, starts);
  return squares.filter((s) => start.includes(s.idx)).sort((a, b) => a.idx - b.idx).map((s) => s.prompt);
}

export interface Shelf { theme: Theme; grids: AtlasGrid[] }

/** Atlas rows by theme, official grids first, themes with nothing in them left out. */
export function byTheme(grids: AtlasGrid[]): Shelf[] {
  return THEMES.map((theme) => ({
    theme,
    grids: grids
      .filter((g) => g.theme === theme)
      .sort((a, b) => Number(b.isOfficial) - Number(a.isOfficial) || (b.sharedAt ?? '').localeCompare(a.sharedAt ?? '') || a.title.localeCompare(b.title)),
  })).filter((s) => s.grids.length > 0);
}

/** "This season": grids about the time of year, then grids about now-ish things, newest shared first. */
export function featured(grids: AtlasGrid[], today = new Date()): AtlasGrid[] {
  const month = today.getMonth();
  const season = month >= 2 && month <= 4 ? 'spring' : month >= 5 && month <= 7 ? 'summer' : month >= 8 && month <= 10 ? 'fall' : 'winter';
  const words: Record<string, RegExp> = {
    spring: /\bspring\b|\bblossom|\bgarden/i,
    summer: /\bsummer\b|\bbeach|\bswim/i,
    fall: /\bfall\b|\bautumn\b|\bhalloween|\bharvest/i,
    winter: /\bwinter\b|\bsnow|\bholiday|\bchristmas/i,
  };
  const now = grids.filter((g) => words[season].test(`${g.title} ${g.description}`));
  const rest = grids.filter((g) => !now.includes(g) && g.isOfficial && g.size !== 'tiny');
  return [...now, ...rest].slice(0, 5);
}

export function searchAtlas(grids: AtlasGrid[], q: string): AtlasGrid[] {
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return grids;
  return grids.filter((g) => {
    const text = `${g.title} ${g.theme} ${g.description} ${g.madeBy} ${g.starters.join(' ')}`.toLowerCase();
    return terms.every((t) => text.includes(t));
  });
}

export interface Pick { theme: Theme; because: string[]; grids: AtlasGrid[] }

/**
 * The categories suggested during onboarding: the themes that match the person's
 * interests, best first, each with its grids ordered by how closely they match.
 */
export function picksFor(interestIds: string[], grids: AtlasGrid[], max = 4): Pick[] {
  const out: Pick[] = [];
  for (const t of rankThemes(interestIds)) {
    const inTheme = grids
      .filter((g) => g.theme === t.theme)
      .map((g) => ({ g, score: gridMatch(interestIds, g) + (g.isOfficial ? 0.5 : 0) }))
      .sort((a, b) => b.score - a.score || a.g.title.localeCompare(b.g.title))
      .map((x) => x.g);
    if (inTheme.length === 0) continue;
    out.push({ theme: t.theme, because: t.because, grids: inTheme });
    if (out.length >= max) break;
  }
  return out;
}
