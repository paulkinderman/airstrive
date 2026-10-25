// Connects to the local Supabase that `supabase start` runs in Docker. Refuses anything else,
// so these tests can never write to the dev or production projects.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { Paths, tempRoot } from 'expo-file-system';
import { TestDb, asExpo } from '../sqlite';
import { migrate } from '@/db/schema';
import { supabaseRemote } from '@/sync/supabaseRemote';
import { syncOnce } from '@/sync/engine';
import { fileExists, removeFiles } from '@/lib/files';

export const url = process.env.SUPABASE_URL ?? '';
const anonKey = process.env.SUPABASE_ANON_KEY ?? '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

if (!url || !anonKey || !serviceKey) {
  throw new Error('Set SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY from `supabase status -o env` (see test/integration/run.sh)');
}
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(url)) {
  throw new Error(`Integration tests only run against a local Supabase, not ${url}`);
}

const opts = { auth: { persistSession: false, autoRefreshToken: false } };
export const admin = createClient(url, serviceKey, opts);

export interface Person { id: string; email: string; client: SupabaseClient; token: string }

/** A new account with an email login, which the local stack allows in place of Apple and Google. */
export async function newPerson(): Promise<Person> {
  const email = `test-${randomUUID()}@airstrive.test`;
  const password = randomUUID();
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw new Error(`createUser: ${error?.message}`);
  const client = createClient(url, anonKey, opts);
  const { data: s, error: e2 } = await client.auth.signInWithPassword({ email, password });
  if (e2 || !s.session) throw new Error(`signIn: ${e2?.message}`);
  return { id: data.user.id, email, client, token: s.session.access_token };
}

const localFiles = { exists: fileExists, remove: removeFiles };

/** A phone: its own SQLite database and its own documents folder, signed in as `person`. */
export async function newPhone(person: Person) {
  const db = new TestDb();
  const x = asExpo(db);
  await migrate(x);
  const docs = `file://${path.join(tempRoot, `phone-${randomUUID()}`)}`;
  const remote = supabaseRemote(person.client);
  /** Runs `fn` with this phone's documents folder in place. */
  const on = async <T>(fn: () => Promise<T>): Promise<T> => {
    Paths.document.uri = docs;
    return fn();
  };
  const sync = () => on(() => syncOnce(x, remote, localFiles, person.id));
  return { db, x, on, sync };
}

export const moment = (body: string, photos: string[] = []) => ({
  title: 'A prompt', body, happenedOn: '2026-10-25', place: '', weather: '', withPeople: '',
  photos: photos.map((p) => ({ path: p, width: 1600, height: 1200, bytes: 4 })), coverIndex: 0,
});
