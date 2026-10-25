/**
 * Browsers can't render a PDF or open a share sheet for a file, so the web build prints
 * through a hidden frame (the print dialog offers "Save as PDF") and downloads files.
 */

export async function printHtml(html: string) {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;width:0;height:0;border:0;right:0;bottom:0;';
  document.body.appendChild(frame);
  await new Promise<void>((resolve) => {
    frame.onload = () => resolve();
    frame.srcdoc = html;
  });
  const doc = frame.contentDocument!;
  await Promise.all(Array.from(doc.images).map((img) => (img.complete ? null : new Promise((r) => { img.onload = img.onerror = r; }))));
  frame.contentWindow!.focus();
  frame.contentWindow!.print();
  // print() blocks until the dialog closes in most browsers; leave a margin for the rest.
  setTimeout(() => frame.remove(), 60_000);
}

export async function shareHtmlAsPdf(html: string, _title: string) {
  await printHtml(html);
}

/** The scrapbook for the export zip, as a page that prints like the phone's PDF. */
export async function scrapbookFile(html: string): Promise<{ name: string; bytes: Uint8Array }> {
  return { name: 'memory-lane.html', bytes: new TextEncoder().encode(html) };
}

const names = new Map<string, string>();

export async function saveZip(bytes: Uint8Array, name: string): Promise<string> {
  const uri = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/zip' }));
  names.set(uri, name);
  return uri;
}

export async function shareZip(uri: string) {
  const a = document.createElement('a');
  a.href = uri;
  a.download = names.get(uri) ?? 'AirStrive export.zip';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => { URL.revokeObjectURL(uri); names.delete(uri); }, 60_000);
}
