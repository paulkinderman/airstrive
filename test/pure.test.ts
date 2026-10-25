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

test('chapter captions read like the design', async () => {
  const { chapterCaption, posterHtml, scrapbookHtml } = await import('../src/lib/printables');
  assert.equal(chapterCaption(120, '2026-01-12', '2026-10-24'), '120 moments · Jan 12 to Oct 24, 2026');
  assert.equal(chapterCaption(3, '2025-12-30', '2026-01-02'), '3 moments · Dec 30, 2025 to Jan 2, 2026');
  assert.equal(chapterCaption(1, '2026-10-24', '2026-10-24'), '1 moment · Oct 24, 2026');
  const html = posterHtml({ gridTitle: 'Fall <3', gridColor: '#C4612D', cols: 6, tiles: Array(48).fill(null), caption: 'x' });
  assert.ok(html.includes('Fall &lt;3'), 'escapes text');
  const book = scrapbookHtml([
    { kind: 'moment', moment: { title: 'Newer', gridTitle: 'Fall', gridColor: '#C4612D', happenedOn: '2026-10-25', body: '', place: '', weather: '', withPeople: '', photos: [] } },
    { kind: 'moment', moment: { title: 'Older', gridTitle: 'Fall', gridColor: '#C4612D', happenedOn: '2026-10-01', body: 'hi', place: 'Park', weather: '', withPeople: '', photos: [] } },
  ], 'paulk');
  assert.ok(book.indexOf('Older') < book.indexOf('Newer'), 'oldest page first');
});
