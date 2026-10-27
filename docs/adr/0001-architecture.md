# ADR-0001: Architecture for PlantPal v4

- Status: Accepted
- Date: 2026-10-27

## Context
The legacy app is a client-only React SPA with localStorage persistence, a compiled-in AI key path and no backend. The master prompt (v4) defines a local-first PWA with a zero-cost edge backend and a bring-your-own-key AI layer.

## Decision
- **Monorepo:** pnpm workspaces + Turborepo. `apps/web` (React 19 + Vite 8 PWA), `apps/api` (Cloudflare Worker with Hono), `packages/{domain,schemas,providers,ai,catalog,ui,db,sync}`.
- **Packages ship TypeScript source** (`exports` → `src/index.ts`); Vite, Wrangler and Vitest compile them. No per-package build step.
- **Local-first:** Dexie (IndexedDB) is the device store and outbox. The server (D1) is the single authority once an account syncs.
- **Backend:** Workers + Hono + D1/Drizzle + R2 + KV + Durable Objects + Queues + Cron, Better Auth. Postgres remains an escape hatch behind repository interfaces.
- **AI:** browser-only calls with the user's key from an encrypted vault (`packages/ai`). No server ever holds a Gemini key.

## Deviations from the master prompt (recorded honestly)
1. **Component documentation:** an in-app component gallery route (`/dev/ui`, excluded from production navigation) plus automated axe and interaction tests replace Storybook for now, to avoid a heavy toolchain that is not yet verified against Vite 8. Storybook can be added later without code changes to components.
2. **i18n messages** live in `apps/web/messages` (Paraglide compiles them into the web app) instead of a separate `packages/i18n`.
3. **Shared configuration** (TypeScript, ESLint, Prettier) lives at the repository root instead of `packages/config`.
4. **Provider modes:** see ADR-0003. The browser may call CORS-enabled public providers directly when no API gateway is configured (static hosting).
5. **Delivery:** the build session is constrained to one branch, so milestones land as separate Conventional Commits on that branch and one pull request instead of one PR per milestone.
6. **Tool versions:** TypeScript 6.0 (typescript-eslint supports < 6.1) and ESLint 9 (eslint-plugin-jsx-a11y supports ≤ 9). See ADR-0002.

## Consequences
- One install, one lint and one test command across the repo.
- The web app works without the API (guest, local-first, direct providers). Accounts, sync and community need the Worker.
