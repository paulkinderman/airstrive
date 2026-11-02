import { Platform } from 'react-native';

/**
 * Reads the clipboard, or null when it can't. expo-clipboard is loaded only when asked for,
 * so an update reaching a build from before it was added falls back to pasting by hand.
 */
export async function readClipboard(): Promise<string | null> {
  if (Platform.OS === 'web') {
    try { return await globalThis.navigator.clipboard.readText(); } catch { return null; }
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Clipboard = require('expo-clipboard') as typeof import('expo-clipboard');
    return await Clipboard.getStringAsync();
  } catch {
    return null;
  }
}
