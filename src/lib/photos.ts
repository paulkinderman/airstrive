import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { Directory, File, Paths } from 'expo-file-system';
import { newId } from './ids';

export interface StoredPhoto { uri: string; width: number; height: number; bytes: number }

const LONG_EDGE = 1600;

function photosDir(): Directory {
  const dir = new Directory(Paths.document, 'photos');
  if (!dir.exists) dir.create();
  return dir;
}

/** Resize to 1600 px on the long edge, save as WebP (JPEG on iOS where WebP isn't supported) into app storage. */
async function store(asset: { uri: string; width: number; height: number }): Promise<StoredPhoto> {
  const scale = Math.min(1, LONG_EDGE / Math.max(asset.width, asset.height));
  const ctx = ImageManipulator.manipulate(asset.uri);
  if (scale < 1) ctx.resize({ width: Math.round(asset.width * scale), height: Math.round(asset.height * scale) });
  const rendered = await ctx.renderAsync();
  let saved;
  try {
    saved = await rendered.saveAsync({ format: SaveFormat.WEBP, compress: 0.8 });
  } catch {
    saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.82 });
  }
  const ext = saved.uri.toLowerCase().endsWith('.webp') ? 'webp' : 'jpg';
  const dest = new File(photosDir(), `${newId()}.${ext}`);
  new File(saved.uri).move(dest);
  return { uri: dest.uri, width: saved.width, height: saved.height, bytes: dest.size ?? 0 };
}

export async function pickFromLibrary(max: number): Promise<StoredPhoto[]> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return [];
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: true,
    selectionLimit: max,
    quality: 1,
  });
  if (result.canceled) return [];
  const out: StoredPhoto[] = [];
  for (const a of result.assets.slice(0, max)) out.push(await store(a));
  return out;
}

export async function takePhoto(): Promise<StoredPhoto | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) return null;
  const result = await ImagePicker.launchCameraAsync({ quality: 1 });
  if (result.canceled) return null;
  return store(result.assets[0]);
}

export function removeFile(uri: string) {
  try { const f = new File(uri); if (f.exists) f.delete(); } catch { /* best effort */ }
}
