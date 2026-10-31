// Starts the Worker in the local Cloudflare runtime (workerd via `wrangler dev`) and checks the API end to end.
// Mock providers only: no network calls leave the machine.
import { execFileSync, spawn } from 'node:child_process';
import { newId } from '@plantpal/domain';
import { latLngToCell } from 'h3-js';
import { b64urlEncode } from '../src/lib/webpush';
import { SoftPasskey } from '../test/webauthn';

const port = Number(process.env.SMOKE_PORT ?? 8788);
const base = `http://127.0.0.1:${port}`;
const env = { ...process.env, WRANGLER_SEND_METRICS: 'false', CI: 'true' };
// The app origin in wrangler.toml (PUBLIC_ORIGIN): the passkey relying party is "localhost".
const APP_ORIGIN = 'http://localhost:8787';

execFileSync('pnpm', ['exec', 'wrangler', 'd1', 'migrations', 'apply', 'plantpal', '--local'], {
  stdio: 'inherit',
  env,
});
// A throwaway secret so passkey accounts are on for this run only.
const secret = [...crypto.getRandomValues(new Uint8Array(24))]
  .map((b) => b.toString(16).padStart(2, '0'))
  .join('');
// Throwaway VAPID keys: push routes are on, but nothing is ever sent to a real push service.
const vapidPair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
  'sign',
  'verify',
])) as CryptoKeyPair;
const vapidPublic = b64urlEncode(
  new Uint8Array((await crypto.subtle.exportKey('raw', vapidPair.publicKey)) as ArrayBuffer),
);
const vapidPrivate = ((await crypto.subtle.exportKey('jwk', vapidPair.privateKey)) as JsonWebKey).d!;
const args = ['exec', 'wrangler', 'dev', '--port', String(port), '--ip', '127.0.0.1'];
const vars = [
  `BETTER_AUTH_SECRET:${secret}`,
  `VAPID_PUBLIC_KEY:${vapidPublic}`,
  `VAPID_PRIVATE_KEY:${vapidPrivate}`,
  'FEATURE_COMMUNITY:on',
  'COMMUNITY_MIN_ACCOUNT_HOURS:0',
].flatMap((v) => ['--var', v]);
const dev = spawn('pnpm', [...args, ...vars], {
  env,
  stdio: ['ignore', 'pipe', 'pipe'],
  detached: true,
});
let log = '';
dev.stdout.on('data', (d) => (log += d));
dev.stderr.on('data', (d) => (log += d));

const stop = () => {
  try {
    process.kill(-dev.pid!, 'SIGTERM');
  } catch {
    /* already stopped */
  }
};
const fail = (msg: string): never => {
  console.error(`smoke: FAIL — ${msg}\n${log.slice(-2000)}`);
  stop();
  process.exit(1);
  throw new Error(msg);
};

