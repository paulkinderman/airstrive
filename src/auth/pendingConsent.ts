/**
 * An "Allow Alexa" request (app/oauth/consent.tsx) opened before signing in. It waits in the
 * browser's localStorage, which outlives sign-in, and opens again once the shelf is ready.
 */
const KEY = 'airstrive.pending_oauth_consent';

export function savePendingConsent(authorizationId: string) {
  try { globalThis.localStorage?.setItem(KEY, authorizationId); } catch { /* storage unavailable */ }
}

export function takePendingConsent(): string | null {
  try {
    const id = globalThis.localStorage?.getItem(KEY) ?? null;
    if (id) globalThis.localStorage?.removeItem(KEY);
    return id;
  } catch {
    return null;
  }
}
