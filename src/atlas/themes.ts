/** Where a grid lives in the Atlas. Official grids and grids people make use the same list. */
export const THEMES = [
  'Movement', 'Outdoors', 'Games', 'Mind', 'People', 'Family', 'Food', 'Making', 'Places', 'Seasons', 'Wellness',
] as const;
export type Theme = (typeof THEMES)[number];

export const THEME_BLURB: Record<Theme, string> = {
  Movement: 'Running, riding, swimming, dancing',
  Outdoors: 'Parks, trails, water and sky',
  Games: 'Chess, cards, puzzles, play',
  Mind: 'Reading, learning, curious things',
  People: 'Friends, neighbors, strangers',
  Family: 'Kids, parents, partners, pets',
  Food: 'Cooking, baking, eating out',
  Making: 'Music, art, crafts, gardens',
  Places: 'Your city and everywhere else',
  Seasons: 'A time of year, start to finish',
  Wellness: 'Rest, calm, kindness to yourself',
};

export interface Interest {
  id: string;
  label: string;
  themes: Theme[];
  /** Words that make a grid a closer match when they appear in its title or description. */
  words: string[];
}

/** The chips on the onboarding screen. Ids are stored on the profile, so keep them stable. */
export const INTERESTS: Interest[] = [
  { id: 'running', label: 'Running', themes: ['Movement'], words: ['run', 'running', 'jog'] },
  { id: 'walking', label: 'Walking and hiking', themes: ['Outdoors', 'Movement'], words: ['walk', 'hike', 'hiking', 'trail'] },
  { id: 'cycling', label: 'Cycling', themes: ['Movement'], words: ['bike', 'cycling', 'ride'] },
  { id: 'swimming', label: 'Swimming', themes: ['Movement', 'Outdoors'], words: ['swim', 'swimming', 'pool'] },
  { id: 'outdoors', label: 'Being outdoors', themes: ['Outdoors', 'Seasons'], words: ['outside', 'park', 'nature', 'camp'] },
  { id: 'chess', label: 'Chess', themes: ['Games'], words: ['chess'] },
  { id: 'games', label: 'Board games and puzzles', themes: ['Games'], words: ['game', 'board', 'puzzle', 'cards'] },
  { id: 'reading', label: 'Reading', themes: ['Mind'], words: ['read', 'book', 'library'] },
  { id: 'learning', label: 'Learning new things', themes: ['Mind', 'Making'], words: ['learn', 'class', 'language'] },
  { id: 'friends', label: 'Friends', themes: ['People'], words: ['friend', 'friends'] },
  { id: 'family', label: 'Family', themes: ['Family'], words: ['family', 'kids', 'parents'] },
  { id: 'pets', label: 'Pets', themes: ['Family'], words: ['dog', 'cat', 'pet', 'puppy'] },
  { id: 'cooking', label: 'Cooking and baking', themes: ['Food'], words: ['cook', 'bake', 'recipe', 'kitchen'] },
  { id: 'eating', label: 'Eating out', themes: ['Food', 'Places'], words: ['restaurant', 'eat', 'coffee', 'food'] },
  { id: 'art', label: 'Art and drawing', themes: ['Making'], words: ['art', 'draw', 'paint', 'sketch'] },
  { id: 'music', label: 'Music', themes: ['Making'], words: ['music', 'piano', 'guitar', 'sing', 'concert'] },
  { id: 'crafts', label: 'Crafts and gardening', themes: ['Making'], words: ['craft', 'knit', 'garden', 'pottery'] },
  { id: 'photography', label: 'Photography', themes: ['Making', 'Places'], words: ['photo', 'camera'] },
  { id: 'travel', label: 'Travel', themes: ['Places'], words: ['travel', 'trip', 'city'] },
  { id: 'city', label: 'Exploring my city', themes: ['Places'], words: ['city', 'neighborhood', 'york'] },
  { id: 'seasons', label: 'Seasons and holidays', themes: ['Seasons'], words: ['fall', 'winter', 'spring', 'summer', 'holiday'] },
  { id: 'wellness', label: 'Rest and wellness', themes: ['Wellness'], words: ['wellness', 'rest', 'calm', 'sleep'] },
  { id: 'mindfulness', label: 'Mindfulness', themes: ['Wellness', 'Mind'], words: ['mindful', 'meditate', 'quiet'] },
];

export interface ThemeScore { theme: Theme; score: number; because: string[] }

/** Themes ordered by how well they match the person's interests. Only themes with a match are returned. */
export function rankThemes(interestIds: string[]): ThemeScore[] {
  const scores = new Map<Theme, ThemeScore>();
  for (const id of interestIds) {
    const interest = INTERESTS.find((i) => i.id === id);
    if (!interest) continue;
    interest.themes.forEach((theme, rank) => {
      const s = scores.get(theme) ?? { theme, score: 0, because: [] };
      // An interest's first theme counts most.
      s.score += rank === 0 ? 2 : 1;
      s.because.push(interest.label);
      scores.set(theme, s);
    });
  }
  return [...scores.values()].sort((a, b) => b.score - a.score || THEMES.indexOf(a.theme) - THEMES.indexOf(b.theme));
}

/** How well one grid matches the interests: its theme plus any words in its title or description. */
export function gridMatch(interestIds: string[], grid: { title: string; theme: string; description: string }): number {
  const text = `${grid.title} ${grid.description}`.toLowerCase();
  let score = 0;
  for (const id of interestIds) {
    const interest = INTERESTS.find((i) => i.id === id);
    if (!interest) continue;
    if (interest.themes.includes(grid.theme as Theme)) score += 1;
    if (interest.words.some((w) => new RegExp(`\\b${w}`).test(text))) score += 3;
  }
  return score;
}
