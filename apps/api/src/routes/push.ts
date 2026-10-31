import { createRoute, z, type OpenAPIHono } from '@hono/zod-openapi';
import { Problem } from '@plantpal/schemas';
import { problem } from '../lib/problem';
import type { PushStore } from '../lib/push-store';
import type { RateLimiter } from '../lib/rate-limit';
import { b64urlDecode, isPushEndpoint, sendPush, type Vapid } from '../lib/webpush';
import type { Authenticator } from './accounts';

export interface PushDeps {
  auth: Authenticator;
  store: PushStore;
  /** Null until VAPID keys are configured; push routes then say so. */
  vapid: Vapid | null;
  limiter: RateLimiter;
  fetch?: typeof fetch;
  now?: () => number;
}

type Vars = { Variables: { traceId: string } };

const problems = (...codes: Array<400 | 401 | 429 | 503>) =>
  Object.fromEntries(
    codes.map((s) => [
      s,
      { description: 'Problem', content: { 'application/problem+json': { schema: Problem } } },
    ]),
  );
const json = <S extends z.ZodType>(schema: S, description = 'OK') => ({
  description,
  content: { 'application/json': { schema } },
});
const B64URL = z.string().regex(/^[A-Za-z0-9_-]+$/);
const Subscription = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({ p256dh: B64URL.max(100), auth: B64URL.max(40) }),
});

const keyRoute = createRoute({
  method: 'get',
  path: '/api/v1/push/key',
  summary: 'The VAPID public key browsers subscribe with',
  tags: ['push'],
  responses: { 200: json(z.object({ publicKey: z.string() })), ...problems(503) },
});
const subscribeRoute = createRoute({
  method: 'post',
  path: '/api/v1/push/subscriptions',
  summary: 'Save this browser’s push subscription',
  tags: ['push'],
  request: { body: { content: { 'application/json': { schema: Subscription } }, required: true } },
  responses: { 201: json(z.object({ id: z.string() }), 'Saved'), ...problems(400, 401, 503) },
});
const unsubscribeRoute = createRoute({
  method: 'delete',
  path: '/api/v1/push/subscriptions',
  summary: 'Forget this browser’s push subscription',
  tags: ['push'],
  request: {
    body: {
      content: { 'application/json': { schema: z.object({ endpoint: z.string().url().max(1000) }) } },
      required: true,
    },
  },
  responses: { 204: { description: 'Removed' }, ...problems(400, 401) },
});
const testRoute = createRoute({
  method: 'post',
  path: '/api/v1/push/test',
  summary: 'Send a test notification to my devices',
  tags: ['push'],
  responses: {
    200: json(z.object({ sent: z.number(), removed: z.number(), failed: z.number() })),
    ...problems(401, 429, 503),
  },
});

/** Web Push (§21): opt-in per device; the in-app due list never depends on it. */
export function registerPushRoutes(app: OpenAPIHono<Vars>, deps: PushDeps) {
  const now = () => deps.now?.() ?? Date.now();
  const off = (c: Parameters<typeof problem>[0]) =>
    problem(c, 503, 'CONFIGURATION_REQUIRED', 'Notifications are not set up on this server');

  app.openapi(keyRoute, async (c) => {
    if (!deps.vapid) return off(c) as never;
    return c.json({ publicKey: deps.vapid.publicKey }, 200);
  });

  app.openapi(subscribeRoute, async (c) => {
    const u = await deps.auth.userOf(c.req.raw);
    if (!u) return problem(c, 401, 'UNAUTHENTICATED') as never;
    if (!deps.vapid) return off(c) as never;
    const { endpoint, keys } = c.req.valid('json');
    if (!isPushEndpoint(endpoint))
      return problem(c, 400, 'VALIDATION_FAILED', 'Not a known browser push service') as never;
    if (b64urlDecode(keys.p256dh).length !== 65 || b64urlDecode(keys.auth).length !== 16)
      return problem(c, 400, 'VALIDATION_FAILED', 'Invalid subscription keys') as never;
    const id = await deps.store.upsert(u.id, { endpoint, ...keys }, now());
    return c.json({ id }, 201);
  });

  app.openapi(unsubscribeRoute, async (c) => {
    const u = await deps.auth.userOf(c.req.raw);
    if (!u) return problem(c, 401, 'UNAUTHENTICATED') as never;
    await deps.store.remove(u.id, c.req.valid('json').endpoint);
    return c.body(null, 204);
  });

  app.openapi(testRoute, async (c) => {
    const u = await deps.auth.userOf(c.req.raw);
    if (!u) return problem(c, 401, 'UNAUTHENTICATED') as never;
    if (!deps.vapid) return off(c) as never;
    const r = await deps.limiter.take(`push-test:${u.id}`);
    if (!r.allowed)
      return problem(c, 429, 'RATE_LIMITED', 'Slow down a little', {
        retryAfterSeconds: Math.ceil(r.retryAfterMs / 1000),
      }) as never;
    const out = { sent: 0, removed: 0, failed: 0 };
    for (const sub of await deps.store.ofUser(u.id)) {
      const result = await sendPush(
        sub,
        {
          title: 'PlantPal',
          body: 'Notifications work on this device.',
          url: '/settings/account',
          tag: 'plantpal-test',
        },
        deps.vapid,
        { fetch: deps.fetch, ttlSeconds: 600, now: now() },
      ).catch(() => 'failed' as const);
      if (result === 'sent') {
        out.sent++;
        await deps.store.sent(sub.id, now());
      } else if (result === 'gone') {
        out.removed++;
        await deps.store.drop(sub.id);
      } else {
        out.failed++;
        await deps.store.failed(sub.id);
      }
    }
    return c.json(out, 200);
  });
}
