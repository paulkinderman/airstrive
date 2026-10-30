// What the AirStrive Alexa skill says and shows, given a request from Alexa and the linked
// person's data. No network or Deno APIs here, so the Node tests run it directly
// (test/alexa.test.ts); index.ts verifies the request and supplies the data.
import { gridDocument, homeDocument, linkDocument, photosDocument, shelfDocument, type Photo } from './apl.ts';

export interface FriendMoment {
  moment_id: string; user_id: string; username: string; title: string; happened_on: string;
  grid_title: string; grid_color: string; cover_path: string | null;
}
export interface ShelfSquare { idx: number; state: 'hidden' | 'revealed' | 'done'; prompt: string; title: string | null; happened_on: string | null; cover_path: string | null }
export interface ShelfGrid {
  user_grid_id: string; title: string; color: string; cols: number; rows: number;
  finished: boolean; together: boolean; done: number; total: number; next_up: string | null; squares: ShelfSquare[];
}
export interface Friend { id: string; username: string }

/** The linked person's AirStrive, read with their own token. Throws NotLinked when the token is refused. */
export interface Data {
  friendMoments(limit: number): Promise<FriendMoment[]>;
  shelf(): Promise<ShelfGrid[]>;
  friends(): Promise<Friend[]>;
  /** Short-lived links to photos in the private bucket, by storage path. */
  photoUrls(paths: string[]): Promise<Map<string, string>>;
}

export class NotLinked extends Error {}

// deno-lint-ignore no-explicit-any
type Json = any;

export interface AlexaRequest {
  version: string;
  session?: { new: boolean; attributes?: Record<string, Json> };
  context: {
    System: {
      application: { applicationId: string };
      apiEndpoint?: string;
      apiAccessToken?: string;
      user: { userId: string; accessToken?: string };
      device?: { deviceId?: string; supportedInterfaces?: Record<string, unknown> };
    };
  };
  request: {
    type: string; requestId: string; timestamp: string; locale?: string;
    intent?: { name: string; slots?: Record<string, Slot> };
    arguments?: Json[];
    token?: string;
  };
}

interface Slot {
  name: string; value?: string;
  resolutions?: { resolutionsPerAuthority?: { authority: string; status: { code: string }; values?: { value: { id: string; name: string } }[] }[] };
}

export interface AlexaResponse {
  version: '1.0';
  sessionAttributes?: Record<string, Json>;
  response: {
    outputSpeech?: { type: 'SSML'; ssml: string };
    reprompt?: { outputSpeech: { type: 'SSML'; ssml: string } };
    card?: Json;
    directives?: Json[];
    shouldEndSession?: boolean;
  };
}

/** How many friends' moments the home screen and the photo show use. */
const HOME_MOMENTS = 8;
const SHOW_MOMENTS = 20;

const HELP = 'You can say, show the photos, what\'s new, what\'s next, or show my grids. What would you like?';

export function escape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

/**
 * The wall-clock time in a time zone, as a Date whose UTC fields read as local time. Everything
 * below that says "today" or "good morning" works on this.
 */
export function localClock(at: Date, timeZone: string): Date {
  try {
    return new Date(at.toLocaleString('sv-SE', { timeZone }).replace(' ', 'T') + 'Z');
  } catch {
    return at;
  }
}

