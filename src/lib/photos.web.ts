import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { newId } from './ids';
import { photoUri, writeBlob } from './files.web';
import type { StoredPhoto } from './photos';

export type { StoredPhoto };

const LONG_EDGE = 1600;

/** Resize to 1600 px on the long edge, save as WebP (JPEG where the browser can't encode WebP) into IndexedDB. */
async function store(asset: { uri: string; width: number; height: number }): Promise<StoredPhoto> {
  const scale = Math.min(1, LONG_EDGE / Math.max(asset.width, asset.height));
  const ctx = ImageManipulator.manipulate(asset.uri);
  if (scale < 1) ctx.resize({ width: Math.round(asset.width * scale), height: Math.round(asset.height * scale) });
  const rendered = await ctx.renderAsync();
  const encode = async (format: SaveFormat, compress: number) => {
    const out = await rendered.saveAsync({ format, compress });
    const blob = await (await fetch(out.uri)).blob();
    URL.revokeObjectURL(out.uri);
    return { blob, width: out.width, height: out.height };
  };
  let saved;
  try {
    saved = await encode(SaveFormat.WEBP, 0.8);
  } catch {
    saved = await encode(SaveFormat.JPEG, 0.82);
  }
  const ext = saved.blob.type === 'image/webp' ? 'webp' : 'jpg';
  const blob = saved.blob;
  const path = `photos/${newId()}.${ext}`;
  await writeBlob(path, blob);
  return { path, uri: photoUri(path), width: saved.width, height: saved.height, bytes: blob.size };
}

export async function pickFromLibrary(max: number): Promise<StoredPhoto[]> {
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
  const result = await ImagePicker.launchCameraAsync({ quality: 1 });
  if (result.canceled) return null;
  return store(result.assets[0]);
}
