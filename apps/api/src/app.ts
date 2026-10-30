import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { cors } from 'hono/cors';
import {
  AirQuality,
  ClimateProfile,
  ClimateProjection,
  Elevation,
  Forecast,
  PlaceSearch,
  Problem,
  ProviderStatus,
  SolarClimatology,
} from '@plantpal/schemas';
import { ProviderError, type EnvClient } from '@plantpal/providers';
import { problem } from './lib/problem';
import type { RateLimiter } from './lib/rate-limit';
import type { StatusStore } from './lib/status-store';
import { registerAccountRoutes, type AccountsDeps } from './routes/accounts';

export interface AppDeps {
  env: EnvClient;
  status: StatusStore;
  limiter: RateLimiter;
  mode: 'live' | 'mock';
  allowedOrigins: readonly string[];
  traceId?: () => string;
  /** Accounts, sync and sharing (§14). Off when absent, so the env gateway runs on its own. */
  accounts?: Omit<AccountsDeps, 'limiter'>;
  /** Better Auth's handler for `/api/auth/*`. Absent when no auth secret is configured. */
  authHandler?: (req: Request) => Promise<Response>;
}

type Vars = { Variables: { traceId: string } };

const Coords = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lon: z.coerce.number().min(-180).max(180),
});

const problemResponses = {
  400: { description: 'Invalid request', content: { 'application/problem+json': { schema: Problem } } },
  429: { description: 'Rate limited', content: { 'application/problem+json': { schema: Problem } } },
  503: { description: 'Provider unavailable', content: { 'application/problem+json': { schema: Problem } } },
} as const;

const envRoute = <Q extends z.ZodObject, S extends z.ZodType>(
  path: string,
  summary: string,
  query: Q,
  schema: S,
) =>
  createRoute({
    method: 'get',
    path,
    summary,
    tags: ['environment'],
    request: { query },
    responses: {
      200: { description: 'Facts with provenance', content: { 'application/json': { schema } } },
      ...problemResponses,
    },
  });

const forecastRoute = envRoute(
  '/api/v1/env/forecast',
  'Current, hourly and 7-day forecast',
  Coords,
  Forecast,
);
const airRoute = envRoute('/api/v1/env/air', 'Current air quality and pollen', Coords, AirQuality);
const elevationRoute = envRoute('/api/v1/env/elevation', 'Elevation (90 m DEM)', Coords, Elevation);
const solarRoute = envRoute(
  '/api/v1/env/solar',
  'Monthly solar radiation climatology (NASA POWER)',
  Coords,
  SolarClimatology,
);
const climateRoute = envRoute(
  '/api/v1/env/climate',
  'Local climate profile: hardiness, frost dates, season length, heat days, normals (ERA5, last 10 years)',
  Coords,
  ClimateProfile,
);
const projectionRoute = envRoute(
  '/api/v1/env/projection',
  'Climate model change 2031–2050 vs 1991–2014, per model against its own baseline (CMIP6 HighResMIP)',
  Coords,
  ClimateProjection,
);
const placesRoute = envRoute(
  '/api/v1/env/places',
  'Place search',
  z.object({ q: z.string().trim().min(2).max(100), lang: z.enum(['en', 'hi', 'es']).default('en') }),
  PlaceSearch,
);
const statusRoute = createRoute({
  method: 'get',
  path: '/api/v1/status',
  summary: 'Service and provider health; works even when providers fail',
  tags: ['status'],
  responses: {
    200: {
      description: 'Status',
      content: {
        'application/json': {
          schema: z.object({
            ok: z.boolean(),
            time: z.string(),
            mode: z.enum(['live', 'mock']),
            providers: z.array(ProviderStatus),
          }),
        },
      },
    },
  },
});

/** Maps provider failures to RFC 9457 problems. */
function providerProblem(c: Parameters<typeof problem>[0], e: unknown): Response {
  if (e instanceof ProviderError) {
    if (e.code === 'RATE_LIMITED')
      return problem(c, 429, 'RATE_LIMITED', `${e.provider} is rate limited`, {
        retryAfterSeconds: Math.ceil((e.retryAfterMs ?? 60_000) / 1000),
      });
    return problem(c, 503, 'PROVIDER_UNAVAILABLE', `${e.provider}: ${e.code}`, {
      retryAfterSeconds: e.code === 'CIRCUIT_OPEN' ? 60 : 30,
    });
  }
  throw e;
}

