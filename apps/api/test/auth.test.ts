import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getMigrations } from 'better-auth/db/migration';
import { newId } from '@plantpal/domain';
import { EnvClient, MemoryCache } from '@plantpal/providers';
import { createApp } from '../src/app';
import { AccountsStore } from '../src/lib/accounts';
import { createAuth, sessionAuthenticator } from '../src/lib/auth';
import { MemoryRateLimiter } from '../src/lib/rate-limit';
import { MemoryStatusStore } from '../src/lib/status-store';
import { D1SyncRepo } from '../src/lib/sync-repo';
import { createD1 } from './d1-shim';
import { SoftPasskey } from './webauthn';

const ORIGIN = 'https://plantpal.example';
const MIGRATIONS = ['0001_provider_status.sql', '0002_sync.sql', '0003_auth.sql'];
const sql = (f: string) => readFileSync(new URL(`../migrations/${f}`, import.meta.url).pathname, 'utf8');

async function setup() {
  const d1 = createD1();
  for (const f of MIGRATIONS) await d1.exec(sql(f));
  const auth = createAuth({
    database: d1,
    secret: 'test-secret-that-is-at-least-32-chars',
    publicOrigin: ORIGIN,
    allowedOrigins: [],
  });
  const app = createApp({
    env: new EnvClient({ mode: 'mock', cache: new MemoryCache() }),
    status: new MemoryStatusStore(),
    limiter: new MemoryRateLimiter(1000, 100),
    mode: 'mock',
    allowedOrigins: [ORIGIN],
    traceId: () => 'trace-1',
    accounts: { accounts: new AccountsStore(d1), sync: new D1SyncRepo(d1), auth: sessionAuthenticator(auth) },
    authHandler: (req) => auth.handler(req),
  });
  return { d1, auth, app };
}