/** "today", "yesterday", "on Sunday" within the week, then "on October 12", counted from the local `now`. */
export function spokenDay(day: string, now: Date): string {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const [y, m, d] = day.slice(0, 10).split('-').map(Number);
  const then = Date.UTC(y, m - 1, d);
  const days = Math.round((today - then) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  const date = new Date(then);
  if (days < 7) return `on ${date.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' })}`;
  return `on ${date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' })}`;
}

/** "Oct 24" for the screen. */
export function shortDay(day: string): string {
  const [y, m, d] = day.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/** Usernames can hold underscores, dots and digits; this is what Alexa hears. */
export function spokenName(username: string): string {
  return username.replace(/[_.\-]+/g, ' ').replace(/\d+/g, ' ').replace(/\s+/g, ' ').trim() || username;
}

function speech(text: string) {
  return { type: 'SSML' as const, ssml: `<speak>${text}</speak>` };
}

function hasScreen(req: AlexaRequest): boolean {
  return !!req.context.System.device?.supportedInterfaces?.['Alexa.Presentation.APL'];
}

function render(token: string, doc: { document: Json; datasources: Json }) {
  return { type: 'Alexa.Presentation.APL.RenderDocument', token, document: doc.document, datasources: doc.datasources };
}

interface Reply {
  say?: string;
  ask?: string;
  screen?: { token: string; doc: { document: Json; datasources: Json } };
  directives?: Json[];
  card?: Json;
  end?: boolean;
  attributes?: Record<string, Json>;
}

function reply(req: AlexaRequest, r: Reply): AlexaResponse {
  const directives = [...(r.directives ?? [])];
  if (r.screen && hasScreen(req)) directives.push(render(r.screen.token, r.screen.doc));
  const res: AlexaResponse['response'] = {};
  if (r.say) res.outputSpeech = speech(r.say);
  if (r.ask) res.reprompt = { outputSpeech: speech(r.ask) };
  if (r.card) res.card = r.card;
  if (directives.length) res.directives = directives;
  // With a screen and no question, leaving shouldEndSession out keeps the screen up without
  // the microphone open. Without a screen there's nothing to keep, so the session ends.
  if (r.end) res.shouldEndSession = true;
  else if (r.ask) res.shouldEndSession = false;
  else if (!r.screen || !hasScreen(req)) res.shouldEndSession = true;
  return { version: '1.0', ...(r.attributes ? { sessionAttributes: r.attributes } : {}), response: res };
}

function linkAccount(req: AlexaRequest): AlexaResponse {
  return reply(req, {
    say: 'To see your AirStrive here, open the Alexa app on your phone and link your AirStrive account. I\'ve put a card there to get you started.',
    card: { type: 'LinkAccount' },
    screen: { token: 'link', doc: linkDocument() },
    end: true,
  });
}

/** Friends' usernames as a slot type, so "show Paul's photos" hears names Alexa wouldn't know. */
function friendEntities(friends: Friend[]) {
  return {
    type: 'Dialog.UpdateDynamicEntities',
    updateBehavior: 'REPLACE',
    types: [{
      name: 'FriendName',
      values: friends.map((f) => {
        const spoken = spokenName(f.username);
        return { id: f.id, name: { value: f.username, synonyms: spoken.toLowerCase() !== f.username.toLowerCase() ? [spoken] : [] } };
      }),
    }],
  };
}

/** The friend a "person" slot names: Alexa's own match on the friends list first, then a loose match on what it heard. */
export function matchFriend(slot: Slot | undefined, friends: Friend[]): Friend | null {
  if (!slot) return null;
  for (const a of slot.resolutions?.resolutionsPerAuthority ?? []) {
    if (a.status.code !== 'ER_SUCCESS_MATCH') continue;
    const id = a.values?.[0]?.value.id;
    const f = friends.find((x) => x.id === id);
    if (f) return f;
  }
  const heard = (slot.value ?? '').toLowerCase().replace(/'s$/, '').replace(/[^\p{L}\p{N}]+/gu, '');
  if (!heard) return null;
  const flat = (f: Friend) => spokenName(f.username).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
  return friends.find((f) => flat(f) === heard) ?? friends.find((f) => flat(f).startsWith(heard) || heard.startsWith(flat(f))) ?? null;
}

async function photosOf(data: Data, moments: FriendMoment[]): Promise<Photo[]> {
  const withCover = moments.filter((m) => m.cover_path);
  const urls = withCover.length ? await data.photoUrls(withCover.map((m) => m.cover_path!)) : new Map<string, string>();
  return moments.map((m) => ({
    url: m.cover_path ? urls.get(m.cover_path) ?? null : null,
    title: m.title,
    meta: `${m.username} · ${m.grid_title} · ${shortDay(m.happened_on)}`,
    color: m.grid_color,
  }));
}

function whatsNewSpeech(moments: FriendMoment[], now: Date): string {
  if (moments.length === 0) return 'Nothing new from your friends yet. When they share a moment with friends, it shows up here.';
  const told = moments.slice(0, 3).map((m) => `${escape(spokenName(m.username))} did ${escape(m.title)} ${spokenDay(m.happened_on, now)}`);
  const last = told.length > 1 ? `${told.slice(0, -1).join('. ')}. And ${told[told.length - 1]}.` : `${told[0]}.`;
  return last;
}

function greeting(now: Date): string {
  const h = now.getUTCHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

async function home(req: AlexaRequest, data: Data, now: Date, opening: boolean): Promise<AlexaResponse> {
  const [moments, shelf, friends] = await Promise.all([data.friendMoments(HOME_MOMENTS), data.shelf(), data.friends()]);
  const directives = friends.length ? [friendEntities(friends)] : [];
  const photos = await photosOf(data, moments);
  let say: string;
  if (moments.length) {
    const m = moments[0];
    say = `${escape(spokenName(m.username))} shared ${escape(m.title)} ${spokenDay(m.happened_on, now)}.`;
  } else if (shelf.some((g) => g.next_up)) {
    say = `Next up on ${escape(shelf.find((g) => g.next_up)!.title)}: ${escape(shelf.find((g) => g.next_up)!.next_up!)}.`;
  } else {
    say = 'Here\'s your AirStrive.';
  }
  if (!hasScreen(req)) {
    return reply(req, { say: `${moments.length ? whatsNewSpeech(moments, now) : say} ${opening ? HELP : ''}`.trim(), ask: opening ? HELP : undefined, directives });
  }
  return reply(req, {
    say: opening ? `${greeting(now)}. ${say}` : say,
    screen: { token: 'home', doc: homeDocument({ greeting: greeting(now), photos, grids: shelf }) },
    directives,
  });
}

async function showPhotos(req: AlexaRequest, data: Data, now: Date, slot: Slot | undefined): Promise<AlexaResponse> {
  const [all, friends] = await Promise.all([data.friendMoments(SHOW_MOMENTS), data.friends()]);
  const asked = slot?.value ? matchFriend(slot, friends) : null;
  if (slot?.value && !asked) {
    return reply(req, { say: `I couldn't find a friend called ${escape(slot.value)} on AirStrive. Here are everyone's photos instead.`, ...(await photoShow(data, all)) });
  }
  const moments = asked ? all.filter((m) => m.user_id === asked.id) : all;
  if (moments.length === 0) {
    return reply(req, { say: asked ? `${escape(spokenName(asked.username))} hasn't shared any moments with you lately.` : 'Your friends haven\'t shared any moments yet.', end: !hasScreen(req) });
  }
  if (!hasScreen(req)) return reply(req, { say: whatsNewSpeech(moments, now) });
  return reply(req, { say: asked ? `Here are ${escape(spokenName(asked.username))}'s photos.` : 'Here are the latest photos.', ...(await photoShow(data, moments)) });
}

async function photoShow(data: Data, moments: FriendMoment[]) {
  const photos = await photosOf(data, moments);
  return { screen: { token: 'photos', doc: photosDocument(photos, true) } };
}

async function nextUp(req: AlexaRequest, data: Data): Promise<AlexaResponse> {
  const shelf = await data.shelf();
  const open = shelf.filter((g) => !g.finished && g.next_up);
  if (open.length === 0) {
    return reply(req, { say: shelf.length ? 'Nothing is turned over on your grids right now. Open AirStrive on your phone to reveal the next square.' : 'You don\'t have any grids yet. Add one from the Atlas in the AirStrive app.' });
  }
  const said = open.slice(0, 3).map((g) => `On ${escape(g.title)}: ${escape(g.next_up!)}.`).join(' ');
  return reply(req, { say: `Next up. ${said}`, screen: { token: 'grid', doc: gridDocument(open[0], await coverUrls(data, open[0])) } });
}

async function coverUrls(data: Data, grid: ShelfGrid) {
  const paths = grid.squares.map((s) => s.cover_path).filter((p): p is string => !!p);
  return paths.length ? data.photoUrls(paths) : new Map<string, string>();
}

async function showGrids(req: AlexaRequest, data: Data): Promise<AlexaResponse> {
  const shelf = await data.shelf();
  if (shelf.length === 0) return reply(req, { say: 'You don\'t have any grids yet. Add one from the Atlas in the AirStrive app.' });
  if (!hasScreen(req)) {
    const going = shelf.filter((g) => !g.finished);
    return reply(req, { say: `You have ${shelf.length} grid${shelf.length === 1 ? '' : 's'}. ${going.slice(0, 3).map((g) => `${escape(g.title)}, ${g.done} of ${g.total} done.`).join(' ')}` });
  }
  if (shelf.length === 1) return reply(req, { say: `Here's ${escape(shelf[0].title)}.`, screen: { token: 'grid', doc: gridDocument(shelf[0], await coverUrls(data, shelf[0])) } });
  return reply(req, { say: 'Here are your grids.', screen: { token: 'shelf', doc: shelfDocument(shelf) } });
}

/** Taps on the screen: SendEvent arguments from apl.ts. */
async function userEvent(req: AlexaRequest, data: Data, now: Date): Promise<AlexaResponse> {
  const [kind, id, idx] = req.request.arguments ?? [];
  if (kind === 'photos') return showPhotos(req, data, now, undefined);
  if (kind === 'grids') return showGrids(req, data);
  if (kind === 'home') return home(req, data, now, false);
  if (kind === 'grid' || kind === 'square') {
    const grid = (await data.shelf()).find((g) => g.user_grid_id === id);
    if (!grid) return showGrids(req, data);
    const sq = kind === 'square' ? grid.squares.find((s) => s.idx === Number(idx)) : undefined;
    if (sq?.state === 'done' && sq.title) {
      const urls = sq.cover_path ? await data.photoUrls([sq.cover_path]) : new Map<string, string>();
      const photo: Photo = { url: sq.cover_path ? urls.get(sq.cover_path) ?? null : null, title: sq.title, meta: `${grid.title}${sq.happened_on ? ` · ${shortDay(sq.happened_on)}` : ''}`, color: grid.color };
      return reply(req, { say: escape(sq.title), screen: { token: 'moment', doc: photosDocument([photo], false) } });
    }
    if (sq?.state === 'revealed') return reply(req, { say: `${escape(sq.prompt)}. This one's still waiting.` });
    if (sq) return reply(req, { say: 'That square is still hidden.' });
    return reply(req, { say: `${escape(grid.title)}. ${grid.done} of ${grid.total} done.`, screen: { token: 'grid', doc: gridDocument(grid, await coverUrls(data, grid)) } });
  }
  return reply(req, {});
}

/** Moves the photo show a page and keeps it turning. */
function turnPage(req: AlexaRequest, by: number): AlexaResponse {
  return reply(req, {
    directives: [{
      type: 'Alexa.Presentation.APL.ExecuteCommands',
      token: 'photos',
      commands: [{ type: 'Sequential', commands: [
        { type: 'SetPage', componentId: 'pager', position: 'relative', value: by },
        { type: 'AutoPage', componentId: 'pager', duration: 15000 },
      ] }],
    }],
  });
}

/** `timeZone` is the Echo's own (index.ts asks Alexa); without it, US Central. */
export async function handle(req: AlexaRequest, data: Data, timeZone = 'America/Chicago'): Promise<AlexaResponse> {
  const r = req.request;
  if (r.type === 'SessionEndedRequest') return { version: '1.0', response: {} };
  if (!req.context.System.user.accessToken) return linkAccount(req);
  const now = localClock(new Date(r.timestamp), timeZone);
  try {
    if (r.type === 'LaunchRequest') return await home(req, data, now, true);
    if (r.type === 'Alexa.Presentation.APL.UserEvent') return await userEvent(req, data, now);
    if (r.type !== 'IntentRequest' || !r.intent) return reply(req, {});
    switch (r.intent.name) {
      case 'WhatsNewIntent': {
        const moments = await data.friendMoments(HOME_MOMENTS);
        if (!hasScreen(req) || moments.length === 0) return reply(req, { say: whatsNewSpeech(moments, now) });
        const shelf = await data.shelf();
        return reply(req, { say: whatsNewSpeech(moments, now), screen: { token: 'home', doc: homeDocument({ greeting: greeting(now), photos: await photosOf(data, moments), grids: shelf }) } });
      }
      case 'ShowPhotosIntent': return await showPhotos(req, data, now, r.intent.slots?.person);
      case 'NextUpIntent': return await nextUp(req, data);
      case 'ShowGridsIntent': return await showGrids(req, data);
      case 'AMAZON.NavigateHomeIntent': return await home(req, data, now, false);
      case 'AMAZON.NextIntent': return turnPage(req, 1);
      case 'AMAZON.PreviousIntent': return turnPage(req, -1);
      case 'AMAZON.HelpIntent': return reply(req, { say: HELP, ask: HELP });
      case 'AMAZON.StopIntent':
      case 'AMAZON.CancelIntent':
      case 'AMAZON.PauseIntent':
        return reply(req, { say: 'Bye for now.', end: true });
      case 'AMAZON.FallbackIntent':
      default:
        return reply(req, { say: `Sorry, I didn't catch that. ${HELP}`, ask: HELP });
    }
  } catch (e) {
    if (e instanceof NotLinked) return linkAccount(req);
    throw e;
  }
}
