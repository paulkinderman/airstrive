/**
 * Share links travel as links to the website, which shows what each is for (even to
 * someone without AirStrive) and hands it to the app. Four kinds, each with its own path:
 *
 *   /f/CODE         Be my friend (a person's reusable friend code; also their QR code)
 *   /g/CODE         Join my grid (a group grid's link)
 *   /a/GRID?f=CODE  Try this grid (an Atlas grid, with the sender's friend code)
 *   /p/CODE         See my grid (a read-only peek at one Friends or Public grid)
 *
 * The app has a screen at each of those paths too (app/f, app/g, app/a, app/p).
 */
const SITE = (process.env.EXPO_PUBLIC_SITE_URL || 'https://airstrive.vercel.app').replace(/\/$/, '');

export type Invite =
  | { kind: 'f' | 'g' | 'p'; code: string }
  | { kind: 'a'; code: string; from?: string };

/** The link a QR code or "Share my link" carries. */
export const friendLink = (code: string) => `${SITE}/f/${code}`;
export const groupLink = (code: string) => `${SITE}/g/${code}`;
export const peekLink = (code: string) => `${SITE}/p/${code}`;
export const gridLink = (gridId: string, from?: string | null) =>
  `${SITE}/a/${encodeURIComponent(gridId)}${from ? `?f=${from}` : ''}`;

export function inviteLink(i: Invite): string {
  if (i.kind === 'a') return gridLink(i.code, i.from);
  return `${SITE}/${i.kind}/${i.code}`;
}

/** The website's privacy and support pages, linked from Settings. */
export const privacyUrl = `${SITE}/privacy`;
export const supportUrl = `${SITE}/support`;

const SITE_HOST = SITE.replace(/^https?:\/\//, '').replace(/[/:].*$/, '').toLowerCase();
const CODE = /^[A-Za-z0-9]{12}$/;
const GRID_ID = /^[A-Za-z0-9_-]{1,64}$/;

/** A share code from a route parameter, in the case the server stores it. */
export const cleanCode = (code: string | undefined | null): string | null =>
  code && CODE.test(code.trim()) ? code.trim().toUpperCase() : null;

/** A grid id from a route parameter. */
export const cleanGridId = (id: string | undefined | null): string | null =>
  id && GRID_ID.test(id.trim()) ? id.trim() : null;

/**
 * The invite inside a scanned or pasted link (the website's, or the app's own
 * airstrive:// one), or a bare 12-character code, which is a friend code.
 */
export function parseInvite(text: string): Invite | null {
  const t = text.trim();
  if (CODE.test(t)) return { kind: 'f', code: t.toUpperCase() };
  // A web link has to be to AirStrive's site, so another site's QR code isn't read as an invite.
  const host = /^https?:\/\/([^/?#:]+)/i.exec(t)?.[1]?.toLowerCase();
  if (host && host !== SITE_HOST && host !== 'localhost' && !host.endsWith('.vercel.app')) return null;
  const m = /(?:^|\/)(f|g|p|a)\/([A-Za-z0-9_-]+)\/?(\?[^#\s]*)?(?:#\S*)?$/.exec(t);
  if (!m) return null;
  const [, kind, id, query] = m;
  if (kind === 'a') {
    const grid = cleanGridId(decodeURIComponent(id));
    if (!grid) return null;
    const from = cleanCode(/[?&]f=([A-Za-z0-9]+)/.exec(query ?? '')?.[1]);
    return from ? { kind: 'a', code: grid, from } : { kind: 'a', code: grid };
  }
  const code = cleanCode(id);
  return code ? { kind: kind as 'f' | 'g' | 'p', code } : null;
}

/** The friend code inside a scanned or pasted friend link, or a bare code. */
export function codeFrom(text: string): string | null {
  const i = parseInvite(text);
  return i?.kind === 'f' ? i.code : null;
}

/** The app screen an invite opens. */
export function inviteRoute(i: Invite) {
  switch (i.kind) {
    case 'f': return { pathname: '/f/[code]', params: { code: i.code } } as const;
    case 'g': return { pathname: '/g/[code]', params: { code: i.code } } as const;
    case 'p': return { pathname: '/p/[code]', params: { code: i.code } } as const;
    case 'a': return { pathname: '/a/[gridId]', params: i.from ? { gridId: i.code, f: i.from } : { gridId: i.code } } as const;
  }
}