export function createApp(deps: AppDeps) {
  const app = new OpenAPIHono<Vars>({
    defaultHook: (result, c) => {
      if (!result.success) {
        const issue = result.error.issues[0];
        return problem(
          c,
          400,
          'VALIDATION_FAILED',
          issue ? `${issue.path.join('.')}: ${issue.message}` : undefined,
        );
      }
      return undefined;
    },
  });

  app.use('*', async (c, next) => {
    c.set('traceId', deps.traceId?.() ?? crypto.randomUUID());
    await next();
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    c.header('Cache-Control', c.res.headers.get('Cache-Control') ?? 'no-store');
  });

  app.use(
    '/api/*',
    cors({
      origin: (origin) => (deps.allowedOrigins.includes(origin) ? origin : null),
      allowMethods: ['GET', 'POST', 'PATCH', 'DELETE'],
      credentials: true,
      maxAge: 600,
      exposeHeaders: ['RateLimit-Limit', 'RateLimit-Remaining', 'RateLimit-Reset', 'Retry-After'],
    }),
  );

  // Per-client token bucket on provider and sign-in routes; status stays reachable even when limited.
  const perClient: Parameters<typeof app.use>[1] = async (c, next) => {
    const client = c.req.header('cf-connecting-ip') ?? 'anonymous';
    const r = await deps.limiter.take(`ip:${client}`);
    c.header('RateLimit-Limit', String(r.limit));
    c.header('RateLimit-Remaining', String(Math.max(0, r.remaining)));
    c.header('RateLimit-Reset', String(Math.ceil(r.retryAfterMs / 1000)));
    if (!r.allowed)
      return problem(c, 429, 'RATE_LIMITED', 'Slow down a little', {
        retryAfterSeconds: Math.ceil(r.retryAfterMs / 1000),
      });
    await next();
  };
  app.use('/api/v1/env/*', perClient);
  app.use('/api/auth/*', perClient);

  // Passkey accounts (Better Auth). Without a configured secret, accounts are off and say so.
  app.on(['GET', 'POST'], '/api/auth/*', (c) =>
    deps.authHandler
      ? deps.authHandler(c.req.raw)
      : problem(c, 503, 'CONFIGURATION_REQUIRED', 'Accounts are not set up on this server'),
  );

  const send = <T>(c: Parameters<typeof problem>[0], value: T, maxAge: number) => {
    c.header('Cache-Control', `private, max-age=${maxAge}`);
    return c.json(value as never, 200);
  };

  app.openapi(forecastRoute, async (c) => {
    const { lat, lon } = c.req.valid('query');
    try {
      return send(c, await deps.env.forecast(lat, lon, c.req.raw.signal), 600);
    } catch (e) {
      return providerProblem(c, e) as never;
    }
  });
  app.openapi(airRoute, async (c) => {
    const { lat, lon } = c.req.valid('query');
    try {
      return send(c, await deps.env.air(lat, lon, c.req.raw.signal), 600);
    } catch (e) {
      return providerProblem(c, e) as never;
    }
  });
  app.openapi(elevationRoute, async (c) => {
    const { lat, lon } = c.req.valid('query');
    try {
      return send(c, await deps.env.elevation(lat, lon, c.req.raw.signal), 86_400);
    } catch (e) {
      return providerProblem(c, e) as never;
    }
  });
  app.openapi(solarRoute, async (c) => {
    const { lat, lon } = c.req.valid('query');
    try {
      return send(c, await deps.env.solarClimatology(lat, lon, c.req.raw.signal), 86_400);
    } catch (e) {
      return providerProblem(c, e) as never;
    }
  });
  app.openapi(climateRoute, async (c) => {
    const { lat, lon } = c.req.valid('query');
    try {
      return send(c, await deps.env.climateProfile(lat, lon, c.req.raw.signal), 7 * 86_400);
    } catch (e) {
      return providerProblem(c, e) as never;
    }
  });
  app.openapi(projectionRoute, async (c) => {
    const { lat, lon } = c.req.valid('query');
    try {
      return send(c, await deps.env.climateProjection(lat, lon, c.req.raw.signal), 30 * 86_400);
    } catch (e) {
      return providerProblem(c, e) as never;
    }
  });
  app.openapi(placesRoute, async (c) => {
    const { q, lang } = c.req.valid('query');
    try {
      return send(c, await deps.env.searchPlaces(q, lang, c.req.raw.signal), 3600);
    } catch (e) {
      return providerProblem(c, e) as never;
    }
  });

  app.openapi(statusRoute, async (c) => {
    let stored: Awaited<ReturnType<StatusStore['list']>> = [];
    try {
      stored = await deps.status.list();
    } catch {
      // The status page must work even when storage is unavailable.
    }
    const live = new Map(deps.env.status().map((s) => [s.provider, s]));
    const providers = [...live.values()].map((s) => {
      const st = stored.find((r) => r.provider === s.provider);
      return {
        ...s,
        enabled: st ? st.enabled && s.enabled : s.enabled,
        lastSuccessAt: s.lastSuccessAt ?? st?.lastSuccessAt ?? null,
        lastErrorAt: s.lastErrorAt ?? st?.lastErrorAt ?? null,
        lastErrorCode: s.lastErrorCode ?? st?.lastErrorCode ?? null,
        lastLatencyMs: s.lastLatencyMs ?? st?.lastLatencyMs ?? null,
        consecutiveFailures: Math.max(s.consecutiveFailures, st?.consecutiveFailures ?? 0),
      };
    });
    return c.json({ ok: true, time: new Date().toISOString(), mode: deps.mode, providers }, 200);
  });

  if (deps.accounts) registerAccountRoutes(app, { ...deps.accounts, limiter: deps.limiter });

  app.doc31('/api/v1/openapi.json', {
    openapi: '3.1.0',
    info: {
      title: 'PlantPal API',
      version: '1.0.0',
      description: 'Environmental facts with provenance, and sync and sharing for PlantPal gardens.',
    },
  });

  app.notFound((c) => problem(c, 404, 'NOT_FOUND'));
  app.onError((err, c) => {
    console.error(
      JSON.stringify({ level: 'error', traceId: c.get('traceId'), name: err.name, message: err.message }),
    );
    return problem(c, 500, 'PROVIDER_UNAVAILABLE', 'Unexpected error');
  });
  return app;
}
