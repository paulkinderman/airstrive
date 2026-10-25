import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';

/** Printing and sharing files. The web build has its own version in share.web.ts. */

export async function printHtml(html: string) {
  await Print.printAsync({ html });
}

export async function shareHtmlAsPdf(html: string, title: string) {
  const { uri } = await Print.printToFileAsync({ html });
  await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: title });
}

/** The scrapbook for the export zip, rendered to PDF (US Letter). */
export async function scrapbookFile(html: string): Promise<{ name: string; bytes: Uint8Array }> {
  const pdf = await Print.printToFileAsync({ html, width: 612, height: 792 });
  const bytes = await new File(pdf.uri).bytes();
  try { new File(pdf.uri).delete(); } catch { /* temp file */ }
  return { name: 'memory-lane.pdf', bytes };
}

/** Writes the zip to the cache folder and returns its URI for shareZip. */
export async function saveZip(bytes: Uint8Array, name: string): Promise<string> {
  const out = new File(Paths.cache, name);
  if (out.exists) out.delete();
  out.create();
  await out.write(bytes);
  return out.uri;
}

export async function shareZip(uri: string) {
  await Sharing.shareAsync(uri, { mimeType: 'application/zip', dialogTitle: 'Your AirStrive export', UTI: 'public.zip-archive' });
}
