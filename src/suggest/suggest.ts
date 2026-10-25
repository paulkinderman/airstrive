import { BANK, BLOCKED, GENERIC, type BankCluster } from './bank';
import { STARTERS } from '@/data/starters';
import { SIZES, spiralOrder, type GridSize } from '@/data/types';

/**
 * "Suggest the rest", without a model: fills the squares a person hasn't written from the
 * reviewed prompt bank. Clusters whose keywords appear in the grid's name come first, then
 * the grid's theme, then prompts that suit any grid. Suggestions arrive a cluster at a time
 * so related squares end up next to each other on the board.
 */

export interface Suggested { prompt: string; cluster: string }

export interface SuggestInput {
  name: string;
  theme: string;
  /** Squares already on the board: the person's own and suggestions they kept. */
  taken: string[];
  /** Suggestions the person turned down; never offered again for this grid. */
  rejected?: string[];
  count: number;
  /** Changes which prompts are picked from each cluster. */
  seed?: number;
}

const blocked = new RegExp(BLOCKED.source, BLOCKED.flags.replace('g', ''));

interface Pool { cluster: BankCluster; theme: string | null }

const POOL: Pool[] = [
  ...BANK.flatMap((t) => t.clusters.map((cluster) => ({ cluster, theme: t.theme as string }))),
  // The starter grids are reviewed too. Their clusters are matched by the grid's title.
  ...STARTERS.flatMap((g) =>
    g.clusters.map((c) => ({
      cluster: { name: c.name, keywords: g.title.toLowerCase().split(/\W+/).filter((w) => w.length > 2), prompts: c.prompts },
      theme: g.theme,
    })),
  ),
  ...GENERIC.map((cluster) => ({ cluster, theme: null })),
];

export function normalize(s: string): string {
  return s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
}

const STOP = new Set(['a', 'an', 'the', 'to', 'of', 'in', 'on', 'at', 'for', 'and', 'or', 'with', 'your', 'you', 'it', 'is', 'one', 'that', 'this']);

function words(s: string): Set<string> {
  return new Set(normalize(s).split(' ').filter((w) => w && !STOP.has(w)));
}

/** True when two prompts say nearly the same thing. */
export function similar(a: string, b: string): boolean {
  if (normalize(a) === normalize(b)) return true;
  const wa = words(a);
  const wb = words(b);
  if (wa.size === 0 || wb.size === 0) return false;
  let both = 0;
  for (const w of wa) if (wb.has(w)) both++;
  return both / (wa.size + wb.size - both) >= 0.6;
}

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function shuffled<T>(items: T[], rand: () => number): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function hits(keywords: string[], text: string): number {
  // Whole words, plural or not, so "tea" doesn't match "team".
  return keywords.filter((k) => new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(s|es)?\\b`).test(text)).length;
}

export function suggestRest(input: SuggestInput): Suggested[] {
  const rand = rng(input.seed ?? 1);
  const name = normalize(input.name);
  const written = normalize(input.taken.join(' '));
  const ranked = POOL.map((p) => {
    const named = hits(p.cluster.keywords, name);
    const mentioned = hits(p.cluster.keywords, written);
    const score = named * 10 + mentioned * 2 + (p.theme === input.theme ? 4 : 0) + (p.theme === null ? 1 : 0);
    return { p, score, tie: rand() };
  })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.tie - b.tie);

  const avoid = [...input.taken, ...(input.rejected ?? [])];
  const out: Suggested[] = [];
  for (const { p } of ranked) {
    for (const prompt of shuffled(p.cluster.prompts, rand)) {
      if (out.length >= input.count) return out;
      if (blocked.test(prompt) || /\d/.test(prompt)) continue;
      if (avoid.some((t) => similar(t, prompt)) || out.some((o) => similar(o.prompt, prompt))) continue;
      out.push({ prompt, cluster: p.cluster.name });
    }
  }
  return out;
}

export const OWN_CLUSTER = 'Your own';

/**
 * Places a made grid's squares: the person's own first, so they are the ones revealed at
 * the start, then the suggestions in cluster order along the spiral.
 */
export function layOut(size: GridSize, own: string[], suggested: Suggested[]): { idx: number; prompt: string; cluster: string }[] {
  const { cols, rows } = SIZES[size];
  const items = [...own.map((prompt) => ({ prompt, cluster: OWN_CLUSTER })), ...suggested];
  if (items.length !== cols * rows) throw new Error(`${items.length} squares for a ${cols * rows}-square board`);
  const order = spiralOrder(size);
  return items.map((item, i) => ({ idx: order[i], ...item }));
}
