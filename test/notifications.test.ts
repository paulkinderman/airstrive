import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describe, when } from '@/notifications/text';
import type { AppNotification } from '@/notifications/api';

const base: AppNotification = {
  id: 'n1', kind: 'friend_request', actorId: 'u1', actorUsername: 'maya', groupId: null, gridTitle: null, gridColor: null,
  momentId: null, squareStateId: null, momentTitle: null, state: 'pending', createdAt: new Date().toISOString(), readAt: null,
};
const text = (n: Partial<AppNotification>) => describe({ ...base, ...n }).map((p) => p.text).join('');

test('each kind reads as a sentence', () => {
  assert.equal(text({}), 'maya wants to be friends');
  assert.equal(text({ state: 'done' }), "maya asked to be friends. You're friends now.");
  assert.equal(text({ kind: 'friend_accepted', state: 'done' }), 'You and maya are friends now');
  assert.equal(text({ kind: 'group_invite', gridTitle: 'Fall in the city' }), 'maya invited you to do Fall in the city together');
  assert.equal(text({ kind: 'group_joined', state: 'done', gridTitle: 'Our year' }), 'maya joined Our year');
  assert.equal(text({ kind: 'group_moment', state: 'done', gridTitle: 'Our year', momentTitle: 'Hayride' }), 'maya added “Hayride” to Our year');
  assert.equal(text({ kind: 'group_moment', state: 'done', gridTitle: 'Our year', momentTitle: '  ' }), 'maya added “a moment” to Our year');
  assert.deepEqual(describe(base)[0], { text: 'maya', bold: true }, 'names are bold');
});

test('times read short', () => {
  const now = Date.parse('2026-10-31T18:00:00');
  assert.equal(when('2026-10-31T17:59:30', now), 'Just now');
  assert.equal(when('2026-10-31T17:55:00', now), '5 min');
  assert.equal(when('2026-10-31T16:00:00', now), '2h');
  assert.equal(when('2026-10-30T09:00:00', now), 'Yesterday');
});
