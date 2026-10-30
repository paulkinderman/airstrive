/**
 * Feature flags, so unfinished work can merge to main without reaching people. A flag is on
 * when its name is in EXPO_PUBLIC_FLAGS (comma separated), which is set per environment on
 * expo.dev: list a flag under preview to try it there, and under production once it's ready.
 * Values are read at build time, so turning one on for the store app takes a new build.
 *
 *   if (flag('newAtlas')) { ... }
 */
const on = new Set(
  (process.env.EXPO_PUBLIC_FLAGS ?? '').split(',').map((s: string) => s.trim()).filter(Boolean),
);

/** Add a flag's name here before using it, so a typo is a type error. */
export type Flag = never;

export function flag(name: Flag): boolean {
  return on.has(name);
}
