import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { File } from 'expo-file-system';

/** A profile picture ready to upload: a 512 px square JPEG. `uri` is for showing it straight away. */
export interface AvatarImage { uri: string; bytes: Uint8Array }

export const AVATAR_EDGE = 512;

/** Crops the middle square (the picker's own crop has usually done this already) and shrinks it. */
async function square(asset: { uri: string; width: number; height: number }): Promise<AvatarImage> {
  const side = Math.min(asset.width, asset.height);
  const ctx = ImageManipulator.manipulate(asset.uri);
  if (asset.width !== asset.height) {
    ctx.crop({ originX: Math.floor((asset.width - side) / 2), originY: Math.floor((asset.height - side) / 2), width: side, height: side });
  }
  if (side > AVATAR_EDGE) ctx.resize({ width: AVATAR_EDGE, height: AVATAR_EDGE });
  const saved = await (await ctx.renderAsync()).saveAsync({ format: SaveFormat.JPEG, compress: 0.85 });
  return { uri: saved.uri, bytes: await new File(saved.uri).bytes() };
}

export async function pickAvatar(from: 'library' | 'camera'): Promise<AvatarImage | null> {
  const perm = from === 'camera'
    ? await ImagePicker.requestCameraPermissionsAsync()
    : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return null;
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 1 };
  const result = from === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled) return null;
  return square(result.assets[0]);
}
