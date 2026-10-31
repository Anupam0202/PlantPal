# ADR-0006: API gateway on Cloudflare Workers

- Status: Accepted
- Date: 2026-10-28

## Context

Environmental data must come with provenance, deadlines, caching, quota control and attribution (§15), at zero recurring cost, and the static web build must stay useful without a server (ADR-0003).

## Decisions

1. **One shared client** (`packages/providers` `EnvClient`) runs in both the Worker (gateway mode) and the browser (direct and demo modes). It rounds coordinates per provider grid, applies a total deadline per call (forecast 4 s, others 6–8 s), retries only retryable failures with jittered backoff or a short `Retry-After`, opens a circuit after 4 consecutive failures, rate-limits per provider with a token bucket, coalesces identical in-flight requests, honours kill switches, and caches with stale-while-revalidate. **Failures are never cached**; a stale copy within its maximum age is served and marked stale on every fact.
2. **Worker:** Hono with `@hono/zod-openapi`. Every query is validated; responses are the shared Zod schemas; OpenAPI 3.1 is published at `/api/v1/openapi.json`. Errors are RFC 9457 `application/problem+json` with stable codes and a trace id. Per-client token buckets live in a SQLite-backed **Durable Object** (`Limiter`) and set `RateLimit-*` headers. Provider facts are cached in per-isolate memory plus the **Cache API** (no KV write budget used). Provider health and kill switches are stored in **D1** (`provider_status`, Drizzle). `/api/v1/status` works even when D1 or providers fail.
3. The same Worker serves the built web app through **Workers Static Assets**, with `/api/*` routed to the Worker first; `public/_headers` is generated from `vercel.json` (`tools/sync-headers.mjs`, checked in CI) so both hosts send the same CSP. Source maps are excluded by `.assetsignore`.
4. **Heavy climate work** (30-year normals, CMIP6 deltas) has adapters and domain logic now; it moves to Queue jobs per coarse cell for Climate Fit.
5. **Testing:** routes are tested in Node through `app.request()` with in-memory stores; the D1 store runs against Node's built-in SQLite through a small D1 shim using the real migration SQL; `pnpm --filter @plantpal/api smoke` starts the Worker in the local Workers runtime (workerd via `wrangler dev`, mock providers) and checks status, facts, rate-limit headers, problem responses, OpenAPI and static assets. `@cloudflare/vitest-pool-workers` was not used because it does not support Vitest 5 yet.

## Consequences

- Deploying needs the owner's Cloudflare account (`wrangler login`, `wrangler d1 create plantpal`, real `database_id`) and explicit approval; nothing deploys automatically.
- In direct mode, quota accounting is per browser and the shared-cache envelope (§15.5) does not apply.
