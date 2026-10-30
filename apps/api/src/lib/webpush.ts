/**
 * Web Push with WebCrypto only (runs in Workers): message encryption per RFC 8291 (aes128gcm,
 * RFC 8188) and VAPID per RFC 8292. Payloads are encrypted to the browser; the push service
 * relays bytes it cannot read.
 */

export interface PushSubscriptionKeys {
  endpoint: string;
  /** Browser's P-256 public key, base64url (65 bytes uncompressed). */
  p256dh: string;
  /** Browser's 16-byte auth secret, base64url. */
  auth: string;
}

export interface Vapid {
  /** base64url, 65-byte uncompressed P-256 point (the browser's applicationServerKey). */
  publicKey: string;
  /** base64url, 32-byte private scalar. A Worker secret; never logged or sent. */
  privateKey: string;
  /** `mailto:` or `https:` contact for push services. */
  subject: string;
}

const enc = new TextEncoder();

export function b64urlDecode(s: string): Uint8Array<ArrayBuffer> {
  const b64 = s.replaceAll('-', '+').replaceAll('_', '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function b64urlEncode(b: Uint8Array): string {
  let s = '';
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
};

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, bytes: number) {
  const key = await crypto.subtle.importKey('raw', ikm as Uint8Array<ArrayBuffer>, 'HKDF', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: salt as Uint8Array<ArrayBuffer>,
      info: info as Uint8Array<ArrayBuffer>,
    },
    key,
    bytes * 8,
  );
  return new Uint8Array(bits);
}

/** RFC 8188 record size; one record carries the whole message. */
const RECORD_SIZE = 4096;
/** Leaves room for the padding delimiter and the 16-byte tag in one record. */
export const MAX_PAYLOAD = 3_800;

/** Encrypts `payload` for one subscription (RFC 8291 §3.4, one aes128gcm record). */
export async function encryptPayload(
  payload: Uint8Array,
  sub: Pick<PushSubscriptionKeys, 'p256dh' | 'auth'>,
  salt: Uint8Array = crypto.getRandomValues(new Uint8Array(16)),
): Promise<Uint8Array> {
  if (payload.length > MAX_PAYLOAD) throw new RangeError('Push payload too large');
  const uaPublic = b64urlDecode(sub.p256dh);
  const authSecret = b64urlDecode(sub.auth);
  if (uaPublic.length !== 65 || authSecret.length !== 16) throw new Error('Invalid subscription keys');
  const ua = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const as = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
    'deriveBits',
  ])) as CryptoKeyPair;
  const asPublic = new Uint8Array((await crypto.subtle.exportKey('raw', as.publicKey)) as ArrayBuffer);
  const ecdh = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'ECDH', public: ua } as unknown as SubtleCryptoDeriveKeyAlgorithm,
      as.privateKey,
      256,
    ),
  );
  const ikm = await hkdf(authSecret, ecdh, concat(enc.encode('WebPush: info\0'), uaPublic, asPublic), 32);
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  // Payload, then the last-record delimiter (0x02); no extra padding.
  const plaintext = concat(payload, new Uint8Array([2]));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, plaintext as Uint8Array<ArrayBuffer>),
  );
  const header = new Uint8Array(16 + 4 + 1 + asPublic.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, RECORD_SIZE);
  header[20] = asPublic.length;
  header.set(asPublic, 21);
  return concat(header, ciphertext);
}

async function signingKey(v: Vapid): Promise<CryptoKey> {
  const pub = b64urlDecode(v.publicKey);
  if (pub.length !== 65 || pub[0] !== 4) throw new Error('Invalid VAPID public key');
  return crypto.subtle.importKey(
    'jwk',
    {
      kty: 'EC',
      crv: 'P-256',
      x: b64urlEncode(pub.slice(1, 33)),
      y: b64urlEncode(pub.slice(33, 65)),
      d: v.privateKey,
      ext: false,
    },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
}

/** `Authorization: vapid t=<JWT>, k=<public key>` for one push service (RFC 8292). */
export async function vapidAuthorization(endpoint: string, v: Vapid, now = Date.now()): Promise<string> {
  const head = b64urlEncode(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64urlEncode(
    enc.encode(
      JSON.stringify({
        aud: new URL(endpoint).origin,
        exp: Math.floor(now / 1000) + 12 * 3600,
        sub: v.subject,
      }),
    ),
  );
  const unsigned = `${head}.${claims}`;
  const sig = new Uint8Array(
    await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, await signingKey(v), enc.encode(unsigned)),
  );
  return `vapid t=${unsigned}.${b64urlEncode(sig)}, k=${v.publicKey}`;
}

/** Push services browsers use. Subscriptions elsewhere are refused, so the server never calls arbitrary URLs. */
const PUSH_HOSTS = [
  'fcm.googleapis.com',
  'android.googleapis.com',
  'updates.push.services.mozilla.com',
  'push.services.mozilla.com',
  'web.push.apple.com',
  'push.apple.com',
  'notify.windows.com',
];

export function isPushEndpoint(endpoint: string): boolean {
  let u: URL;
  try {
    u = new URL(endpoint);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:' || u.port || u.username || u.password) return false;
  return PUSH_HOSTS.some((h) => u.hostname === h || u.hostname.endsWith(`.${h}`));
}

export type PushOutcome = 'sent' | 'gone' | 'failed';

/** Sends one encrypted notification. `gone` means the subscription should be deleted. */
export async function sendPush(
  sub: PushSubscriptionKeys,
  message: Record<string, unknown>,
  v: Vapid,
  opts: { fetch?: typeof fetch; ttlSeconds?: number; urgency?: 'low' | 'normal' | 'high'; now?: number } = {},
): Promise<PushOutcome> {
  if (!isPushEndpoint(sub.endpoint)) return 'gone';
  const body = await encryptPayload(enc.encode(JSON.stringify(message)), sub);
  const res = await (opts.fetch ?? fetch)(sub.endpoint, {
    method: 'POST',
    headers: {
      authorization: await vapidAuthorization(sub.endpoint, v, opts.now),
      'content-encoding': 'aes128gcm',
      'content-type': 'application/octet-stream',
      ttl: String(opts.ttlSeconds ?? 86_400),
      urgency: opts.urgency ?? 'normal',
    },
    body: body as Uint8Array<ArrayBuffer>,
  });
  if (res.status === 404 || res.status === 410) return 'gone';
  return res.ok ? 'sent' : 'failed';
}
