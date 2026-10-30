// Starts the Worker in the local Cloudflare runtime (workerd via `wrangler dev`) and checks the API end to end.
// Mock providers only: no network calls leave the machine.
import { execFileSync, spawn } from 'node:child_process';
import { newId } from '@plantpal/domain';
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
const args = ['exec', 'wrangler', 'dev', '--port', String(port), '--ip', '127.0.0.1'];
const dev = spawn('pnpm', [...args, '--var', `BETTER_AUTH_SECRET:${secret}`], {
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
check(status.ok === true && status.providers.length === 11, '/api/v1/status lists all 11 providers');

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
