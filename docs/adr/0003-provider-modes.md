# ADR-0003: Provider access modes (gateway and direct)

- Status: Accepted
- Date: 2026-10-27

## Context

The master prompt routes all environmental calls through the API gateway for shared caching, quota control and privacy. The owner's current hosting (Vercel) serves static builds only, so previews would have no environmental data without the Worker.

## Decision

`packages/providers` is runtime-agnostic. The web app chooses a mode at start-up:

- **gateway** (default when `VITE_API_BASE_URL` is set): the browser calls `/api/v1/env/*`; the Worker calls providers, caches, rate-limits and records status.
- **direct** (when no gateway is configured): the browser calls the same adapters against CORS-enabled public providers (Open-Meteo, GBIF, iNaturalist, Wikipedia). Coordinates are rounded to the provider grid before sending, deadlines and backoff still apply, results are cached in IndexedDB, and Settings › Data states that requests go straight to those providers.
- **mock** (`VITE_PROVIDERS=mock` or the test environment): recorded fixtures, always labelled "Demo data" in the UI.

## Consequences

- Static previews remain useful and honest.
- CSP `connect-src` must list the direct-mode hosts.
- Quota accounting is per-browser in direct mode; the shared-cache envelope (§15.5) applies only to gateway mode.
