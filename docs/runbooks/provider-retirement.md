# Retire or replace a data provider

Used when a provider shuts down, changes terms, or starts failing for good (for example SoilGrids REST was paused, so it is not used; OpenFarm shut down in 2025).

1. Switch it off at once: add its id to `DISABLED_PROVIDERS` and deploy. Cached facts are served while within their maximum age and are marked stale; after that the app shows manual inputs.
2. Record the change in `docs/providers/README.md` and in the scope ledger.
3. For a replacement: add an adapter under `packages/providers/src/<provider>/` with a parser, a fixture marked as demo data and tests; register it in `core/registry.ts` with licence, attribution, TTL and maximum stale age; add its host to the CSP `connect-src` in `vercel.json` if browsers call it (then `pnpm check:headers`).
4. Run `pnpm check:quota` with its limits and `pnpm --filter @plantpal/api smoke`.
5. Remove the old adapter only after one release with the new one live.
