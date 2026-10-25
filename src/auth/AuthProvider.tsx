import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { useSQLiteContext } from 'expo-sqlite';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { getMeta, setMeta } from '@/db/queue';
import { removeAllPhotos } from '@/lib/files';
import { normalizeUsername } from '@/lib/username';
import { prepareForUser } from '@/sync/bootstrap';
import { wipeLocal } from '@/sync/engine';
import { supabaseRemote } from '@/sync/supabaseRemote';
import { localFiles } from '@/sync/SyncProvider';

export type AuthStatus = 'loading' | 'signedOut' | 'settingUp' | 'setupFailed' | 'needsUsername' | 'ready';

interface AuthApi {
  status: AuthStatus;
  userId: string | null;
  username: string | null;
  /** A name from Apple or Google to suggest on the username screen. */
  suggestedName: string | null;
  /** False when Supabase isn't configured yet (see .env.example). */
  configured: boolean;
  appleAvailable: boolean;
  googleAvailable: boolean;
  signInWithApple: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  /** Development builds without Supabase: use the app on this phone only. */
  continueOffline: () => Promise<void>;
  claimUsername: (name: string) => Promise<'ok' | 'taken' | 'error'>;
  retrySetup: () => Promise<void>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
}

const Ctx = createContext<AuthApi | null>(null);
const OFFLINE_USER = '00000000-0000-4000-8000-000000000000';

type GoogleModule = typeof import('@react-native-google-signin/google-signin');

