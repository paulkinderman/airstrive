// The AirStrive Alexa skill's endpoint. Alexa posts each request here; this checks it came
// from Alexa and from our skill, then answers as the person who linked their account, using
// the Supabase token Alexa holds for them (Supabase Auth's OAuth server issues it). Row level
// security and the friends functions decide what they see, exactly as in the app.
//
// Deployed with JWT verification off (supabase/config.toml), since Alexa signs requests its own way.
// Secrets: ALEXA_SKILL_ID (the skill's id from the Alexa developer console).
import { createClient } from 'npm:@supabase/supabase-js@2';
import { handle, NotLinked, type AlexaRequest, type Data, type Friend, type FriendMoment, type ShelfGrid } from './skill.ts';
import { defaultRoots, verifyAlexa } from './verify.ts';

/** Photo links last an hour: longer than the screen stays up. */
const PHOTO_SECONDS = 3600;

function dataFor(token: string): Data {
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const check = (error: { message: string; code?: string } | null, status?: number) => {
    if (!error) return;
    if (status === 401 || /jwt|token/i.test(error.message)) throw new NotLinked(error.message);
    throw new Error(error.message);
  };
  return {
    async friendMoments(limit) {
      const { data, error, status } = await db.rpc('friend_moments', { lim: limit });
      check(error, status);
      return (data ?? []) as FriendMoment[];
    },
    async shelf() {
      const { data, error, status } = await db.rpc('echo_shelf', { lim: 12 });
      check(error, status);
      return (data ?? []) as ShelfGrid[];
    },
    async friends() {
      const { data, error, status } = await db.rpc('my_friends');
      check(error, status);
      return ((data ?? []) as Friend[]).map((f) => ({ id: f.id, username: f.username }));
    },
    async photoUrls(paths) {
      const unique = [...new Set(paths)];
      const { data, error } = await db.storage.from('photos').createSignedUrls(unique, PHOTO_SECONDS);
      if (error) throw new Error(error.message);
      const out = new Map<string, string>();
      for (const r of data ?? []) if (r.path && r.signedUrl) out.set(r.path, r.signedUrl);
      return out;
    },
  };
}

/** The Echo's time zone from Alexa's settings API (no permission needed), for "today" and "good morning". */
async function timeZoneOf(alexa: AlexaRequest): Promise<string | undefined> {
  const { apiEndpoint, apiAccessToken, device } = alexa.context.System;
  if (!apiEndpoint || !apiAccessToken || !device?.deviceId) return undefined;
  try {
    const res = await fetch(`${apiEndpoint}/v2/devices/${encodeURIComponent(device.deviceId)}/settings/System.timeZone`, {
      headers: { Authorization: `Bearer ${apiAccessToken}` },
      signal: AbortSignal.timeout(1500),
    });
    return res.ok ? String(await res.json()) : undefined;
  } catch {
    return undefined;
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });
  const body = await req.text();
  let alexa: AlexaRequest;
  try { alexa = JSON.parse(body); } catch { return new Response('bad request', { status: 400 }); }

  const problem = await verifyAlexa(req.headers, body, alexa.request?.timestamp, {
    fetchChain: async (url) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`certificate ${res.status}`);
      return res.text();
    },
    roots: defaultRoots,
    now: new Date(),
  });
  if (problem) {
    console.warn('alexa: refused request', problem);
    return new Response('forbidden', { status: 400 });
  }
  const skillId = Deno.env.get('ALEXA_SKILL_ID');
  if (!skillId || alexa.context?.System?.application?.applicationId !== skillId) {
    console.warn('alexa: wrong or unset skill id');
    return new Response('forbidden', { status: 400 });
  }

  try {
    const zone = alexa.context.System.user.accessToken ? await timeZoneOf(alexa) : undefined;
    const res = await handle(alexa, dataFor(alexa.context.System.user.accessToken ?? ''), zone);
    return Response.json(res);
  } catch (e) {
    console.error('alexa:', e);
    return Response.json({
      version: '1.0',
      response: {
        outputSpeech: { type: 'SSML', ssml: '<speak>Sorry, I couldn\'t reach AirStrive just now. Try again in a minute.</speak>' },
        shouldEndSession: true,
      },
    });
  }
});
