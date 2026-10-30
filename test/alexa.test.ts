import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSign } from 'node:crypto';
import {
  handle, localClock, matchFriend, spokenDay, spokenName, NotLinked,
  type AlexaRequest, type Data, type FriendMoment, type ShelfGrid,
} from '../supabase/functions/alexa/skill.ts';
import { certUrlOk, verifyAlexa } from '../supabase/functions/alexa/verify.ts';

const PAUL = 'p0000000-0000-4000-8000-000000000001';
const JEAN = 'j0000000-0000-4000-8000-000000000002';
const NOW = '2026-10-30T15:00:00Z';

const moments: FriendMoment[] = [
  { moment_id: 'm1', user_id: PAUL, username: 'paul_k', title: 'First pottery class', happened_on: '2026-10-26', grid_title: 'Try something new', grid_color: '#F0634A', cover_path: `${PAUL}/a.webp` },
  { moment_id: 'm2', user_id: JEAN, username: 'Jean', title: 'Book club', happened_on: '2026-10-29', grid_title: 'Read more', grid_color: '#9C8CB8', cover_path: null },
  { moment_id: 'm3', user_id: PAUL, username: 'paul_k', title: 'Sunrise hike', happened_on: '2026-10-12', grid_title: 'Get outside', grid_color: '#2EB08A', cover_path: `${PAUL}/b.webp` },
];

const garden: ShelfGrid = {
  user_grid_id: 'g1', title: 'Our garden year', color: '#F5B61C', cols: 2, rows: 2, finished: false, together: false,
  done: 1, total: 4, next_up: 'Plant tulip bulbs',
  squares: [
    { idx: 0, state: 'done', prompt: 'Start seeds', title: 'Tomatoes in', happened_on: '2026-04-02', cover_path: 'me/c.webp' },
    { idx: 1, state: 'revealed', prompt: 'Plant tulip bulbs', title: null, happened_on: null, cover_path: null },
    { idx: 2, state: 'hidden', prompt: '', title: null, happened_on: null, cover_path: null },
    { idx: 3, state: 'hidden', prompt: '', title: null, happened_on: null, cover_path: null },
  ],
};

function fakeData(over: Partial<Data> = {}): Data {
  return {
    friendMoments: async (n) => moments.slice(0, n),
    shelf: async () => [garden],
    friends: async () => [{ id: PAUL, username: 'paul_k' }, { id: JEAN, username: 'Jean' }],
    photoUrls: async (paths) => new Map(paths.map((p) => [p, `https://signed.example/${p}`])),
    ...over,
  };
}

function request(type: string, extra: Partial<AlexaRequest['request']> = {}, screen = true, token: string | null = 'tok'): AlexaRequest {
  return {
    version: '1.0',
    context: { System: {
      application: { applicationId: 'amzn1.ask.skill.test' },
      user: { userId: 'u', accessToken: token ?? undefined },
      device: { supportedInterfaces: screen ? { 'Alexa.Presentation.APL': { runtime: { maxVersion: '2023.3' } } } : {} },
    } },
    request: { type, requestId: 'r', timestamp: NOW, ...extra },
  };
}
const intent = (name: string, slots?: Record<string, { name: string; value?: string }>) => request('IntentRequest', { intent: { name, slots } });
const ssml = (r: Awaited<ReturnType<typeof handle>>) => r.response.outputSpeech?.ssml ?? '';
const rendered = (r: Awaited<ReturnType<typeof handle>>) => r.response.directives?.find((d) => d.type === 'Alexa.Presentation.APL.RenderDocument');

test('days and names read naturally', () => {
  const now = new Date(NOW);
  assert.equal(spokenDay('2026-10-30', now), 'today');
  assert.equal(spokenDay('2026-10-29', now), 'yesterday');
  assert.equal(spokenDay('2026-10-26', now), 'on Monday');
  assert.equal(spokenDay('2026-10-12', now), 'on October 12');
  // 1am in New York is still the evening before in Los Angeles.
  const late = new Date('2026-10-30T05:00:00Z');
  assert.equal(spokenDay('2026-10-29', localClock(late, 'America/New_York')), 'yesterday');
  assert.equal(spokenDay('2026-10-29', localClock(late, 'America/Los_Angeles')), 'today');
  assert.equal(localClock(late, 'Not/AZone').getTime(), late.getTime(), 'an unknown zone keeps UTC');
  assert.equal(spokenName('paul_k'), 'paul k');
  assert.equal(spokenName('jean.smith99'), 'jean smith');
  assert.equal(spokenName('42'), '42');
});

test('without a linked account it asks to link, with a card and the link screen', async () => {
  const r = await handle(request('LaunchRequest', {}, true, null), fakeData());
  assert.equal(r.response.card?.type, 'LinkAccount');
  assert.equal(rendered(r)?.token, 'link');
  assert.equal(r.response.shouldEndSession, true);
});

test('a refused token asks to link again', async () => {
  const r = await handle(request('LaunchRequest'), fakeData({ shelf: async () => { throw new NotLinked('jwt expired'); } }));
  assert.equal(r.response.card?.type, 'LinkAccount');
});