/** Google sign-in is a native module that Expo Go doesn't include, so load it lazily. */
function google(): GoogleModule | null {
  const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  if (Platform.OS === 'web' || !webClientId || (Platform.OS === 'ios' && !iosClientId)) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod: GoogleModule = require('@react-native-google-signin/google-signin');
    mod.GoogleSignin.configure({ webClientId, iosClientId });
    return mod;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [session, setSession] = useState<Session | null>(null);
  const [offline, setOffline] = useState(false);
  const [username, setUsername] = useState<string | null>(null);
  const [suggestedName, setSuggestedName] = useState<string | null>(null);
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [googleMod] = useState(google);

  const userId = offline ? OFFLINE_USER : session?.user.id ?? null;

  useEffect(() => {
    if (Platform.OS === 'ios') AppleAuthentication.isAvailableAsync().then(setAppleAvailable).catch(() => {});
  }, []);

  // Session from storage, then every change.
  useEffect(() => {
    (async () => {
      if (!supabase) {
        if (__DEV__ && (await getMeta(db, 'offline_dev')) === '1') setOffline(true);
        else setStatus('signedOut');
        return;
      }
      const { data } = await supabase.auth.getSession();
      setSession(data.session);
      if (!data.session) setStatus('signedOut');
    })();
    if (!supabase) return;
    const { data } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (!s) setStatus('signedOut');
    });
    return () => data.subscription.unsubscribe();
  }, [db]);

  const setup = useCallback(async (uid: string) => {
    setStatus('settingUp');
    try {
      await prepareForUser(db, supabase ? supabaseRemote(supabase) : null, { ...localFiles, removeAll: removeAllPhotos }, uid);
    } catch {
      // Already set up on this phone before? Then it works offline; otherwise ask to retry.
      if ((await getMeta(db, 'owner')) !== uid) { setStatus('setupFailed'); return; }
    }
    let name = await getMeta(db, 'username');
    if (!name && supabase) {
      const { data } = await supabase.from('users').select('username').eq('id', uid).maybeSingle();
      name = data?.username ?? null;
      if (name) await setMeta(db, 'username', name);
    }
    if (!name && uid === OFFLINE_USER) name = 'you';
    setUsername(name);
    setStatus(name ? 'ready' : 'needsUsername');
  }, [db]);

  useEffect(() => {
    if (userId) void setup(userId);
  }, [userId, setup]);

  const signInWithApple = useCallback(async () => {
    if (!supabase) return;
    const rawNonce = Crypto.randomUUID();
    const hashed = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
    let cred: AppleAuthentication.AppleAuthenticationCredential;
    try {
      cred = await AppleAuthentication.signInAsync({
        requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
        nonce: hashed,
      });
    } catch (e) {
      if ((e as { code?: string }).code === 'ERR_REQUEST_CANCELED') return;
      throw e;
    }
    if (!cred.identityToken) throw new Error('Apple did not return a sign-in token.');
    // Apple shares the name only on the very first sign-in.
    if (cred.fullName?.givenName) setSuggestedName(cred.fullName.givenName);
    const { error } = await supabase.auth.signInWithIdToken({ provider: 'apple', token: cred.identityToken, nonce: rawNonce });
    if (error) throw error;
  }, []);

  const signInWithGoogle = useCallback(async () => {
    if (!supabase) return;
    if (Platform.OS === 'web') {
      // Leaves the page for Google; supabase.ts picks the session up when it comes back.
      const redirectTo = new URL(process.env.EXPO_BASE_URL || '/', window.location.origin).href.replace(/\/?$/, '/');
      const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
      if (error) throw error;
      return;
    }
    if (!googleMod) return;
    const { GoogleSignin, isErrorWithCode, statusCodes } = googleMod;
    try {
      await GoogleSignin.hasPlayServices();
      const res = await GoogleSignin.signIn();
      if (res.type !== 'success') return;
      if (res.data.user.givenName) setSuggestedName(res.data.user.givenName);
      if (!res.data.idToken) throw new Error('Google did not return a sign-in token.');
      const { error } = await supabase.auth.signInWithIdToken({ provider: 'google', token: res.data.idToken });
      if (error) throw error;
    } catch (e) {
      if (isErrorWithCode(e) && (e.code === statusCodes.SIGN_IN_CANCELLED || e.code === statusCodes.IN_PROGRESS)) return;
      throw e;
    }
  }, [googleMod]);

  const continueOffline = useCallback(async () => {
    if (!__DEV__) return;
    await setMeta(db, 'offline_dev', '1');
    setOffline(true);
  }, [db]);

  const claimUsername = useCallback(async (raw: string) => {
    const name = normalizeUsername(raw).trim();
    if (offline || !supabase) {
      await setMeta(db, 'username', name);
      setUsername(name);
      setStatus('ready');
      return 'ok' as const;
    }
    const { data, error } = await supabase.rpc('claim_username', { name });
    if (error) return error.message.includes('taken') ? ('taken' as const) : ('error' as const);
    await setMeta(db, 'username', data as string);
    setUsername(data as string);
    setStatus('ready');
    return 'ok' as const;
  }, [db, offline]);

  const forgetPhone = useCallback(async () => {
    await wipeLocal(db);
    removeAllPhotos();
    setUsername(null);
    setOffline(false);
    try { await googleMod?.GoogleSignin.signOut(); } catch { /* not signed in with Google */ }
  }, [db, googleMod]);

  const signOut = useCallback(async () => {
    await forgetPhone();
    if (supabase) await supabase.auth.signOut();
    setStatus('signedOut');
  }, [forgetPhone]);

  const deleteAccount = useCallback(async () => {
    if (supabase && session) {
      const { error } = await supabase.functions.invoke('delete-account', { method: 'POST' });
      if (error) throw error;
    }
    await forgetPhone();
    if (supabase) await supabase.auth.signOut({ scope: 'local' });
    setStatus('signedOut');
  }, [forgetPhone, session]);

  const api: AuthApi = {
    status,
    userId,
    username,
    suggestedName,
    configured: !!supabase,
    appleAvailable: appleAvailable && !!supabase,
    googleAvailable: (!!googleMod || Platform.OS === 'web') && !!supabase,
    signInWithApple,
    signInWithGoogle,
    continueOffline,
    claimUsername,
    retrySetup: async () => { if (userId) await setup(userId); },
    signOut,
    deleteAccount,
  };
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth outside AuthProvider');
  return v;
}
