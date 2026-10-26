/**
 * A friend link opened before signing in. It waits here (the browser's or the app's
 * localStorage, which outlives sign-in) and opens once the shelf is ready.
 */
const KEY = 'airstrive.pending_friend_code';

export function savePendingCode(code: string) {
  try { globalThis.localStorage?.setItem(KEY, code); } catch { /* storage unavailable */ }
}

export function takePendingCode(): string | null {
  try {
    const code = globalThis.localStorage?.getItem(KEY) ?? null;
    if (code) globalThis.localStorage?.removeItem(KEY);
    return code;
  } catch {
    return null;
  }
}
