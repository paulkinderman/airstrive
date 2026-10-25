// Just enough of expo-file-system for repo code that builds display URIs.
export class File {
  uri: string;
  exists = false;
  constructor(...parts: (string | { uri: string })[]) {
    this.uri = parts.map((p) => (typeof p === 'string' ? p : p.uri)).join('/').replace(/([^:])\/\/+/g, '$1/');
  }
  delete() {}
  create(_opts?: object) {}
  async bytes() { return new Uint8Array(); }
  async base64() { return ''; }
  async write(_content: unknown) {}
  static async downloadFileAsync(_url: string, _to: File) {}
}
export class Directory extends File {}
export const Paths = { document: { uri: 'file:///docs' } };
