# RUN-STATE

Authoritative run manifest for the PlantPal v4 upgrade (see `docs/PlantPal-Master-Prompt-v4.md`). Reload this file, the ADRs and the current code after any context reset. A summary is not proof that something was validated.

## Manifest
| Field | Value |
|---|---|
| Run id | v4-upgrade-2026-10-27 |
| Mode | IMPLEMENT |
| Base commit | `423d4a0` (master prompt v4 added on top of `99071d4`, the last legacy app commit) |
| Branch | session branch `claude/exciting-albattani-7ph93y`; milestones are separate commits on this branch (see ADR-0001 §Delivery) |
| Owner approvals held | None beyond implementing in the repository. **No** public deploy, paid plan, domain, real-user email, or third-party posting is approved. |

## Environment capabilities (this build sandbox)
| Capability | Status |
|---|---|
| Node / pnpm | Node 22.22, pnpm 10.28 |
| npm registry | Reachable |
| Chromium for Playwright | Preinstalled (`/opt/pw-browsers`, Playwright 1.63) |
| Environmental providers (Open-Meteo, GBIF, iNaturalist, NASA POWER, Wikimedia, Overpass, OpenFreeMap) | **Blocked** by sandbox egress policy. All provider tests use recorded fixtures (`mocked`). Live verification `NOT_RUN`. |
| Gemini API | **Blocked** (403 from egress proxy). AI tests use recorded responses. Live evaluation `NOT_RUN`. |
| Cloudflare / Vercel deploys | Not approved. Vercel builds previews automatically from pushes (owner's existing integration). |

## Baseline (legacy app at `99071d4`)
- `npm ci --ignore-scripts` → 216 packages; `vite build` passes; `tsc --noEmit` passes.
- Bundle: `index` 848.97 kB min / 208.77 kB gzip; `xlsx` 283.10 kB / 95.10 kB; `vendor` 11.87 kB.
- No real key pattern (`AIza` + 35 chars) in `dist/` because no `.env` was set; the `define` mechanism in `vite.config.ts` would embed one if configured (L01).
- Lint cannot run (no ESLint dependency or config); there is no test script (L28).
- Defect reproductions for L13, L14, streak date, coordinate parsing and cache refresh exist in the supplied evidence package (`verify.cjs`); the remaining defects are documented by source inspection in the Repository Intelligence Report. New regression tests live in the rebuilt code under the same IDs (`docs/traceability.md`).

## Milestones
| # | Status | Notes |
|---|---|---|
| M0 | DONE | Baseline recorded; LICENSE and community files; ADR-0001/0003; scope ledger; traceability; CodeQL + Dependabot; L01 fixed in the legacy config (key `define`s forced to `undefined`). Lint/test toolchain lands with the monorepo in M1. |
| M1–M12 | PENDING | |

## Open blockers and decisions
- Live provider and Gemini verification require a network-enabled environment and the owner's own Gemini key (`pnpm eval:live`).
- WCVP bulk import (`tools/wcvp-import`) is implemented against fixtures; running it needs the Kew download and licence confirmation.