test('opening shows home with the newest moment, signed photo links and friends as names Alexa knows', async () => {
  const r = await handle(request('LaunchRequest'), fakeData());
  assert.match(ssml(r), /Good (morning|afternoon|evening)\. paul k shared First pottery class on Monday\./);
  const doc = rendered(r);
  assert.equal(doc.token, 'home');
  assert.equal(doc.datasources.payload.hero.url, `https://signed.example/${PAUL}/a.webp`);
  assert.equal(doc.datasources.payload.rest[0].url, null, 'no photo: the grid color stands in');
  assert.equal(doc.datasources.payload.grids[0].nextUp, 'Plant tulip bulbs');
  const names = r.response.directives?.find((d) => d.type === 'Dialog.UpdateDynamicEntities');
  assert.deepEqual(names.types[0].values[0], { id: PAUL, name: { value: 'paul_k', synonyms: ['paul k'] } });
  assert.equal(r.response.shouldEndSession, undefined, 'screen stays up without the microphone');
});

test('home with no friends\' moments shows the shelf', async () => {
  const r = await handle(request('LaunchRequest'), fakeData({ friendMoments: async () => [] }));
  assert.equal(rendered(r).datasources.payload.hasPhotos, false);
  assert.match(ssml(r), /Next up on Our garden year: Plant tulip bulbs\./);
});

test('on an Echo without a screen it speaks and listens', async () => {
  const r = await handle(request('LaunchRequest', {}, false), fakeData());
  assert.equal(rendered(r), undefined);
  assert.match(ssml(r), /paul k did First pottery class on Monday\. Jean did Book club yesterday\. And paul k did Sunrise hike on October 12\./);
  assert.equal(r.response.shouldEndSession, false);
});

