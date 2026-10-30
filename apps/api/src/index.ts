import { EnvClient, type ProviderMode } from '@plantpal/providers';
import { PROVIDER_IDS, type ProviderId } from '@plantpal/schemas';
import { createApp } from './app';
import { DurableRooms, type GardenRoom } from './garden-room';
import { DurableRateLimiter, type Limiter } from './limiter-do';
import { AccountsStore } from './lib/accounts';
import { createAuth, sessionAuthenticator } from './lib/auth';
import { CommunityStore } from './lib/community-store';
import { PushStore } from './lib/push-store';
import { D1StatusStore } from './lib/status-store';
import { D1SyncRepo } from './lib/sync-repo';
import { WorkersFactCache } from './lib/workers-cache';
import type { Authenticator } from './routes/accounts';
import { connectLive, LIVE_PATH } from './routes/live';

export { GardenRoom } from './garden-room';
export { Limiter } from './limiter-do';

export interface Env {
  DB: D1Database;
  LIMITER: DurableObjectNamespace<Limiter>;
  GARDEN_ROOM: DurableObjectNamespace<GardenRoom>;
  ASSETS: Fetcher;
  PROVIDERS: string;
  ALLOWED_ORIGINS: string;
  CONTACT: string;
  DISABLED_PROVIDERS?: string;
  /** Where the app is served; its host is the passkey relying party. */
  PUBLIC_ORIGIN: string;
  /** Worker secret (`wrangler secret put BETTER_AUTH_SECRET`). Accounts stay off without it. */
  BETTER_AUTH_SECRET?: string;
  /** Web Push (VAPID). The private key is a Worker secret; push stays off without both. */
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  /** `mailto:` or `https:` contact sent to push services; defaults to CONTACT. */
  VAPID_SUBJECT?: string;
  /** "on" turns the community on. Needs owner approval, a policy and a moderator first (§20). */
  FEATURE_COMMUNITY?: string;
  /** Hours a new account waits before posting in the community (default 24). */
  COMMUNITY_MIN_ACCOUNT_HOURS?: string;
  /** Cloudflare Turnstile secret; when set, posting needs a passed check. */
  TURNSTILE_SECRET_KEY?: string;
}

const HORIZON_DAYS = 90;

/** Accounts off: every account route answers 401. */
const signedOut: Authenticator = { userOf: async () => null };

interface Built {
  key: string;
  app: ReturnType<typeof createApp>;
  live: Parameters<typeof connectLive>[0];
}
let cached: Built | null = null;

/** The app is cached across requests, so background work must use the live request's context. */
let current: ExecutionContext | null = null;

function build(env: Env): Built {
  const secret = env.BETTER_AUTH_SECRET ?? '';
  const vapid =
    env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY
      ? {
          publicKey: env.VAPID_PUBLIC_KEY,
          privateKey: env.VAPID_PRIVATE_KEY,
          subject: env.VAPID_SUBJECT || env.CONTACT,
        }
      : null;
  const community = env.FEATURE_COMMUNITY === 'on';
  const key = `${env.PROVIDERS}|${env.DISABLED_PROVIDERS ?? ''}|${env.ALLOWED_ORIGINS}|${env.PUBLIC_ORIGIN}|${secret.length >= 32}|${vapid?.publicKey ?? ''}|${community}|${env.COMMUNITY_MIN_ACCOUNT_HOURS ?? ''}|${Boolean(env.TURNSTILE_SECRET_KEY)}`;
  if (cached?.key === key) return cached;
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
      current?.waitUntil(write);
    },
  });
  const allowedOrigins = env.ALLOWED_ORIGINS.split(',').map((s) => s.trim());
  // Better Auth starts async setup (D1 reads) when created. On Workers a promise begun in one
  // request cannot finish in another, so each call gets its own instance.
  const auth =
    secret.length >= 32
      ? () => createAuth({ database: env.DB, secret, publicOrigin: env.PUBLIC_ORIGIN, allowedOrigins })
      : null;
  const authenticator: Authenticator = auth
    ? { userOf: (req) => sessionAuthenticator(auth()).userOf(req) }
    : signedOut;
  const accounts = new AccountsStore(env.DB);
  const rooms = new DurableRooms(env.GARDEN_ROOM);
  const app = createApp({
    env: client,
    status,
    limiter: new DurableRateLimiter(env.LIMITER),
    mode,
    allowedOrigins,
    accounts: { accounts, sync: new D1SyncRepo(env.DB), auth: authenticator, rooms },
    push: { store: new PushStore(env.DB), vapid },
    community: {
      enabled: community,
      store: new CommunityStore(env.DB),
      minAccountHours: Number(env.COMMUNITY_MIN_ACCOUNT_HOURS ?? 24),
      turnstile: env.TURNSTILE_SECRET_KEY ? { secret: env.TURNSTILE_SECRET_KEY } : null,
    },
    ...(auth ? { authHandler: (req: Request) => auth().handler(req) } : {}),
  });
  cached = {
    key,
    app,
    live: { auth: authenticator, accounts, rooms, origins: [env.PUBLIC_ORIGIN, ...allowedOrigins] },
  };
  return cached;
}

export default {
  fetch(request, env, ctx) {
    current = ctx;
    const built = build(env);
    // The live socket skips the app router so its upgrade response reaches the browser untouched.
    const live = LIVE_PATH.exec(new URL(request.url).pathname);
    if (live) return connectLive(built.live, live[1]!, request);
    return built.app.fetch(request, env, ctx);
  },
  /** Daily: keep 90 days of change history (§14.3 tombstone horizon) and tidy the exchange. */
  scheduled(_event, env, ctx) {
    ctx.waitUntil(new D1SyncRepo(env.DB).prune(Date.now() - HORIZON_DAYS * 86_400_000));
    // Expired reservations and listings also change lazily when read; this keeps lists tidy.
    if (env.FEATURE_COMMUNITY === 'on') ctx.waitUntil(new CommunityStore(env.DB).sweep(null, Date.now()));
  },
} satisfies ExportedHandler<Env>;
