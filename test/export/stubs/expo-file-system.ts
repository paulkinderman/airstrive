// expo-file-system backed by a real temp folder, so export code reads and writes actual files.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'airstrive-export-'));
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
}

export class Directory extends File {
  create(_opts?: object) { fs.mkdirSync(toPath(this.uri), { recursive: true }); }
}

export const Paths = {
  document: { uri: `file://${root}/documents` },
  cache: { uri: `file://${root}/cache` },
};