async function waitReady() {
  for (let i = 0; i < 90; i++) {
    try {
      const r = await fetch(`${base}/api/v1/status`);
      if (r.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  fail('worker did not start');
}

const check = (cond: unknown, msg: string) => {
  if (!cond) fail(msg);
  console.log(`smoke: ok — ${msg}`);
};

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

await waitReady();
const status = (await (await fetch(`${base}/api/v1/status`)).json()) as Json;
check(status.ok === true && status.providers.length === 12, '/api/v1/status lists all 12 providers');

const fc = await fetch(`${base}/api/v1/env/forecast?lat=18.52&lon=73.86`);
const fcBody = (await fc.json()) as Json;
check(
  fc.status === 200 && fcBody.provenance.lat === 18.5 && fcBody.provenance.demo === true,
  'forecast returns rounded, labelled demo facts',
);
check(fc.headers.get('ratelimit-limit') === '120', 'rate-limit headers come from the Durable Object limiter');

const bad = await fetch(`${base}/api/v1/env/forecast?lat=999&lon=0`);
check(
  bad.status === 400 && ((await bad.json()) as Json).code === 'VALIDATION_FAILED',
  'invalid input returns problem+json',
);

const doc = (await (await fetch(`${base}/api/v1/openapi.json`)).json()) as Json;
check(doc.openapi === '3.1.0', 'OpenAPI document is served');
check(
  Boolean(doc.paths['/api/v1/sync/push'] && doc.paths['/api/v1/share/{token}']),
  'sync and sharing routes are documented',
);

const me = await fetch(`${base}/api/v1/me`);
check(
  me.status === 401 && ((await me.json()) as Json).code === 'UNAUTHENTICATED',
  'account routes need a session',
);

const share = await fetch(`${base}/api/v1/share/${'x'.repeat(43)}`);
check(
  share.status === 404 && ((await share.json()) as Json).code === 'NOT_FOUND',
  'unknown sitter links are not found (D1 sync tables)',
);

// ---- A signed-in member, end to end in workerd: passkey sign-up, a garden, live change pings.
/** One browser: its own cookie jar. */
function session() {
  const jar = new Map<string, string>();
  const call = async (method: string, path: string, body?: unknown) => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: {
        origin: APP_ORIGIN,
        ...(jar.size ? { cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') } : {}),
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(';');
      const i = pair!.indexOf('=');
      jar.set(pair!.slice(0, i).trim(), pair!.slice(i + 1).trim());
    }
    return res;
  };
  /** Signs up with a fresh software passkey. */
  const signUp = async (name: string) => {
    const options = (await (
      await call('GET', `/api/auth/passkey/generate-register-options?context=${name}`)
    ).json()) as Json;
    return call('POST', '/api/auth/passkey/verify-registration', {
      response: await new SoftPasskey('localhost', APP_ORIGIN).create(options),
      createSession: true,
    });
  };
  return { jar, call, signUp };
}
const { jar, call } = session();

const key = new SoftPasskey('localhost', APP_ORIGIN);
const reg = await call('GET', '/api/auth/passkey/generate-register-options?context=Smoke');
const regBody = (await reg.json()) as Json;
check(reg.status === 200 && regBody.rp?.id === 'localhost', 'passkey sign-up starts (Better Auth on D1)');
const verified = await call('POST', '/api/auth/passkey/verify-registration', {
  response: await key.create(regBody),
  createSession: true,
});
check(verified.status === 200, 'a passkey account is created after WebAuthn verification');
const meNow = (await (await call('GET', '/api/v1/me')).json()) as Json;
check(meNow.user?.name === 'Smoke', 'the session cookie signs requests in');

const ws = newId();
check(
  (await call('POST', '/api/v1/workspaces', { id: ws, name: 'Smoke' })).status === 201,
  'a workspace is claimed',
);

const foreign = new WebSocket(`ws://127.0.0.1:${port}/api/v1/workspaces/${ws}/live`, {
  headers: { origin: 'https://evil.example', cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') },
} as never);
const refused = await new Promise<boolean>((resolve) => {
  foreign.addEventListener('open', () => resolve(false));
  foreign.addEventListener('error', () => resolve(true));
});
check(refused, 'live sockets from other sites are refused');

const socket = new WebSocket(`ws://127.0.0.1:${port}/api/v1/workspaces/${ws}/live`, {
  headers: { origin: APP_ORIGIN, cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') },
} as never);
const messages: string[] = [];
socket.addEventListener('message', (e) => messages.push(String(e.data)));
const opened = await new Promise<boolean>((resolve) => {
  socket.addEventListener('open', () => resolve(true));
  socket.addEventListener('error', () => resolve(false));
  setTimeout(() => resolve(false), 10_000);
});
check(opened, 'a member opens the garden’s live socket (GardenRoom Durable Object)');
socket.send('ping');

const now = Date.now();
const garden = {
  id: newId(),
  workspaceId: ws,
  createdAt: now,
  updatedAt: now,
  version: 1,
  deletedAt: null,
  name: 'Smoke garden',
  timezone: 'UTC',
  hemisphere: null,
  place: null,
  region: null,
  profile: null,
  notes: '',
  source: null,
};
const pushed = (await (
  await call('POST', '/api/v1/sync/push', {
    ops: [
      {
        opId: newId(),
        workspaceId: ws,
        type: 'garden.create',
        entityId: garden.id,
        payload: garden,
        baseVersion: null,
        createdAt: now,
        clientSchema: 7,
        state: 'pending',
      },
    ],
  })
).json()) as Json;
check(pushed.results?.[0]?.status === 'applied', 'a change is pushed');
for (let i = 0; i < 50 && !messages.some((m) => m.includes('"changed"')); i++)
  await new Promise((r) => setTimeout(r, 100));
check(messages.includes('pong'), 'the room answers pings without waking (hibernation auto-response)');
check(
  messages.some((m) => JSON.parse(m === 'pong' ? '{}' : m).type === 'changed'),
  'members get a "changed" ping after a push',
);
socket.close();

const pushKey = (await (await call('GET', '/api/v1/push/key')).json()) as Json;
check(pushKey.publicKey === vapidPublic, 'the VAPID public key is served for push subscriptions');
const browser = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
  'deriveBits',
])) as CryptoKeyPair;
const subscription = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/smoke-test',
  keys: {
    p256dh: b64urlEncode(
      new Uint8Array((await crypto.subtle.exportKey('raw', browser.publicKey)) as ArrayBuffer),
    ),
    auth: b64urlEncode(crypto.getRandomValues(new Uint8Array(16))),
  },
};
check(
  (await call('POST', '/api/v1/push/subscriptions', subscription)).status === 201,
  'a browser push subscription is saved (D1)',
);
check(
  (await call('POST', '/api/v1/push/subscriptions', { ...subscription, endpoint: 'https://evil.example/x' }))
    .status === 400,
  'subscriptions to unknown push services are refused',
);
check(
  (await call('DELETE', '/api/v1/push/subscriptions', { endpoint: subscription.endpoint })).status === 204,
  'a push subscription is removed',
);

// ---- Community (flag on for this run): the exchange's single-winner reservation on real D1.
const other = session();
check((await other.signUp('Neighbour')).status === 200, 'a second person signs up');
const cell = latLngToCell(18.52, 73.86, 7);
for (const who of [call, other.call])
  check(
    (await who('PUT', '/api/v1/community/profile', { displayName: 'Smoke', cell, country: 'IN' })).status ===
      200,
    'a community profile is saved with a coarse cell',
  );
const offer = (await (
  await call('POST', '/api/v1/community/exchange', {
    kind: 'seeds',
    title: 'Tulsi seeds',
    scientificName: null,
  })
).json()) as Json;
check(offer.state === 'listed', 'a listing is offered');
const both = await Promise.all(
  [1, 2].map(() => other.call('POST', `/api/v1/community/exchange/${offer.id}/reserve`)),
);
check(
  both
    .map((r) => r.status)
    .sort()
    .join() === '200,409',
  'two reservations at once: exactly one wins (D1 batch with a conditional update)',
);
check(
  ((await (await call('POST', `/api/v1/community/exchange/${offer.id}/release`)).json()) as Json).listing
    ?.state === 'listed',
  'the owner releases it back to listed',
);
await other.call('POST', `/api/v1/community/exchange/${offer.id}/reserve`);
await call('POST', `/api/v1/community/exchange/${offer.id}/confirm`);
await other.call('POST', `/api/v1/community/exchange/${offer.id}/confirm`);
const completed = (await (
  await other.call('POST', `/api/v1/community/exchange/${offer.id}/complete`)
).json()) as Json;
check(completed.listing?.state === 'completed', 'both confirm the handoff, then it completes');
const soon = Date.now() + 86_400_000;
const event = (await (
  await call('POST', '/api/v1/community/events', {
    title: 'Seed swap',
    place: 'Library steps',
    startsAt: soon,
    endsAt: soon + 7_200_000,
    capacity: 1,
  })
).json()) as Json;
await call('PUT', `/api/v1/community/events/${event.id}/rsvp`, { status: 'going' });
await other.call('PUT', `/api/v1/community/events/${event.id}/rsvp`, { status: 'maybe' });
const full = await other.call('PUT', `/api/v1/community/events/${event.id}/rsvp`, { status: 'going' });
const kept = (await (await other.call('GET', `/api/v1/community/events/${event.id}`)).json()) as Json;
check(
  full.status === 409 && kept.event?.mine === 'maybe' && kept.event?.going === 1,
  'a full event refuses another “going” and keeps the earlier answer',
);
const map = (await (await call('GET', '/api/v1/community/map')).json()) as Json;
check(
  Array.isArray(map.cells) && map.cells.length === 0,
  'the map hides cells with fewer than five contributors',
);

const green = (await (await fetch(`${base}/api/v1/env/green-space?cell=${cell}`)).json()) as Json;
check(
  green.tile === cell && Array.isArray(green.areas) && green.provenance?.lat === null,
  'green space is served for a coarse tile (H3 runs in the Worker)',
);
check(
  (await fetch(`${base}/api/v1/env/green-space?lat=18.52&lon=73.86`)).status === 400,
  'green space refuses coordinates',
);

const page = await fetch(`${base}/garden/journal`);
check(
  page.status === 200 && (await page.text()).includes('<div id="root">'),
  'web app is served for client-side routes',
);

await new Promise((r) => setTimeout(r, 500));
const after = (await (await fetch(`${base}/api/v1/status`)).json()) as Json;
check(
  Boolean(after.providers.find((p: Json) => p.provider === 'open-meteo-forecast')?.lastSuccessAt),
  'provider success is recorded',
);

stop();
console.log('smoke: all checks passed');
process.exit(0);
