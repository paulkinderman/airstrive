/** Friend codes travel as links to the website, which hands them to the app. */
const SITE = (process.env.EXPO_PUBLIC_SITE_URL || 'https://airstrive.vercel.app').replace(/\/$/, '');

/** The link a QR code or "Share my link" carries. */
export const friendLink = (code: string) => `${SITE}/f/${code}`;

/** The website's privacy and support pages, linked from Settings. */
export const privacyUrl = `${SITE}/privacy`;
export const supportUrl = `${SITE}/support`;

/** The code inside a scanned or pasted link, or a bare code. Codes are 12 letters and digits. */
export function codeFrom(text: string): string | null {
  const m = /(?:\/f\/|^)([A-Za-z0-9]{12})\/?(?:[?#].*)?$/.exec(text.trim());
  return m ? m[1].toUpperCase() : null;
}
