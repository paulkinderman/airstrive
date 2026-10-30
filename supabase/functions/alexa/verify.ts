// Checks that a request really comes from Alexa, as Amazon requires of skills hosted outside
// AWS Lambda: the signing certificate is fetched from Amazon's own S3 path, must be current,
// name echo-api.amazon.com and chain to a trusted root; the Signature-256 header must sign the
// exact body; and the request must be under 150 seconds old.
// https://developer.amazon.com/en-US/docs/alexa/custom-skills/host-a-custom-skill-as-a-web-service.html
// Certificates are read with @peculiar/x509 on Web Crypto, which works the same in Deno and in
// Node's tests (Deno's node:crypto can't check one certificate against another).
import * as x509 from '@peculiar/x509';
import { rootCertificates } from 'node:tls';

x509.cryptoProvider.set(globalThis.crypto);

export interface VerifyDeps {
  /** Downloads the PEM chain at an already-checked URL. */
  fetchChain(url: string): Promise<string>;
  /** Trusted root certificates as PEM. */
  roots: readonly string[];
  now: Date;
}

/** Amazon's rules for the certificate URL: https, s3.amazonaws.com, port 443, under /echo.api/. */
export function certUrlOk(raw: string): boolean {
  let u: URL;
  try { u = new URL(raw); } catch { return false; }
  return u.protocol === 'https:' && u.hostname.toLowerCase() === 's3.amazonaws.com'
    && (u.port === '' || u.port === '443') && u.pathname.startsWith('/echo.api/');
}

function splitPem(pem: string): x509.X509Certificate[] {
  return (pem.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g) ?? []).map((c) => new x509.X509Certificate(c));
}

const signedBy = (cert: x509.X509Certificate, issuer: x509.X509Certificate) =>
  cert.issuer === issuer.subject && cert.verify({ publicKey: issuer.publicKey, signatureOnly: true });

/** The trusted roots, read once and looked up by subject. */
let rootIndex: { pems: readonly string[]; bySubject: Map<string, x509.X509Certificate[]> } | null = null;
function rootsNamed(roots: readonly string[], subject: string): x509.X509Certificate[] {
  if (rootIndex?.pems !== roots) {
    const bySubject = new Map<string, x509.X509Certificate[]>();
    for (const pem of roots) {
      try {
        const c = new x509.X509Certificate(pem);
        bySubject.set(c.subject, [...(bySubject.get(c.subject) ?? []), c]);
      } catch { /* a root this library can't read */ }
    }
    rootIndex = { pems: roots, bySubject };
  }
  return rootIndex.bySubject.get(subject) ?? [];
}

async function chainOk(chain: x509.X509Certificate[], roots: readonly string[], now: Date): Promise<boolean> {
  if (chain.length === 0) return false;
  for (const c of chain) {
    if (now < c.notBefore || now > c.notAfter) return false;
  }
  const san = chain[0].getExtension(x509.SubjectAlternativeNameExtension);
  if (!san?.names.items.some((n) => n.type === 'dns' && n.value === 'echo-api.amazon.com')) return false;
  for (let i = 0; i + 1 < chain.length; i++) {
    if (!(await signedBy(chain[i], chain[i + 1]))) return false;
  }
  // A runtime without a root store still fetched the chain from Amazon's S3 over TLS.
  if (roots.length === 0) return true;
  const top = chain[chain.length - 1];
  for (const root of [...rootsNamed(roots, top.subject), ...rootsNamed(roots, top.issuer)]) {
    if (root.equal(top) || await signedBy(top, root)) return true;
  }
  return false;
}

function base64(s: string): ArrayBuffer {
  const bin = atob(s);
  return Uint8Array.from(bin, (ch) => ch.charCodeAt(0)).buffer as ArrayBuffer;
}

const chains = new Map<string, string>();

/** Null when the request is genuine, otherwise why not. */
export async function verifyAlexa(headers: Headers, body: string, timestamp: string | undefined, deps: VerifyDeps): Promise<string | null> {
  const url = headers.get('SignatureCertChainUrl') ?? '';
  const signature = headers.get('Signature-256') ?? '';
  if (!certUrlOk(url)) return 'certificate url';
  if (!signature) return 'signature missing';
  if (!timestamp || Math.abs(deps.now.getTime() - Date.parse(timestamp)) > 150_000) return 'timestamp';
  let pem = chains.get(url);
  if (!pem) {
    pem = await deps.fetchChain(url);
    chains.set(url, pem);
  }
  let chain: x509.X509Certificate[];
  try { chain = splitPem(pem); } catch { return 'certificate'; }
  if (!(await chainOk(chain, deps.roots, deps.now))) { chains.delete(url); return 'certificate'; }
  const algorithm = { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' };
  let ok = false;
  try {
    const key = await chain[0].publicKey.export(algorithm, ['verify']);
    ok = await crypto.subtle.verify(algorithm, key, base64(signature), new TextEncoder().encode(body));
  } catch { /* not base64, or not an RSA key */ }
  return ok ? null : 'signature';
}

export const defaultRoots: readonly string[] = rootCertificates ?? [];
