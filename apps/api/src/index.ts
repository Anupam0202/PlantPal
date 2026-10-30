import { EnvClient, type ProviderMode } from '@plantpal/providers';
import { PROVIDER_IDS, type ProviderId } from '@plantpal/schemas';
import { createApp } from './app';
import { DurableRateLimiter, type Limiter } from './limiter-do';
import { AccountsStore } from './lib/accounts';
import { createAuth, sessionAuthenticator } from './lib/auth';
import { D1SyncRepo } from './lib/sync-repo';
import type { Authenticator } from './routes/accounts';
import { D1StatusStore } from './lib/status-store';
import { WorkersFactCache } from './lib/workers-cache';

export { Limiter } from './limiter-do';

export interface Env {
  DB: D1Database;
  LIMITER: DurableObjectNamespace<Limiter>;
  ASSETS: Fetcher;
  PROVIDERS: string;
  ALLOWED_ORIGINS: string;
  CONTACT: string;
  DISABLED_PROVIDERS?: string;
  /** Where the app is served; its host is the passkey relying party. */
  PUBLIC_ORIGIN: string;
  /** Worker secret (`wrangler secret put BETTER_AUTH_SECRET`). Accounts stay off without it. */
  BETTER_AUTH_SECRET?: string;
}

/** Accounts off: every account route answers 401. */
const signedOut: Authenticator = { userOf: async () => null };

let cached: { key: string; app: ReturnType<typeof createApp> } | null = null;

/** The app is cached across requests, so background work must use the live request's context. */
let live: ExecutionContext | null = null;

function appFor(env: Env) {
  const secret = env.BETTER_AUTH_SECRET ?? '';
  const key = `${env.PROVIDERS}|${env.DISABLED_PROVIDERS ?? ''}|${env.ALLOWED_ORIGINS}|${env.PUBLIC_ORIGIN}|${secret.length >= 32}`;
  if (cached?.key === key) return cached.app;
  const mode: ProviderMode = env.PROVIDERS === 'live' ? 'live' : 'mock';
  const status = new D1StatusStore(env.DB);
  const disabled = (env.DISABLED_PROVIDERS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s): s is ProviderId => (PROVIDER_IDS as readonly string[]).includes(s));
  const client = new EnvClient({
    mode,
    cache: new WorkersFactCache(typeof caches !== 'undefined' ? caches.default : null),
    userAgent: `PlantPal/3 (+${env.CONTACT})`,
    disabled,
    onStatus: (e) => {
      const write = status.record(e).catch(() => undefined);
      live?.waitUntil(write);
    },
  });
  const allowedOrigins = env.ALLOWED_ORIGINS.split(',').map((s) => s.trim());
  // Better Auth starts async setup (D1 reads) when created. On Workers a promise begun in one
  // request cannot finish in another, so each call gets its own instance.
  const auth =
    secret.length >= 32
      ? () => createAuth({ database: env.DB, secret, publicOrigin: env.PUBLIC_ORIGIN, allowedOrigins })
      : null;
  const app = createApp({
    env: client,
    status,
    limiter: new DurableRateLimiter(env.LIMITER),
    mode,
    allowedOrigins,
    accounts: {
      accounts: new AccountsStore(env.DB),
      sync: new D1SyncRepo(env.DB),
      auth: auth ? { userOf: (req) => sessionAuthenticator(auth()).userOf(req) } : signedOut,
    },
    ...(auth ? { authHandler: (req: Request) => auth().handler(req) } : {}),
  });
  cached = { key, app };
  return app;
}

export default {
  fetch(request, env, ctx) {
    live = ctx;
    return appFor(env).fetch(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
