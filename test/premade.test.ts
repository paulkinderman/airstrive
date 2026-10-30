import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PREMADE } from '../src/data/premade';
import { kinderMemories } from '../src/data/premade/family';
import { STARTERS } from '../src/data/starters';
import { SIZES, placeClusters } from '../src/data/types';
import { THEMES } from '../src/atlas/themes';
import { BLOCKED } from '../src/suggest/bank';
import { gridColors } from '../src/theme';

const ALL = [...PREMADE, kinderMemories];

test('premade grids fill their boards exactly', () => {
  for (const g of ALL) {
    const { cols, rows } = SIZES[g.size];
    const placed = placeClusters(g);
    assert.equal(new Set(placed.map((p) => p.idx)).size, cols * rows, `${g.title} indexes unique`);
  }
});

test('premade grids have their own ids, titles and a known theme and color', () => {
  const ids = [...STARTERS, ...ALL].map((g) => g.id);
  assert.equal(new Set(ids).size, ids.length);
  const titles = [...STARTERS, ...ALL].map((g) => g.title.toLowerCase());
  assert.equal(new Set(titles).size, titles.length);
  for (const g of ALL) {
    assert.match(g.id, /^grid_[a-z_]+$/, g.id);
    assert.ok((THEMES as readonly string[]).includes(g.theme), `${g.title}: ${g.theme}`);
    assert.ok((gridColors as readonly string[]).includes(g.color), `${g.title}: ${g.color}`);
    assert.ok(g.description.length > 0 && g.description.length <= 140, `${g.title} description`);
  }
});

test('premade prompts follow the house style', () => {
  for (const g of ALL) {
    const prompts = g.clusters.flatMap((c) => c.prompts);
    assert.equal(new Set(prompts.map((p) => p.toLowerCase())).size, prompts.length, `${g.title} repeats a prompt`);
    for (const p of prompts) {
      assert.doesNotMatch(p, /\d/, `digit: ${p}`);
      assert.ok(p.length <= 70, `too long: ${p}`);
      assert.doesNotMatch(p, /\.$/, `trailing period: ${p}`);
      assert.match(p, /^[A-Z]/, `sentence case: ${p}`);
      assert.match(p, /^[\x20-\x7e]+$/, `plain ASCII: ${p}`);
      assert.equal(p, p.trim(), `whitespace: ${p}`);
      const words = p.split(/\s+/).length;
      assert.ok(words >= 3 && words <= 10, `${words} words: ${p}`);
      assert.doesNotMatch(p, BLOCKED, `blocked: ${p}`);
    }
  }
});