test('show photos for one friend, by Alexa\'s match or by what it heard', async () => {
  const byId = await handle(request('IntentRequest', { intent: { name: 'ShowPhotosIntent', slots: { person: {
    name: 'person', value: 'paul',
    resolutions: { resolutionsPerAuthority: [{ authority: 'amzn1.er-authority.echo-sdk.dynamic', status: { code: 'ER_SUCCESS_MATCH' }, values: [{ value: { id: PAUL, name: 'paul_k' } }] }] },
  } as never } } }), fakeData());
  const doc = rendered(byId);
  assert.equal(doc.token, 'photos');
  assert.deepEqual(doc.datasources.payload.photos.map((p: { title: string }) => p.title), ['First pottery class', 'Sunrise hike']);
  assert.ok(doc.document.onMount, 'turns pages by itself');

  const heard = await handle(intent('ShowPhotosIntent', { person: { name: 'person', value: "Jean's" } }), fakeData());
  assert.deepEqual(rendered(heard).datasources.payload.photos.map((p: { title: string }) => p.title), ['Book club']);

  const nobody = await handle(intent('ShowPhotosIntent', { person: { name: 'person', value: 'Zed' } }), fakeData());
  assert.match(ssml(nobody), /couldn't find a friend called Zed/);
  assert.equal(rendered(nobody).datasources.payload.photos.length, 3, 'everyone instead');
});

test('matchFriend ignores spacing and punctuation', () => {
  const friends = [{ id: PAUL, username: 'paul_k' }, { id: JEAN, username: 'Jean' }];
  assert.equal(matchFriend({ name: 'person', value: 'paul k' }, friends)?.id, PAUL);
  assert.equal(matchFriend({ name: 'person', value: 'Paul' }, friends)?.id, PAUL);
  assert.equal(matchFriend({ name: 'person', value: 'nobody' }, friends), null);
});

test('next and back turn the photo show and keep it going', async () => {
  const r = await handle(intent('AMAZON.NextIntent'), fakeData());
  const cmd = r.response.directives?.[0];
  assert.equal(cmd.type, 'Alexa.Presentation.APL.ExecuteCommands');
  assert.equal(cmd.commands[0].commands[0].value, 1);
  assert.equal(cmd.commands[0].commands[1].type, 'AutoPage');
});

test('what\'s next reads Next up and shows the board with done squares\' photos', async () => {
  const r = await handle(intent('NextUpIntent'), fakeData());
  assert.match(ssml(r), /On Our garden year: Plant tulip bulbs\./);
  const doc = rendered(r);
  assert.equal(doc.token, 'grid');
  const [first, second] = doc.datasources.payload.board;
  assert.equal(first.squares[0].url, 'https://signed.example/me/c.webp');
  assert.equal(first.squares[1].color.length, 7, 'revealed squares are tinted');
  assert.equal(second.squares.length, 2);
});

test('tapping a done square opens its moment; a waiting one is read out', async () => {
  const done = await handle(request('Alexa.Presentation.APL.UserEvent', { arguments: ['square', 'g1', 0] }), fakeData());
  assert.equal(rendered(done).token, 'moment');
  assert.equal(rendered(done).datasources.payload.photos[0].title, 'Tomatoes in');
  const waiting = await handle(request('Alexa.Presentation.APL.UserEvent', { arguments: ['square', 'g1', 1] }), fakeData());
  assert.match(ssml(waiting), /Plant tulip bulbs\. This one's still waiting\./);
});

test('titles are escaped for speech', async () => {
  const r = await handle(intent('WhatsNewIntent'), fakeData({ friendMoments: async () => [{ ...moments[0], title: 'Fish & chips <3' }] }));
  assert.match(ssml(r), /Fish &amp; chips &lt;3/);
});

test('stop ends the session', async () => {
  const r = await handle(intent('AMAZON.StopIntent'), fakeData());
  assert.equal(r.response.shouldEndSession, true);
});

test('only Amazon\'s certificate address is accepted', () => {
  assert.ok(certUrlOk('https://s3.amazonaws.com/echo.api/echo-api-cert.pem'));
  assert.ok(certUrlOk('https://s3.amazonaws.com:443/echo.api/../echo.api/echo-api-cert.pem'));
  assert.ok(certUrlOk('HTTPS://s3.AmazonAWS.com/echo.api/echo-api-cert.pem'));
  for (const bad of [
    'http://s3.amazonaws.com/echo.api/echo-api-cert.pem',
    'https://notamazon.com/echo.api/echo-api-cert.pem',
    'https://s3.amazonaws.com/EcHo.aPi/echo-api-cert.pem',
    'https://s3.amazonaws.com/invalid.path/echo-api-cert.pem',
    'https://s3.amazonaws.com:563/echo.api/echo-api-cert.pem',
  ]) assert.equal(certUrlOk(bad), false, bad);
});

test('requests must be signed by a current echo-api.amazon.com certificate', async () => {
  // A throwaway root and leaf, the way Amazon's chain is shaped.
  const dir = mkdtempSync(join(tmpdir(), 'alexa-'));
  const ssl = (...args: string[]) => execFileSync('openssl', args, { cwd: dir, stdio: 'pipe' });
  ssl('req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', 'ca.key', '-out', 'ca.pem', '-days', '2', '-subj', '/CN=Test Root',
    '-addext', 'basicConstraints=critical,CA:TRUE', '-addext', 'keyUsage=critical,keyCertSign');
  const leaf = (name: string, san: string) => {
    ssl('req', '-newkey', 'rsa:2048', '-nodes', '-keyout', `${name}.key`, '-out', `${name}.csr`, '-subj', `/CN=${san}`);
    writeFileSync(join(dir, `${name}.ext`), `subjectAltName=DNS:${san}\n`);
    ssl('x509', '-req', '-in', `${name}.csr`, '-CA', 'ca.pem', '-CAkey', 'ca.key', '-CAcreateserial', '-out', `${name}.pem`, '-days', '1', '-extfile', `${name}.ext`);
    return { key: readFileSync(join(dir, `${name}.key`), 'utf8'), chain: readFileSync(join(dir, `${name}.pem`), 'utf8') + readFileSync(join(dir, 'ca.pem'), 'utf8') };
  };
  const good = leaf('good', 'echo-api.amazon.com');
  const wrong = leaf('wrong', 'example.com');
  const root = readFileSync(join(dir, 'ca.pem'), 'utf8');

  const body = JSON.stringify({ request: { timestamp: NOW } });
  const sign = (key: string, text = body) => createSign('RSA-SHA256').update(text).sign(key, 'base64');
  const check = (key: string, chain: string, url: string, opts: { roots?: string[]; text?: string; at?: string } = {}) => verifyAlexa(
    new Headers({ SignatureCertChainUrl: url, 'Signature-256': sign(key, opts.text) }),
    body, NOW, { fetchChain: async () => chain, roots: opts.roots ?? [root], now: new Date(opts.at ?? NOW) },
  );
  const url = (n: string) => `https://s3.amazonaws.com/echo.api/${n}.pem`;

  // Signed now, so the certificates are current.
  const realNow = new Date().toISOString();
  const fresh = (key: string, chain: string, u: string, o: object = {}) => verifyAlexa(
    new Headers({ SignatureCertChainUrl: u, 'Signature-256': sign(key) }), body, realNow,
    { fetchChain: async () => chain, roots: [root], now: new Date(realNow), ...o },
  );
  assert.equal(await fresh(good.key, good.chain, url('good')), null);
  assert.equal(await fresh(wrong.key, wrong.chain, url('wrong')), 'certificate', 'names another host');
  assert.equal(await fresh(good.key, good.chain, url('untrusted'), { roots: [readFileSync(join(dir, 'good.pem'), 'utf8')] }), 'certificate', 'unknown root');
  assert.equal(await fresh(wrong.key, good.chain, url('good')), 'signature', 'signed by someone else');
  assert.equal(await check(good.key, good.chain, url('good'), { at: '2026-10-30T15:03:00Z' }), 'timestamp', 'too old');
  assert.equal(await check(good.key, good.chain, 'https://example.com/echo.api/x.pem'), 'certificate url');
});
