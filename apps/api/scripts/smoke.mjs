// Starts the Worker in the local Cloudflare runtime (workerd via `wrangler dev`) and checks the API end to end.
// Mock providers only: no network calls leave the machine.
import { spawn, execFileSync } from 'node:child_process';

const port = Number(process.env.SMOKE_PORT ?? 8788);
const base = `http://127.0.0.1:${port}`;
const env = { ...process.env, WRANGLER_SEND_METRICS: 'false', CI: 'true' };

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
    process.kill(-dev.pid, 'SIGTERM');
  } catch {
    /* already stopped */
  }
};
const fail = (msg) => {
  console.error(`smoke: FAIL — ${msg}\n${log.slice(-2000)}`);
  stop();
  process.exit(1);
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

const check = (cond, msg) => {
  if (!cond) fail(msg);
  console.log(`smoke: ok — ${msg}`);
};

await waitReady();
const status = await (await fetch(`${base}/api/v1/status`)).json();
check(status.ok === true && status.providers.length === 11, '/api/v1/status lists all 11 providers');

const fc = await fetch(`${base}/api/v1/env/forecast?lat=18.52&lon=73.86`);
const fcBody = await fc.json();
check(
  fc.status === 200 && fcBody.provenance.lat === 18.5 && fcBody.provenance.demo === true,
  'forecast returns rounded, labelled demo facts',
);
check(fc.headers.get('ratelimit-limit') === '120', 'rate-limit headers come from the Durable Object limiter');

const bad = await fetch(`${base}/api/v1/env/forecast?lat=999&lon=0`);
check(
  bad.status === 400 && (await bad.json()).code === 'VALIDATION_FAILED',
  'invalid input returns problem+json',
);

const doc = await (await fetch(`${base}/api/v1/openapi.json`)).json();
check(doc.openapi === '3.1.0', 'OpenAPI document is served');
check(
  Boolean(doc.paths['/api/v1/sync/push'] && doc.paths['/api/v1/share/{token}']),
  'sync and sharing routes are documented',
);

const me = await fetch(`${base}/api/v1/me`);
check(me.status === 401 && (await me.json()).code === 'UNAUTHENTICATED', 'account routes need a session');

const reg = await fetch(`${base}/api/auth/passkey/generate-register-options?context=Smoke`);
const regBody = await reg.json();
check(
  reg.status === 200 && regBody.rp?.id === 'localhost' && typeof regBody.challenge === 'string',
  'passkey sign-up starts (Better Auth on D1)',
);

const share = await fetch(`${base}/api/v1/share/${'x'.repeat(43)}`);
check(
  share.status === 404 && (await share.json()).code === 'NOT_FOUND',
  'unknown sitter links are not found (D1 sync tables)',
);

const page = await fetch(`${base}/garden/journal`);
check(
  page.status === 200 && (await page.text()).includes('<div id="root">'),
  'web app is served for client-side routes',
);

await new Promise((r) => setTimeout(r, 500));
const after = await (await fetch(`${base}/api/v1/status`)).json();
check(
  Boolean(after.providers.find((p) => p.provider === 'open-meteo-forecast')?.lastSuccessAt),
  'provider success is recorded',
);

stop();
console.log('smoke: all checks passed');
process.exit(0);
