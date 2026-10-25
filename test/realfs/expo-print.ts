// Stands in for the native PDF printer: writes the HTML it was given, so tests can read the scrapbook back.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export async function printToFileAsync(opts: { html: string; width?: number; height?: number }) {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'airstrive-print-')), 'print.pdf');
  fs.writeFileSync(file, opts.html);
  return { uri: `file://${file}`, numberOfPages: 1 };
}
