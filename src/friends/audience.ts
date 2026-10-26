/** Who can see a grid or a moment. A moment can match its grid's audience or be narrower, never wider. */
export type Audience = 'private' | 'friends' | 'public';

export const AUDIENCES: Audience[] = ['private', 'friends', 'public'];

const RANK: Record<Audience, number> = { private: 0, friends: 1, public: 2 };

export function asAudience(v: unknown): Audience {
  return v === 'friends' || v === 'public' ? v : 'private';
}

export function narrower(a: Audience, b: Audience): Audience {
  return RANK[a] <= RANK[b] ? a : b;
}

export function isWider(a: Audience, than: Audience): boolean {
  return RANK[a] > RANK[than];
}

export const AUDIENCE_LABEL: Record<Audience, string> = {
  private: 'Private',
  friends: 'Friends',
  public: 'Public',
};

/** What each audience means, for pickers. */
export const AUDIENCE_NOTE: Record<Audience, string> = {
  private: 'Just you',
  friends: 'Friends you have accepted',
  public: 'Anyone on AirStrive',
};

/** The line on a grid page saying who can see it. */
export function gridAudienceLine(a: Audience): string {
  return a === 'public' ? 'Anyone on AirStrive can see this' : a === 'friends' ? 'Friends can see this' : 'Only you can see this';
}
