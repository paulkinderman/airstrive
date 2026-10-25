/**
 * Username rules: Latin letters (accents included), digits, space, dot, underscore,
 * hyphen and emoji. 1 to 30 graphemes after NFC normalization, no leading or
 * trailing space, nothing from other scripts, no control or zero-width characters
 * (except the joiners inside an emoji). Uniqueness is case-insensitive and checked
 * by the server.
 */

const LATIN = 'A-Za-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u024F\\u1E00-\\u1EFF';
const MARKS = '\\u0300-\\u036F';
const PICTO = '\\u00A9\\u00AE\\u203C\\u2049\\u2122\\u2139\\u2194-\\u21AA\\u231A-\\u23FF\\u24C2\\u25AA-\\u27BF\\u2934\\u2935\\u2B05-\\u2B55\\u3030\\u303D\\u3297\\u3299\\u{1F000}-\\u{1FAFF}';
const MODS = '\\uFE0F\\u{1F3FB}-\\u{1F3FF}';
const EMOJI = `(?:[\\u{1F1E6}-\\u{1F1FF}]{2}|[#*0-9]\\uFE0F?\\u20E3|[${PICTO}][${MODS}]*(?:\\u200D[${PICTO}][${MODS}]*)*)`;
const GRAPHEME = new RegExp(`${EMOJI}|[${LATIN}][${MARKS}]*|[0-9 ._-]`, 'gu');
const RESERVED = new Set(['airstrive', 'admin', 'support', 'moderator', 'help', 'official']);

export type UsernameProblem = 'empty' | 'too_long' | 'spaces' | 'characters' | 'reserved';

export function normalizeUsername(raw: string): string {
  return raw.normalize('NFC');
}

/** Graphemes in a valid username, or null if any character falls outside the rules. */
function graphemes(name: string): string[] | null {
  const parts = name.match(GRAPHEME) ?? [];
  return parts.join('') === name ? parts : null;
}

export function checkUsername(raw: string): UsernameProblem | null {
  const name = normalizeUsername(raw);
  if (name.trim() === '') return 'empty';
  if (name !== name.trim()) return 'spaces';
  const parts = graphemes(name);
  if (!parts) return 'characters';
  if (parts.length > 30) return 'too_long';
  if (RESERVED.has(name.toLowerCase())) return 'reserved';
  return null;
}

export const usernameMessage: Record<UsernameProblem | 'taken', string> = {
  empty: 'Pick a name to go by.',
  too_long: 'Keep it to 30 characters or fewer.',
  spaces: 'No spaces at the start or end.',
  characters: 'Letters, numbers, spaces, . _ - and emoji only.',
  reserved: 'That one is reserved.',
  taken: 'Someone already has that name.',
};
