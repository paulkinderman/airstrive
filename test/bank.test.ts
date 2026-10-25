import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BANK, BLOCKED, GENERIC, type ThemeName } from '../src/suggest/bank';
import { STARTERS } from '../src/data/starters';

// `satisfies` makes tsc fail if a ThemeName is added without being listed here.
const THEMES = Object.keys({
  Movement: 1, Outdoors: 1, Games: 1, Mind: 1, People: 1, Family: 1, Food: 1, Making: 1, Places: 1, Seasons: 1, Wellness: 1,
} satisfies Record<ThemeName, 1>) as ThemeName[];

const clusters = [...BANK.flatMap((t) => t.clusters), ...GENERIC];
const prompts = clusters.flatMap((c) => c.prompts);
const starterPrompts = STARTERS.flatMap((g) => g.clusters.flatMap((c) => c.prompts));

test('every theme appears exactly once', () => {
  assert.deepEqual(BANK.map((t) => t.theme).sort(), THEMES.slice().sort());
});

test('each theme is deep enough to fill a full board', () => {
  for (const t of BANK) {
    const n = t.clusters.reduce((sum, c) => sum + c.prompts.length, 0);
    assert.ok(n >= 120, `${t.theme} has ${n}`);
  }
  const g = GENERIC.reduce((sum, c) => sum + c.prompts.length, 0);
  assert.ok(g >= 90, `GENERIC has ${g}`);
});

test('clusters are sized and keyworded', () => {
  for (const c of clusters) {
    assert.ok(c.prompts.length >= 8 && c.prompts.length <= 16, `${c.name} has ${c.prompts.length}`);
    assert.ok(c.keywords.length > 0, `${c.name} has keywords`);
    for (const k of c.keywords) {
      assert.ok(k.trim().length > 0, `${c.name}: empty keyword`);
      assert.equal(k, k.toLowerCase(), `${c.name}: ${k} is lowercase`);
      assert.match(k, /^[a-z]+( [a-z]+)*$/, `${c.name}: ${k} survives name normalizing`);
    }
  }
});

test('prompts follow the house style', () => {
  for (const p of prompts) {
    assert.doesNotMatch(p, /\d/, `digit: ${p}`);
    assert.ok(p.length <= 70, `too long: ${p}`);
    assert.doesNotMatch(p, /\.$/, `trailing period: ${p}`);
    assert.match(p, /^[A-Z]/, `sentence case: ${p}`);
    assert.match(p, /^[\x20-\x7e]+$/, `plain ASCII: ${p}`);
    assert.equal(p, p.trim(), `whitespace: ${p}`);
    const words = p.split(/\s+/).length;
    assert.ok(words >= 3 && words <= 10, `${words} words: ${p}`);
    // Allowed in the starters' voice, but the bank keeps clear of clocks and tallies.
    assert.doesNotMatch(p, /\b(?:minutes?|hours?|seconds|count|counting|in a row|times)\b/i, `metric-ish: ${p}`);
  }
});

test('BLOCKED catches what it should and spares the starters', () => {
  for (const p of prompts) assert.doesNotMatch(p, BLOCKED, `blocked: ${p}`);
  for (const p of starterPrompts) assert.doesNotMatch(p, BLOCKED, `starter blocked: ${p}`);
  for (const bad of [
    'Lose weight before summer', 'Burn calories', 'Lift 50 kg', 'Drop ten lbs', 'Lose a pound', 'Start a diet',
    'Hold your pace', 'Ride at 20 mph', 'Run a 5 km', 'Walk a mile', 'Set a personal best', 'Hit a new PR',
    'Keep your streak alive', 'Score points', 'Top the leaderboard', 'Rank first', 'Beat your best time',
    'self-harm', 'suicide', 'Get drunk', 'Do shots',
  ]) {
    assert.match(bad, BLOCKED, bad);
  }
  for (const ok of ['Watch the Flatiron at golden hour', 'Practice a form at sunrise', 'Take photos in the rain', 'Find the reddest leaf you can', 'Learn a trick shot']) {
    assert.doesNotMatch(ok, BLOCKED, ok);
  }
});

test('no prompt appears twice, here or in the starter grids', () => {
  const seen = new Map<string, string>();
  for (const p of [...starterPrompts, ...prompts]) {
    const key = p.toLowerCase();
    assert.ok(!seen.has(key), `duplicate: ${p}`);
    seen.set(key, p);
  }
});
