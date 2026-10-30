import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import type { AvatarImage } from './avatarImage';

export type { AvatarImage };

export const AVATAR_EDGE = 512;

/** The browser has no crop step, so the middle square is taken here. */
async function square(asset: { uri: string; width: number; height: number }): Promise<AvatarImage> {
  const side = Math.min(asset.width, asset.height);
  const ctx = ImageManipulator.manipulate(asset.uri);
  if (asset.width !== asset.height) {
    ctx.crop({ originX: Math.floor((asset.width - side) / 2), originY: Math.floor((asset.height - side) / 2), width: side, height: side });
  }
  if (side > AVATAR_EDGE) ctx.resize({ width: AVATAR_EDGE, height: AVATAR_EDGE });
  const saved = await (await ctx.renderAsync()).saveAsync({ format: SaveFormat.JPEG, compress: 0.85 });
  const bytes = new Uint8Array(await (await fetch(saved.uri)).arrayBuffer());
  return { uri: saved.uri, bytes };
}

export async function pickAvatar(from: 'library' | 'camera'): Promise<AvatarImage | null> {
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1 };
  const result = from === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled) return null;
  return square(result.assets[0]);
}
