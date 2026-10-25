// expo-file-system backed by a real temp folder, so export and sync code read and write actual files.
// Paths.document can be pointed at another folder to play a second phone.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'airstrive-fs-'));
const toPath = (uri: string) => uri.replace(/^file:\/*/, '/');

export class File {
  uri: string;
  constructor(...parts: (string | { uri: string })[]) {
    this.uri = parts.map((p) => (typeof p === 'string' ? p : p.uri)).join('/').replace(/([^:])\/\/+/g, '$1/');
  }
  get exists() { return fs.existsSync(toPath(this.uri)); }
  delete() { fs.rmSync(toPath(this.uri), { recursive: true, force: true }); }
  create(_opts?: object) {
    fs.mkdirSync(path.dirname(toPath(this.uri)), { recursive: true });
    fs.writeFileSync(toPath(this.uri), '');
  }
  async bytes() { return new Uint8Array(fs.readFileSync(toPath(this.uri))); }
  async base64() { return fs.readFileSync(toPath(this.uri)).toString('base64'); }
  async write(content: string | Uint8Array) { fs.writeFileSync(toPath(this.uri), content); }

  static async downloadFileAsync(url: string, dest: File) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`download failed: ${res.status}`);
    fs.mkdirSync(path.dirname(toPath(dest.uri)), { recursive: true });
    fs.writeFileSync(toPath(dest.uri), new Uint8Array(await res.arrayBuffer()));
    return dest;
  }
}

export class Directory extends File {
  create(_opts?: object) { fs.mkdirSync(toPath(this.uri), { recursive: true }); }
}

export const Paths = {
  document: { uri: `file://${tempRoot}/documents` },
  cache: { uri: `file://${tempRoot}/cache` },
};
