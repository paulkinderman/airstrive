/**
 * Google sign-in for the web build, straight to Google and back to the app's own address, so
 * Google's account picker names this site rather than the Supabase project. Google returns an
 * ID token in the URL fragment, which Supabase accepts the same way the phone apps' tokens are.
 */

// localStorage, not sessionStorage: Safari can start a fresh session when the page comes back
// from Google, because the app's cross-origin isolation headers swap the browsing context.
const KEY = 'airstrive.googleSignIn';

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Leaves the page for Google's account picker. */
export async function startGoogleSignIn(clientId: string, redirectUri: string) {
  const nonce = crypto.randomUUID();
  const state = crypto.randomUUID();
  localStorage.setItem(KEY, JSON.stringify({ nonce, state }));
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'id_token',
    scope: 'openid email profile',
    // Google puts the hash in the token; Supabase hashes the raw nonce to check it.
    nonce: await sha256Hex(nonce),
    state,
    prompt: 'select_account',
  });
  window.location.assign(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
}

export interface GoogleReturn {
  idToken: string;
  nonce: string;
  givenName: string | null;
}

/**
 * Reads Google's answer from the URL once, before the router can redirect it away, and clears it
 * from the address bar. Null when this page load isn't a return from Google.
 */
function readGoogleReturn(): GoogleReturn | null {
  if (typeof window === 'undefined' || !window.location?.hash?.includes('state=')) return null;
  const params = new URLSearchParams(window.location.hash.slice(1));
  const saved = localStorage.getItem(KEY);
  if (!saved) return null;
  const { nonce, state } = JSON.parse(saved) as { nonce: string; state: string };
  if (params.get('state') !== state) return null;
  localStorage.removeItem(KEY);
  history.replaceState(null, '', window.location.pathname + window.location.search);
  const idToken = params.get('id_token');
  if (!idToken) return null; // Closed the picker or said no.
  let givenName: string | null = null;
  try {
    const payload = JSON.parse(atob(idToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    givenName = typeof payload.given_name === 'string' ? payload.given_name : null;
  } catch {
    // The name is only a suggestion for the username screen.
  }
  return { idToken, nonce, givenName };
}

export const googleReturn = readGoogleReturn();
