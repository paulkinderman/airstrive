/**
 * The web build keeps photos in IndexedDB instead of a documents folder. Paths stay the same
 * ("photos/<id>.webp") so the database and sync rules don't change. Each stored photo gets an
 * object URL so photoUri() can stay synchronous, as screens and repo.ts expect.
 */

const DB_NAME = 'airstrive-photos';
const STORE = 'photos';

let dbPromise: Promise<IDBDatabase> | null = null;
const urls = new Map<string, string>();

function open(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Loads every stored photo's URL. Call once before reading moments (see app/_layout.tsx). */
export async function loadPhotos() {
  const keys = (await run('readonly', (s) => s.getAllKeys())) as string[];
  const blobs = (await run('readonly', (s) => s.getAll())) as Blob[];
  keys.forEach((k, i) => { if (!urls.has(k)) urls.set(k, URL.createObjectURL(blobs[i])); });
}

async function blobOf(path: string): Promise<Blob> {
  const blob = (await run('readonly', (s) => s.get(path))) as Blob | undefined;
  if (!blob) throw new Error(`Photo not found: ${path}`);
  return blob;
}

export function photoUri(path: string): string {
  if (!path || /^(blob|data|https?):/.test(path)) return path;
  return urls.get(path) ?? '';
}

export function fileExists(path: string): boolean {
  return !!path && urls.has(path);
}

export function removeFiles(paths: string[]) {
  for (const p of paths) {
    const url = urls.get(p);
    if (!url) continue;
    URL.revokeObjectURL(url);
    urls.delete(p);
    void run('readwrite', (s) => s.delete(p)).catch(() => {});
  }
}

export async function readBytes(path: string): Promise<Uint8Array> {
  return new Uint8Array(await (await blobOf(path)).arrayBuffer());
}

export async function readBase64(path: string): Promise<string> {
  const dataUrl = await new Promise<string>(async (resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(await blobOf(path));
  });
  return dataUrl.slice(dataUrl.indexOf(',') + 1);
}

const mimeOf = (path: string) => (path.endsWith('.jpg') ? 'image/jpeg' : 'image/webp');

export async function writeBlob(path: string, blob: Blob) {
  await run('readwrite', (s) => s.put(blob, path));
  const old = urls.get(path);
  if (old) URL.revokeObjectURL(old);
  urls.set(path, URL.createObjectURL(blob));
}

export async function writeBytes(path: string, bytes: Uint8Array) {
  await writeBlob(path, new Blob([bytes as BlobPart], { type: mimeOf(path) }));
}

/** Saves the file at `url` to `path`. Used for photos synced from other devices. */
export async function downloadTo(url: string, path: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download: HTTP ${res.status}`);
  await writeBlob(path, await res.blob());
}

/** Deletes every photo the app holds. Used on sign-out and account deletion. */
export function removeAllPhotos() {
  for (const url of urls.values()) URL.revokeObjectURL(url);
  urls.clear();
  void run('readwrite', (s) => s.clear()).catch(() => {});
}
