// Delivers one notification as a push. The database calls this through pg_net when a
// notification is added (queue_push in the notifications migration), with the push secret
// from its vault as the bearer token, which the database then checks (push_secret_matches).
// What to send, and to which phones, comes from push_payload(), which applies the person's push settings and blocks.
//
// Pushes go through Expo's push service, which holds the APNs key (eas credentials).
// Phones Apple says are gone are forgotten.
import { createClient } from 'npm:@supabase/supabase-js@2';

interface Payload {
  tokens: string[];
  title?: string | null;
  body: string;
  badge: number;
  data: Record<string, string>;
}

interface Ticket { status: 'ok' | 'error'; details?: { error?: string } }

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  // Only the database knows the push secret (vault), so it checks it.
  const secret = (req.headers.get('Authorization') ?? '').replace(/^Bearer /, '');
  const { data: ok } = await admin.rpc('push_secret_matches', { secret });
  if (ok !== true) return new Response('forbidden', { status: 403 });

  const { notification_id: id } = await req.json().catch(() => ({}));
  if (typeof id !== 'string') return new Response('notification_id needed', { status: 400 });
  const { data, error } = await admin.rpc('push_payload', { notification: id });
  if (error) return new Response(`payload: ${error.message}`, { status: 500 });
  const p = data as Payload | null;
  if (!p) return new Response(null, { status: 204 });

  const messages = p.tokens.map((to) => ({
    to,
    ...(p.title ? { title: p.title } : {}),
    body: p.body,
    badge: p.badge,
    sound: 'default',
    data: p.data,
  }));
  const res = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(Deno.env.get('EXPO_ACCESS_TOKEN') ? { Authorization: `Bearer ${Deno.env.get('EXPO_ACCESS_TOKEN')}` } : {}),
    },
    body: JSON.stringify(messages),
  });
  if (!res.ok) return new Response(`expo: ${res.status} ${await res.text()}`, { status: 502 });

  const tickets: Ticket[] = (await res.json()).data ?? [];
  const gone = p.tokens.filter((_, i) => tickets[i]?.status === 'error' && tickets[i]?.details?.error === 'DeviceNotRegistered');
  if (gone.length) await admin.from('push_tokens').delete().in('token', gone);

  return Response.json({ sent: tickets.filter((t) => t.status === 'ok').length, forgotten: gone.length });
});
