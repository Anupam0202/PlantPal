import { createECDH, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { EnvClient, MemoryCache } from '@plantpal/providers';
import { createApp } from '../src/app';
import { AccountsStore } from '../src/lib/accounts';
import { PushStore } from '../src/lib/push-store';
import { MemoryRateLimiter } from '../src/lib/rate-limit';
import { MemoryStatusStore } from '../src/lib/status-store';
import { D1SyncRepo } from '../src/lib/sync-repo';
import {
  b64urlDecode,
  b64urlEncode,
  encryptPayload,
  isPushEndpoint,
  sendPush,
  vapidAuthorization,
  type Vapid,
} from '../src/lib/webpush';
import type { Authenticator } from '../src/routes/accounts';
import { createD1 } from './d1-shim';

// Martin Thomson's reference implementation of RFC 8188, used here only to check our output.
const ece = createRequire(import.meta.url)('http_ece') as {
  decrypt(
    data: Buffer,
    params: { version: string; privateKey: ReturnType<typeof createECDH>; authSecret: Buffer },
  ): Buffer;
};

/** A browser's side of a subscription, made with Node's own crypto. */
function browserKeys() {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  const auth = randomBytes(16);
  return {
    ecdh,
    auth,
    p256dh: b64urlEncode(ecdh.getPublicKey()),
    authB64: b64urlEncode(auth),
  };
}

async function vapidKeys(): Promise<Vapid> {
  const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ])) as CryptoKeyPair;
  const pub = new Uint8Array((await crypto.subtle.exportKey('raw', pair.publicKey)) as ArrayBuffer);
  const jwk = (await crypto.subtle.exportKey('jwk', pair.privateKey)) as JsonWebKey;
  return {
    publicKey: b64urlEncode(pub),
    privateKey: jwk.d!,
    subject: 'https://github.com/Anupam0202/PlantPal',
  };
}

const FCM = 'https://fcm.googleapis.com/fcm/send/abc123';

describe('Web Push encryption (RFC 8291) and VAPID (RFC 8292)', () => {
  it('produces an aes128gcm message the reference implementation decrypts', async () => {
    const b = browserKeys();
    const message = new TextEncoder().encode(JSON.stringify({ title: 'PlantPal', body: 'Water the basil' }));
    const body = await encryptPayload(message, { p256dh: b.p256dh, auth: b.authB64 });
    // Header: 16-byte salt, record size 4096, 65-byte key id (the sender's public key).
    expect(new DataView(body.buffer, body.byteOffset).getUint32(16)).toBe(4096);
    expect(body[20]).toBe(65);
    const plain = ece.decrypt(Buffer.from(body), {
      version: 'aes128gcm',
      privateKey: b.ecdh,
      authSecret: b.auth,
    });
    expect(JSON.parse(plain.toString('utf8'))).toEqual({ title: 'PlantPal', body: 'Water the basil' });
    // A fresh sender key and salt each time.
    const again = await encryptPayload(message, { p256dh: b.p256dh, auth: b.authB64 });
    expect(Buffer.from(again).equals(Buffer.from(body))).toBe(false);
  });

  it('refuses oversized payloads and malformed keys', async () => {
    const b = browserKeys();
    await expect(
      encryptPayload(new Uint8Array(4000), { p256dh: b.p256dh, auth: b.authB64 }),
    ).rejects.toThrow();
    await expect(encryptPayload(new Uint8Array(4), { p256dh: 'AAAA', auth: b.authB64 })).rejects.toThrow();
  });

  it('signs a VAPID JWT the push service can verify with the public key', async () => {
    const v = await vapidKeys();
    const now = Date.UTC(2026, 9, 30, 8);
    const header = await vapidAuthorization(FCM, v, now);
    const m = /^vapid t=([^,]+), k=(.+)$/.exec(header)!;
    expect(m[2]).toBe(v.publicKey);
    const [h, c, s] = m[1]!.split('.');
    expect(JSON.parse(new TextDecoder().decode(b64urlDecode(h!)))).toEqual({ typ: 'JWT', alg: 'ES256' });
    const claims = JSON.parse(new TextDecoder().decode(b64urlDecode(c!)));
    expect(claims).toEqual({
      aud: 'https://fcm.googleapis.com',
      exp: now / 1000 + 12 * 3600,
      sub: v.subject,
    });
    const pub = await crypto.subtle.importKey(
      'raw',
      b64urlDecode(v.publicKey),
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    );
    const ok = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      pub,
      b64urlDecode(s!),
      new TextEncoder().encode(`${h}.${c}`),
    );
    expect(ok).toBe(true);
  });

  it('only calls known browser push services', () => {
    for (const ok of [
      FCM,
      'https://updates.push.services.mozilla.com/wpush/v2/x',
      'https://web.push.apple.com/QGuL',
      'https://wns2-par02p.notify.windows.com/w/?token=x',
    ])
      expect(isPushEndpoint(ok), ok).toBe(true);
    for (const bad of [
      'http://fcm.googleapis.com/fcm/send/x',
      'https://fcm.googleapis.com.evil.example/x',
      'https://evil.example/fcm.googleapis.com',
      'https://127.0.0.1/x',
      'https://fcm.googleapis.com:8443/x',
      'https://user:pass@fcm.googleapis.com/x',
      'not a url',
    ])
      expect(isPushEndpoint(bad), bad).toBe(false);
  });

  it('reports gone subscriptions so they are deleted', async () => {
    const b = browserKeys();
    const v = await vapidKeys();
    const sub = { endpoint: FCM, p256dh: b.p256dh, auth: b.authB64 };
    const status = (s: number) => async () => new Response(null, { status: s });
    expect(await sendPush(sub, { t: 1 }, v, { fetch: status(201) })).toBe('sent');
    expect(await sendPush(sub, { t: 1 }, v, { fetch: status(410) })).toBe('gone');
    expect(await sendPush(sub, { t: 1 }, v, { fetch: status(404) })).toBe('gone');
    expect(await sendPush(sub, { t: 1 }, v, { fetch: status(503) })).toBe('failed');
  });
});

