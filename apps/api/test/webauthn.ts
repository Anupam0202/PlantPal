import { isoBase64URL, isoCBOR } from '@simplewebauthn/server/helpers';

/**
 * A software passkey (ES256, "none" attestation) for tests: it answers registration and
 * sign-in challenges the way a platform authenticator does, so the server's real WebAuthn
 * verification runs end to end.
 */
interface Credential {
  id: Uint8Array;
  keys: CryptoKeyPair;
  userHandle: string;
  counter: number;
}

type Json = Record<string, unknown>;

const enc = new TextEncoder();
const b64 = (b: Uint8Array) => isoBase64URL.fromBuffer(b as Uint8Array<ArrayBuffer>);
const sha256 = async (b: Uint8Array) =>
  new Uint8Array(await crypto.subtle.digest('SHA-256', b as Uint8Array<ArrayBuffer>));
const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
};
const u32 = (n: number) => new Uint8Array([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);

/** WebCrypto signs ECDSA as raw r‖s; WebAuthn wants ASN.1 DER. */
function derSignature(raw: Uint8Array): Uint8Array {
  const int = (b: Uint8Array) => {
    let i = 0;
    while (i < b.length - 1 && b[i] === 0) i++;
    const v = b.slice(i);
    const body = v[0]! & 0x80 ? concat(new Uint8Array([0]), v) : v;
    return concat(new Uint8Array([0x02, body.length]), body);
  };
  const seq = concat(int(raw.slice(0, 32)), int(raw.slice(32)));
  return concat(new Uint8Array([0x30, seq.length]), seq);
}

export class SoftPasskey {
  private readonly creds: Credential[] = [];
  constructor(
    readonly rpID: string,
    readonly origin: string,
  ) {}

  get count() {
    return this.creds.length;
  }

  async create(options: Json): Promise<Json> {
    const user = options.user as { id: string };
    const keys = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
      'sign',
      'verify',
    ])) as CryptoKeyPair;
    const jwk = (await crypto.subtle.exportKey('jwk', keys.publicKey)) as JsonWebKey;
    const cose = isoCBOR.encode(
      new Map<number, number | Uint8Array>([
        [1, 2],
        [3, -7],
        [-1, 1],
        [-2, isoBase64URL.toBuffer(jwk.x!)],
        [-3, isoBase64URL.toBuffer(jwk.y!)],
      ]),
    );
    const id = crypto.getRandomValues(new Uint8Array(16));
    const authData = concat(
      await sha256(enc.encode(this.rpID)),
      new Uint8Array([0x45]), // user present, user verified, attested credential data
      u32(0),
      new Uint8Array(16), // AAGUID
      new Uint8Array([0, id.length]),
      id,
      cose,
    );
    const attestationObject = isoCBOR.encode(
      new Map<string, unknown>([
        ['fmt', 'none'],
        ['attStmt', new Map()],
        ['authData', authData],
      ]) as never,
    );
    this.creds.push({ id, keys, userHandle: user.id, counter: 0 });
    const clientData = {
      type: 'webauthn.create',
      challenge: options.challenge,
      origin: this.origin,
      crossOrigin: false,
    };
    return {
      id: b64(id),
      rawId: b64(id),
      type: 'public-key',
      response: {
        clientDataJSON: b64(enc.encode(JSON.stringify(clientData))),
        attestationObject: b64(attestationObject),
        transports: ['internal'],
      },
      clientExtensionResults: {},
      authenticatorAttachment: 'platform',
    };
  }

  async get(options: Json, tamper = false): Promise<Json> {
    const allowed = (options.allowCredentials as Array<{ id: string }> | undefined) ?? [];
    const cred = allowed.length
      ? this.creds.find((c) => allowed.some((a) => a.id === b64(c.id)))
      : this.creds.at(-1);
    if (!cred) throw new Error('no matching passkey');
    cred.counter += 1;
    const authData = concat(await sha256(enc.encode(this.rpID)), new Uint8Array([0x05]), u32(cred.counter));
    const clientDataJSON = enc.encode(
      JSON.stringify({
        type: 'webauthn.get',
        challenge: options.challenge,
        origin: this.origin,
        crossOrigin: false,
      }),
    );
    const raw = new Uint8Array(
      await crypto.subtle.sign(
        { name: 'ECDSA', hash: 'SHA-256' },
        cred.keys.privateKey,
        concat(authData, await sha256(clientDataJSON)) as Uint8Array<ArrayBuffer>,
      ),
    );
    if (tamper) raw[10] = raw[10]! ^ 0xff;
    return {
      id: b64(cred.id),
      rawId: b64(cred.id),
      type: 'public-key',
      response: {
        clientDataJSON: b64(clientDataJSON),
        authenticatorData: b64(authData),
        signature: b64(derSignature(raw)),
        userHandle: cred.userHandle,
      },
      clientExtensionResults: {},
      authenticatorAttachment: 'platform',
    };
  }
}
