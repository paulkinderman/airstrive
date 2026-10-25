import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { uuidv5 } from '../src/lib/uuid5';
import { checkUsername } from '../src/lib/username';
import { STARTERS } from '../src/data/starters';
import { SIZES, placeClusters, startingSquares, neighbours } from '../src/data/types';

function referenceV5(name: string, ns: string) {
  const h = createHash('sha1').update(Buffer.from(ns.replace(/-/g, ''), 'hex')).update(name, 'utf8').digest();
  h[6] = (h[6] & 0x0f) | 0x50; h[8] = (h[8] & 0x3f) | 0x80;
  const x = h.subarray(0, 16).toString('hex');
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}

test('uuidv5 matches the RFC test vector and node crypto', () => {
  const dns = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
  assert.equal(uuidv5('www.example.com', dns), '2ed6657d-e927-568b-95e1-2665a8aea6a2');
  for (const name of ['', 'a', 'user_grid:x:grid_running', 'é🙂'.repeat(40)]) {
    assert.equal(uuidv5(name, dns), referenceV5(name, dns));
  }
});

test('usernames follow the rules', () => {
  for (const ok of ['paulk', 'Paul K', 'José', 'ñandú_99', 'a.b-c', '🏃‍♀️ runner', '🇺🇸', '👍🏽', 'x'.repeat(30), '😀'.repeat(30)]) {
    assert.equal(checkUsername(ok), null, ok);
  }
  assert.equal(checkUsername(''), 'empty');
  assert.equal(checkUsername('   '), 'empty');
  assert.equal(checkUsername(' paul'), 'spaces');
  assert.equal(checkUsername('x'.repeat(31)), 'too_long');
  assert.equal(checkUsername('😀'.repeat(31)), 'too_long');
  assert.equal(checkUsername('Admin'), 'reserved');
  for (const bad of ['Пётр', '山田', 'paul​k', 'pa\nul', 'a@b', 'Ωmega']) {
    assert.equal(checkUsername(bad), 'characters', bad);
  }
  assert.equal(checkUsername('José'), null, 'NFD accent normalizes');
});

test('starter grids fill their boards exactly', () => {
  assert.equal(STARTERS.length, 6);
  let total = 0;
  for (const g of STARTERS) {
    const { cols, rows } = SIZES[g.size];
    const placed = placeClusters(g);
    assert.equal(placed.length, cols * rows, g.title);
    assert.equal(new Set(placed.map((p) => p.idx)).size, cols * rows, `${g.title} indexes unique`);
    total += placed.length;
    for (const i of startingSquares(g.size)) assert.ok(i >= 0 && i < cols * rows);
  }
  assert.equal(total, 424);
  assert.equal(new Set(STARTERS.map((g) => g.id)).size, 6);
});

test('neighbours are orthogonal only', () => {
  assert.deepEqual(neighbours(0, 6, 8).sort((a, b) => a - b), [1, 6]);
  assert.deepEqual(neighbours(7, 6, 8).sort((a, b) => a - b), [1, 6, 8, 13]);
});
