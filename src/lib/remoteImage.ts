/**
 * Turns a link to someone else's photo into something an image can show. On phones the
 * link works as it is. The web app is cross-origin isolated (vercel.json), which stops
 * an <img> loading from storage, so remoteImage.web.ts fetches instead.
 */
export const FETCH_IMAGES = false;

export async function showable(url: string, _key: string): Promise<string> {
  return url;
}
