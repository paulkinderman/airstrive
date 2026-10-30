/**
 * The web app is cross-origin isolated (Cross-Origin-Embedder-Policy: require-corp in
 * vercel.json, which SQLite's WebAssembly needs), so an <img> pointing at Supabase
 * storage is blocked. A CORS fetch is allowed, so the file is fetched and shown from a
 * blob URL, kept per storage path for as long as the page is open.
 */
export const FETCH_IMAGES = true;

const shown = new Map<string, Promise<string>>();

export function showable(url: string, key: string): Promise<string> {
  let p = shown.get(key);
  if (!p) {
    p = fetch(url, { mode: 'cors' }).then(async (res) => {
      if (!res.ok) throw new Error(`image: ${res.status}`);
      return URL.createObjectURL(await res.blob());
    });
    p.catch(() => shown.delete(key));
    shown.set(key, p);
  }
  return p;
}
