import type { Href, useRouter } from 'expo-router';

/**
 * Goes back, or to `fallback` when there's nothing to go back to. On the web that happens
 * whenever a page was reloaded or opened from a link, and router.back() then does nothing.
 */
export function goBack(router: ReturnType<typeof useRouter>, fallback: Href = '/') {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
}
