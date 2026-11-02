import { parseInvite, inviteLink, type Invite } from './links';

/**
 * A share link opened before signing in. It waits here (the browser's or the app's
 * localStorage, which outlives sign-in) through sign-up and onboarding, and opens once
 * the shelf is ready. Onboarding reads it without taking it, to say who invited you.
 */
const KEY = 'airstrive.pending_invite';
/** Where friend links waited before there were other kinds. */
const OLD_KEY = 'airstrive.pending_friend_code';

export function savePendingInvite(invite: Invite) {
  try { globalThis.localStorage?.setItem(KEY, inviteLink(invite)); } catch { /* storage unavailable */ }
}

export function peekPendingInvite(): Invite | null {
  try {
    const link = globalThis.localStorage?.getItem(KEY);
    if (link) return parseInvite(link);
    const code = globalThis.localStorage?.getItem(OLD_KEY);
    return code ? parseInvite(code) : null;
  } catch {
    return null;
  }
}

export function takePendingInvite(): Invite | null {
  const invite = peekPendingInvite();
  clearPendingInvite();
  return invite;
}

export function clearPendingInvite() {
  try {
    globalThis.localStorage?.removeItem(KEY);
    globalThis.localStorage?.removeItem(OLD_KEY);
  } catch { /* storage unavailable */ }
}
