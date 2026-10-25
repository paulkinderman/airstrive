import { Directory, File, Paths } from 'expo-file-system';

/**
 * Photos are stored by path relative to the app's documents folder ("photos/<id>.webp").
 * The absolute folder can change between app updates on iOS, so it is never saved.
 */
export function photoUri(path: string): string {
  if (!path || path.startsWith('file:')) return path;
  return new File(Paths.document, path).uri;
}

/** The web build loads its photo store here (files.web.ts); native has nothing to load. */
export async function loadPhotos() {}

export function photosDir(): Directory {
  const dir = new Directory(Paths.document, 'photos');
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

export function fileExists(path: string): boolean {
  try { return !!path && new File(photoUri(path)).exists; } catch { return false; }
}

export function removeFiles(paths: string[]) {
  for (const p of paths) {
    try { const f = new File(photoUri(p)); if (f.exists) f.delete(); } catch { /* best effort */ }
  }
}

export async function readBytes(path: string): Promise<Uint8Array> {
  return new File(photoUri(path)).bytes();
}

export async function readBase64(path: string): Promise<string> {
  return new File(photoUri(path)).base64();
}

export async function writeBytes(path: string, bytes: Uint8Array) {
  photosDir();
  const f = new File(Paths.document, path);
  if (f.exists) f.delete();
  f.create();
  await f.write(bytes);
}

/** Saves the file at `url` to `path`. Used for photos synced from other devices. */
export async function downloadTo(url: string, path: string) {
  photosDir();
  const dest = new File(Paths.document, path);
  if (dest.exists) dest.delete();
  await File.downloadFileAsync(url, dest);
}

/** Deletes every photo the app holds. Used on sign-out and account deletion. */
export function removeAllPhotos() {
  try { const dir = new Directory(Paths.document, 'photos'); if (dir.exists) dir.delete(); } catch { /* best effort */ }
}
