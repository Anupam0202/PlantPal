// Makes a VAPID key pair for Web Push. Put the public key in wrangler.toml (VAPID_PUBLIC_KEY) and
// the private key in the secret store: `wrangler secret put VAPID_PRIVATE_KEY`. Never commit it.
import { b64urlEncode } from '../src/lib/webpush';

const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
  'sign',
  'verify',
])) as CryptoKeyPair;
const publicKey = b64urlEncode(
  new Uint8Array((await crypto.subtle.exportKey('raw', pair.publicKey)) as ArrayBuffer),
);
const jwk = (await crypto.subtle.exportKey('jwk', pair.privateKey)) as JsonWebKey;
console.log(`VAPID_PUBLIC_KEY=${publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${jwk.d}`);
