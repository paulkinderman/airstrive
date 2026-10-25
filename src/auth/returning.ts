import 'expo-sqlite/localStorage/install';

// Kept outside the app database, which is wiped on sign-out, so the welcome screen can tell
// a first visit (show what AirStrive is) from someone coming back (just the brand).
const KEY = 'airstrive.signedInBefore';

export function hasSignedInBefore() {
  try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
}

export function markSignedIn() {
  try { localStorage.setItem(KEY, '1'); } catch { /* only changes the welcome copy */ }
}

export function forgetSignedIn() {
  try { localStorage.removeItem(KEY); } catch { /* only changes the welcome copy */ }
}
