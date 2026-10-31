# PlantPal v4 "Living Field Guide": final report (§25.2)

Date: 2026-10-30 · Merged into `main` through PR #1. Build status: **not yet `PILOT_READY`**; nothing is deployed.

## 1. Delivered and verified

All thirteen milestones (M0–M12) are implemented. Evidence, run locally and in GitHub Actions on every push:

| Check                                                   | Result                                                | Kind                                                            |
| ------------------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------- |
| Unit and component tests (`pnpm test`)                  | 587 pass                                              | Local; providers and AI replayed from fixtures                  |
| End-to-end (`pnpm e2e`, Pixel 7 + desktop)              | 143 pass, 9 skipped by design                         | Local browser; providers and Gemini mocked; real API in-process |
| Worker smoke (`pnpm --filter @plantpal/api smoke`)      | All checks pass                                       | Local Workers runtime (workerd) with local D1                   |
| AI eval gate (`pnpm eval`)                              | 175 cases pass, 0 prohibited claims, 0 ungrounded ids | Replayed synthetic responses                                    |
| Catalogue (`pnpm check:catalog`)                        | 73 taxa, every fact with unit, evidence and source    | Local                                                           |
| Bundle, secrets, headers, quota, fabricated data, audit | All pass                                              | Local and CI                                                    |
| CodeQL                                                  | Clean                                                 | CI                                                              |

**Not run live** (the build sandbox cannot reach these): Gemini, Open-Meteo, NASA POWER, GBIF, iNaturalist, Wikimedia, Overpass, OpenFreeMap, browser push services. **Not run by a person:** a screen-reader review.

## 2. Design and architecture as built

- **Screens:** 58 route files across Today, Garden, Plan, Nature, Community, Settings, Copilot, lessons and moderation. Screenshots and a GIF are in the README (`docs/screenshots/`).
- **Shape:** a local-first React PWA (IndexedDB, service worker) that works without an account; an optional Cloudflare Worker (Hono, D1, Durable Objects) for sync, sharing, push, community and the green-space lookup; AI from the browser with the person's own Gemini key. Diagram in the README.
- **Decision records:** ADR-0001 architecture · 0002 versions · 0003 provider modes · 0004 i18n · 0005 local store · 0006 API gateway · 0007 plan engine · 0008 care engine · 0009 AI platform · 0010 health and identification · 0011 space designer · 0012 nature, harvest and impact · 0013 accounts, sync and sharing · 0014 community, exchange and maps · 0015 Garden Copilot · 0016 stamps, lessons, story and labels · 0017 Garden Walk.

## 3. Migration from v3

The guided migration finds v3 data in the browser, previews it, saves a backup file first, and imports gardens, plants, journal, care, harvests, plans and achievements. Each record is accounted for (migrated, merged or reported), XP and badges are kept read-only, and the old plaintext key moves into the encrypted vault only with consent. Evidence: `packages/domain/test/legacy.test.ts`, `e2e/data.spec.ts` (W11). Thirty v3 defects are traced in `docs/traceability.md`; all but the companion-planting and voice items are verified or removed.

## 4. Feature status

From `docs/scope-ledger.md` (41 capabilities): 24 verified, 7 implemented but not fully verified, 4 pending, 1 blocked, 1 deferred and 4 rejected by design; several verified rows note parts still open. Open items in short:

- **Partial:** Sun Hours phone horizon scan; rain-harvest planner screen; pushed weather alerts and official warning feeds; live climate data; recipes and avoided-emission ranges; pushed care reminders; seasonal moments and a children's mode.
- **Pending:** AI photo mock-up (needs a cost display), on-device bird sound ID, iNaturalist upload, sensor import.
- **Blocked or deferred on owner decisions:** Garden Walk voice and Pl@ntNet (both need the key outside the header).

## 5. Run, test and deploy

```sh
pnpm install
pnpm dev                     # web app, no key or account needed
pnpm run ci                  # everything CI runs
pnpm --filter @plantpal/web build && pnpm e2e
pnpm --filter @plantpal/api smoke
```

Deploying follows `docs/runbooks/deploy.md`. Secrets the owner adds with `wrangler secret put`: `BETTER_AUTH_SECRET` (accounts), `VAPID_PRIVATE_KEY` (push, with `VAPID_PUBLIC_KEY` in vars), and later `TURNSTILE_SECRET_KEY`. Set `PROVIDERS = "live"`, `PUBLIC_ORIGIN` and `ALLOWED_ORIGINS` for production.

## 6. Providers, models and the quota envelope

- Providers, licences, attribution, cache times and test status: `docs/providers/README.md` and `packages/providers/src/core/registry.ts`. Limits were researched in October 2026 and must be re-verified before launch.
- Models are discovered per key at runtime; nothing is hard-coded (ADR-0009, `docs/runbooks/model-retirement.md`).
- Quota (`pnpm check:quota`, CI): for 1,000 daily active users the default deployment uses about 20% of Workers requests, 15% of D1 writes and 25% of Durable Object requests per day. Browsers call weather providers directly, so Open-Meteo limits apply per household. Opt-in gateway mode would use about 185% of Open-Meteo's free limit in the worst case and needs longer cache times first.

## 7. Limitations, risks and approvals

- **Release gates open:** manual screen-reader review (gate 7); mobile LCP 4.0–5.9 s against a 2.5 s budget (gate 8). Details in `docs/release-gates.md` and `docs/perf.md`.
- **Before any community launch:** adopt `docs/community-policy.md`, name a moderator, build account deletion and the removed-content purge.
- **Drafts the owner completes:** `docs/privacy.md`, `docs/community-policy.md`.
- **Data quality:** catalogue trait values and flowering months are drafts awaiting a curator; lesson wording needs review.
- **Approvals needed (O3):** public deployment, domain, paid plans, real-user email, the Turnstile script, and the key-handling decisions above.

## 8. What PlantPal does not claim

PlantPal does not diagnose plant problems with certainty; health triage gives likelihoods and next steps. It does not certify that a plant is safe or edible, or that a balcony or roof can bear a load. It does not guarantee ecological outcomes: impact rows say what was measured, counted or estimated, and carbon is not given a number. It does not offer unlimited free capacity: limits are declared and checked. It does not guarantee that reminders arrive; the in-app list never depends on push.
