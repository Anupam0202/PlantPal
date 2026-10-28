import { EnvClient, type ProviderMode } from '@plantpal/providers';
import { PROVIDER_IDS, type ProviderId } from '@plantpal/schemas';
import { createApp } from './app';
import { DurableRateLimiter, type Limiter } from './limiter-do';
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
}

let cached: { key: string; app: ReturnType<typeof createApp> } | null = null;

function appFor(env: Env, ctx: ExecutionContext) {
  const key = `${env.PROVIDERS}|${env.DISABLED_PROVIDERS ?? ''}|${env.ALLOWED_ORIGINS}`;
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
    onStatus: (e) => ctx.waitUntil(status.record(e).catch(() => undefined)),
  });
  const app = createApp({
    env: client,
    status,
    limiter: new DurableRateLimiter(env.LIMITER),
    mode,
    allowedOrigins: env.ALLOWED_ORIGINS.split(',').map((s) => s.trim()),
  });
  cached = { key, app };
  return app;
}

export default {
  fetch(request, env, ctx) {
    return appFor(env, ctx).fetch(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