/** One browser: a cookie jar and an Origin header on every request. */
function browser(app: Awaited<ReturnType<typeof setup>>['app'], origin = ORIGIN) {
  const jar = new Map<string, string>();
  const call = async (method: string, path: string, body?: unknown) => {
    const res = await app.request(path, {
      method,
      headers: {
        origin,
        ...(jar.size ? { cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') } : {}),
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    for (const c of res.headers.getSetCookie()) {
      const [pair, ...attrs] = c.split(';');
      const i = pair!.indexOf('=');
      const name = pair!.slice(0, i).trim();
      const value = pair!.slice(i + 1).trim();
      const gone = !value || attrs.some((a) => /max-age=0\b/i.test(a.trim()));
      if (gone) jar.delete(name);
      else jar.set(name, value);
    }
    return res;
  };
  return { call, jar };
}

async function signUp(b: ReturnType<typeof browser>, key: SoftPasskey, name = 'Anu') {
  const opts = await b.call(
    'GET',
    `/api/auth/passkey/generate-register-options?context=${encodeURIComponent(name)}`,
  );
  expect(opts.status).toBe(200);
  const response = await key.create((await opts.json()) as Record<string, unknown>);
  return b.call('POST', '/api/auth/passkey/verify-registration', { response, createSession: true });
}

async function signIn(b: ReturnType<typeof browser>, key: SoftPasskey, tamper = false) {
  const opts = await b.call('GET', '/api/auth/passkey/generate-authenticate-options');
  expect(opts.status).toBe(200);
  const response = await key.get((await opts.json()) as Record<string, unknown>, tamper);
  return b.call('POST', '/api/auth/passkey/verify-authentication', { response });
}

type Me = { user: { id: string; name: string }; workspaces: unknown[] };
const me = async (b: ReturnType<typeof browser>) => {
  const res = await b.call('GET', '/api/v1/me');
  return { status: res.status, body: res.status === 200 ? ((await res.json()) as Me) : null };
};

describe('passkey accounts', () => {
  it('the committed migration matches what Better Auth needs', async () => {
    const { auth } = await setup();
    const plan = await getMigrations(auth.options);
    expect(plan.toBeCreated.map((t) => t.table)).toEqual([]);
    expect(plan.toBeAdded.map((t) => t.table)).toEqual([]);
  });

  it('signs up with a passkey alone, then signs out and back in', async () => {
    const { app } = await setup();
    const b = browser(app);
    const key = new SoftPasskey('plantpal.example', ORIGIN);
    expect((await me(b)).status).toBe(401);

    const created = await signUp(b, key);
    expect(created.status).toBe(200);
    const who = await me(b);
    expect(who.status).toBe(200);
    expect(who.body!.user.name).toBe('Anu');
    const userId = who.body!.user.id as string;

    // The account can claim its device workspace.
    const ws = newId();
    expect((await b.call('POST', '/api/v1/workspaces', { id: ws, name: 'Home' })).status).toBe(201);

    expect((await b.call('POST', '/api/auth/sign-out', {})).status).toBe(200);
    expect((await me(b)).status).toBe(401);

    const back = await signIn(b, key);
    expect(back.status).toBe(200);
    const again = await me(b);
    expect(again.body!.user.id).toBe(userId);
    expect(again.body!.workspaces).toEqual([{ id: ws, name: 'Home', role: 'owner' }]);
  });

  it('stores no password, email we would send to, or IP address', async () => {
    const { app, d1 } = await setup();
    const b = browser(app);
    await signUp(b, new SoftPasskey('plantpal.example', ORIGIN));
    const user = (await d1.prepare('select * from "user"').first()) as Record<string, unknown>;
    expect(String(user.email)).toMatch(/@passkey\.invalid$/);
    const accounts = await d1.prepare('select * from account').all();
    expect(accounts.results).toEqual([]);
    const session = (await d1.prepare('select * from session').first()) as Record<string, unknown>;
    expect(session.ipAddress ?? '').toBe('');
  });

  it('adds a second passkey to the signed-in account instead of making a new one', async () => {
    const { app, d1 } = await setup();
    const b = browser(app);
    const key = new SoftPasskey('plantpal.example', ORIGIN);
    await signUp(b, key);
    const userId = (await me(b)).body!.user.id;
    const opts = await b.call('GET', '/api/auth/passkey/generate-register-options?context=ignored');
    const options = (await opts.json()) as { user: { name: string } };
    const response = await key.create(options);
    expect((await b.call('POST', '/api/auth/passkey/verify-registration', { response })).status).toBe(200);
    const users = await d1.prepare('select id from "user"').all();
    expect(users.results).toEqual([{ id: userId }]);
    const keys = await d1.prepare('select "userId" from passkey').all();
    expect(keys.results).toEqual([{ userId }, { userId }]);
  });

  it('rejects a forged signature, a foreign origin, a missing name and a missing challenge', async () => {
    const { app, d1 } = await setup();
    const b = browser(app);
    const key = new SoftPasskey('plantpal.example', ORIGIN);
    await signUp(b, key);
    await b.call('POST', '/api/auth/sign-out', {});

    const forged = await signIn(b, key, true);
    expect(forged.status).toBeGreaterThanOrEqual(400);
    expect((await me(b)).status).toBe(401);

    // A look-alike site cannot use a passkey made for PlantPal.
    const evil = browser(app, 'https://plantpal.example.evil');
    const phish = new SoftPasskey('plantpal.example.evil', 'https://plantpal.example.evil');
    expect((await signUp(evil, phish)).status).toBeGreaterThanOrEqual(400);

    expect((await b.call('GET', '/api/auth/passkey/generate-register-options')).status).toBe(400);
    expect(
      (await b.call('GET', `/api/auth/passkey/generate-register-options?context=${'x'.repeat(61)}`)).status,
    ).toBe(400);

    // A registration answer without the signed challenge cookie from this browser.
    const opts = await b.call('GET', '/api/auth/passkey/generate-register-options?context=Bo');
    const response = await new SoftPasskey('plantpal.example', ORIGIN).create(
      (await opts.json()) as Record<string, unknown>,
    );
    const stranger = browser(app);
    expect(
      (
        await stranger.call('POST', '/api/auth/passkey/verify-registration', {
          response,
          createSession: true,
        })
      ).status,
    ).toBe(400);
    const users = await d1.prepare('select count(*) as n from "user"').first('n');
    expect(users).toBe(1);
  });

  it('says accounts are off when the server has no auth secret', async () => {
    const app = createApp({
      env: new EnvClient({ mode: 'mock', cache: new MemoryCache() }),
      status: new MemoryStatusStore(),
      limiter: new MemoryRateLimiter(1000, 100),
      mode: 'mock',
      allowedOrigins: [ORIGIN],
      traceId: () => 'trace-1',
    });
    const res = await app.request('/api/auth/passkey/generate-authenticate-options');
    expect(res.status).toBe(503);
    expect(((await res.json()) as { code: string }).code).toBe('CONFIGURATION_REQUIRED');
  });
});