describe('Web Push routes', () => {
  const sql = (f: string) => readFileSync(new URL(`../migrations/${f}`, import.meta.url).pathname, 'utf8');
  const auth: Authenticator = {
    userOf: async (req) => {
      const id = req.headers.get('x-test-user');
      return id ? { id, name: id } : null;
    },
  };

  async function setup(withVapid = true) {
    const d1 = createD1();
    for (const f of ['0001_provider_status.sql', '0002_sync.sql', '0003_auth.sql', '0004_push.sql'])
      await d1.exec(sql(f));
    const vapid = withVapid ? await vapidKeys() : null;
    const sent: Array<{ url: string; headers: Headers; body: Uint8Array }> = [];
    let reply = 201;
    const app = createApp({
      env: new EnvClient({ mode: 'mock', cache: new MemoryCache() }),
      status: new MemoryStatusStore(),
      limiter: new MemoryRateLimiter(1000, 100),
      mode: 'mock',
      allowedOrigins: [],
      traceId: () => 'trace-1',
      accounts: { accounts: new AccountsStore(d1), sync: new D1SyncRepo(d1), auth },
      push: {
        store: new PushStore(d1),
        vapid,
        fetch: async (url, init) => {
          sent.push({
            url: String(url),
            headers: new Headers(init?.headers),
            body: new Uint8Array(init?.body as Uint8Array),
          });
          return new Response(null, { status: reply });
        },
      },
    });
    const call = (user: string | null, method: string, path: string, body?: unknown) =>
      app.request(path, {
        method,
        headers: {
          ...(user ? { 'x-test-user': user } : {}),
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    return { call, d1, vapid, sent, setReply: (s: number) => (reply = s) };
  }

  it('says push is off when the server has no VAPID keys', async () => {
    const { call } = await setup(false);
    const res = await call(null, 'GET', '/api/v1/push/key');
    expect(res.status).toBe(503);
    expect(((await res.json()) as { code: string }).code).toBe('CONFIGURATION_REQUIRED');
  });

  it('saves my browser, sends an encrypted test notification to it, and forgets it when it is gone', async () => {
    const { call, vapid, sent, setReply, d1 } = await setup();
    expect(await (await call(null, 'GET', '/api/v1/push/key')).json()).toEqual({
      publicKey: vapid!.publicKey,
    });

    const b = browserKeys();
    const subscription = { endpoint: FCM, keys: { p256dh: b.p256dh, auth: b.authB64 } };
    expect((await call(null, 'POST', '/api/v1/push/subscriptions', subscription)).status).toBe(401);
    expect(
      (
        await call('u-1', 'POST', '/api/v1/push/subscriptions', {
          ...subscription,
          endpoint: 'https://evil.example/x',
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await call('u-1', 'POST', '/api/v1/push/subscriptions', {
          ...subscription,
          keys: { p256dh: 'AAAA', auth: b.authB64 },
        })
      ).status,
    ).toBe(400);
    expect((await call('u-1', 'POST', '/api/v1/push/subscriptions', subscription)).status).toBe(201);
    // Saving the same browser again does not duplicate it.
    expect((await call('u-1', 'POST', '/api/v1/push/subscriptions', subscription)).status).toBe(201);
    expect(await d1.prepare('select count(*) as n from push_subscriptions').first('n')).toBe(1);

    const r = await call('u-1', 'POST', '/api/v1/push/test');
    expect(await r.json()).toEqual({ sent: 1, removed: 0, failed: 0 });
    expect(sent).toHaveLength(1);
    expect(sent[0]!.url).toBe(FCM);
    expect(sent[0]!.headers.get('content-encoding')).toBe('aes128gcm');
    expect(sent[0]!.headers.get('authorization')).toMatch(/^vapid t=.+, k=/);
    const note = JSON.parse(
      ece
        .decrypt(Buffer.from(sent[0]!.body), { version: 'aes128gcm', privateKey: b.ecdh, authSecret: b.auth })
        .toString('utf8'),
    );
    expect(note).toMatchObject({ title: 'PlantPal', url: '/settings/account', tag: 'plantpal-test' });

    // Someone else can neither test-send to nor remove my browser.
    expect(await (await call('u-2', 'POST', '/api/v1/push/test')).json()).toEqual({
      sent: 0,
      removed: 0,
      failed: 0,
    });
    await call('u-2', 'DELETE', '/api/v1/push/subscriptions', { endpoint: FCM });
    expect(await d1.prepare('select count(*) as n from push_subscriptions').first('n')).toBe(1);

    setReply(410);
    expect(await (await call('u-1', 'POST', '/api/v1/push/test')).json()).toEqual({
      sent: 0,
      removed: 1,
      failed: 0,
    });
    expect(await d1.prepare('select count(*) as n from push_subscriptions').first('n')).toBe(0);
  });

  it('removes my browser when I turn notifications off', async () => {
    const { call, d1 } = await setup();
    const b = browserKeys();
    await call('u-1', 'POST', '/api/v1/push/subscriptions', {
      endpoint: FCM,
      keys: { p256dh: b.p256dh, auth: b.authB64 },
    });
    expect((await call('u-1', 'DELETE', '/api/v1/push/subscriptions', { endpoint: FCM })).status).toBe(204);
    expect(await d1.prepare('select count(*) as n from push_subscriptions').first('n')).toBe(0);
  });
});
