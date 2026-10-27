# Traceability

Requirement → implementation → test → status. Test status uses `PASS` / `FAIL` / `NOT_RUN` with `mocked`, `local-emulated` or `live`.

## Legacy defects

| ID  | Defect                                                 | Implementation                                                                      | Test                                                                            | Status                   |
| --- | ------------------------------------------------------ | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------ |
| L01 | Developer key compiled into bundle                     | v4 has no AI key variable anywhere; `tools/scan-dist.mjs`                           | `pnpm check:dist` in CI                                                         | VERIFIED (local)         |
| L02 | Plaintext user key; missing vs quota conflated         |                                                                                     | `test/legacy` / package tests                                                   | PENDING                  |
| L03 | Model fallback chain; error taxonomy; no resume        |                                                                                     | `test/legacy` / package tests                                                   | PENDING                  |
| L04 | Markdown-parsed recommendations                        |                                                                                     | `test/legacy` / package tests                                                   | PENDING                  |
| L05 | Unvalidated health JSON                                |                                                                                     | `test/legacy` / package tests                                                   | PENDING                  |
| L06 | No deadlines on optional fetches                       |                                                                                     | `test/legacy` / package tests                                                   | PENDING                  |
| L07 | Cache never retries failed sources                     |                                                                                     | `test/legacy` / package tests                                                   | PENDING                  |
| L08 | Climate deltas/scenarios/range                         |                                                                                     | `test/legacy` / package tests                                                   | PENDING                  |
| L09 | Hardiness, frost dates, Köppen                         |                                                                                     | `test/legacy` / package tests                                                   | PENDING                  |
| L10 | GBIF radius/native/species conflation; empty invasives |                                                                                     | `test/legacy` / package tests                                                   | PENDING                  |
| L11 | Last hourly value as current; missing→0                |                                                                                     | `test/legacy` / package tests                                                   | PENDING                  |
| L12 | Hemisphere suffix                                      |                                                                                     | `test/legacy` / package tests                                                   | PENDING                  |
| L13 | Northern seasons; winter boundary; UTC streak          |                                                                                     | `test/legacy` / package tests                                                   | PENDING                  |
| L14 | Removed IDs block re-add; inflated counts              |                                                                                     | `test/legacy` / package tests                                                   | PENDING                  |
| L15 | Harvest unit sums; maturity from dateAdded             |                                                                                     | `test/legacy` / package tests                                                   | PENDING                  |
| L16 | Carbon divisor and unsourced constants                 |                                                                                     | `test/legacy` / package tests                                                   | PENDING                  |
| L17 | Native % flattening; substring matching                |                                                                                     | `test/legacy` / package tests                                                   | PENDING                  |
| L18 | Companion unknown as neutral; hemisphere; object keys  |                                                                                     | `test/legacy` / package tests                                                   | PENDING                  |
| L19 | Voice acknowledges without records                     |                                                                                     | `test/legacy` / package tests                                                   | PENDING                  |
| L20 | Async completion races                                 |                                                                                     | `test/legacy` / package tests                                                   | PENDING                  |
| L21 | Refinement loses inputs; 0 → 6                         |                                                                                     | `test/legacy` / package tests                                                   | PENDING                  |
| L22 | Fake image generation, CSS AR, screenshot mode         |                                                                                     | `test/legacy` / package tests                                                   | PENDING                  |
| L23 | Fabricated community data                              |                                                                                     | `test/legacy` / package tests                                                   | PENDING                  |
| L24 | Portfolio orphan IDs; uncapped score                   |                                                                                     | `test/legacy` / package tests                                                   | PENDING                  |
| L25 | Budget fixed currency/unvalidated                      |                                                                                     | `test/legacy` / package tests                                                   | PENDING                  |
| L26 | Dialog/tooltip/nested controls/tabs a11y               | Base UI primitives in `packages/ui` (focus trap, Escape, focus return, roving tabs) | axe on every route (`e2e/shell.spec.ts`); per-feature flows in later milestones | IMPLEMENTED_NOT_VERIFIED |
| L27 | Eager 849 kB bundle; runtime CDN                       | Route-level code splitting, compiled Tailwind, self-hosted fonts                    | `pnpm check:bundle` (initial 121 kB gzip)                                       | VERIFIED (local)         |
| L28 | No lint/tests/CI/LICENSE                               | ESLint, Prettier, Vitest, Playwright, `.github/workflows/ci.yml`, `LICENSE`         | `pnpm run ci`                                                                   | VERIFIED (local)         |
| L29 | Gamification inconsistencies                           |                                                                                     | `test/legacy` / package tests                                                   | PENDING                  |
| L30 | AI slug identity                                       |                                                                                     | `test/legacy` / package tests                                                   | PENDING                  |

## Features and workflows

| Requirement                    | Implementation | Test | Status  |
| ------------------------------ | -------------- | ---- | ------- |
| W1 First run → first plan      |                |      | PENDING |
| W2 Connect Gemini              |                |      | PENDING |
| W3 Daily care loop             |                |      | PENDING |
| W4 Add a plant                 |                |      | PENDING |
| W5 Health case                 |                |      | PENDING |
| W6 Design a space              |                |      | PENDING |
| W7 Nature visit                |                |      | PENDING |
| W8 Harvest → pantry → exchange |                |      | PENDING |
| W9 Shared garden               |                |      | PENDING |
| W10 Offline and conflict       |                |      | PENDING |
| W11 Legacy migration           |                |      | PENDING |
| W12 Export, import, delete     |                |      | PENDING |

## Science rules

| Rule | Enforced in | Test | Status  |
| ---- | ----------- | ---- | ------- |
| S1   |             |      | PENDING |
| S2   |             |      | PENDING |
| S3   |             |      | PENDING |
| S4   |             |      | PENDING |
| S5   |             |      | PENDING |
| S6   |             |      | PENDING |
| S7   |             |      | PENDING |
| S8   |             |      | PENDING |
| S9   |             |      | PENDING |
| S10  |             |      | PENDING |
| S11  |             |      | PENDING |
| S12  |             |      | PENDING |
| S13  |             |      | PENDING |
| S14  |             |      | PENDING |
| S15  |             |      | PENDING |
| S16  |             |      | PENDING |
| S17  |             |      | PENDING |
| S18  |             |      | PENDING |
