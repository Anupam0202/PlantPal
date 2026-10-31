# Performance (§22)

Lab runs on 2026-10-30 against the production build (`vite preview`, same headers as production), Lighthouse 12, mobile form factor with simulated throttling (Moto G Power class device, slow 4G: 150 ms RTT, 1.6 Mbps, 4× CPU slowdown). Each route was run once; treat single runs as indicative.

| Route     | Performance | Accessibility | Best practices | LCP   | CLS | TBT   | First visit transfer |
| --------- | ----------- | ------------- | -------------- | ----- | --- | ----- | -------------------- |
| `/today`  | 68          | 100           | 100            | 5.9 s | 0   | 50 ms | 686 KiB              |
| `/plan`   | 70          | 100           | 100            | 5.5 s | 0   | 30 ms | 646 KiB              |
| `/garden` | 75          | 100           | 100            | 4.7 s | 0   | 10 ms | 512 KiB              |
| `/nature` | 80          | 100           | 100            | 4.0 s | 0   | 0 ms  | 439 KiB              |

## Against the budgets

| Budget (§22.1)                                                | Status                                                                   |
| ------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Initial JS ≤ 170 kB gzip                                      | **Met:** 156 kB (`pnpm check:bundle` in CI)                              |
| Each lazy route ≤ 120 kB gzip; map, PDF and AI code on demand | **Met.** MapLibre has its own 300 kB ceiling (ADR-0014); labels PDF 5 kB |
| CLS ≤ 0.1                                                     | **Met:** 0 on every route                                                |
| INP ≤ 200 ms                                                  | Lab proxy (TBT) is 0–50 ms; field INP not measured                       |
| Accessibility 100, Best practices ≥ 95                        | **Met**                                                                  |
| LCP ≤ 2.5 s, Performance ≥ 90 on throttled mobile             | **Not met:** LCP 4.0–5.9 s, Performance 68–80                            |

## Why LCP is slow, and the plan

PlantPal is a client-rendered app: nothing paints until the JavaScript has downloaded and run, and on the slow-4G profile about 450–690 KiB takes 3–4 s to arrive. Already done: route splitting, on-demand maps, PDF and AI code, and a smaller display font (the Fraunces file with only the weight and softness axes saved about 58 KiB and 0.4 s of LCP on `/today`).

Next steps, largest effect first:

1. **Pre-render the app shell and each top-level page's static frame at build time**, so the first paint does not wait for JavaScript.
2. **Move form and overlay components out of the initial chunk**: Lighthouse reports about 30 KiB of form code unused on `/today`.
3. **Subset the fonts** to the characters in use per language and preload the body font.
4. **Wire Lighthouse CI** on these four routes once the first step lands, so regressions fail the build (§22.1). It is not in CI yet because the current numbers would fail it.

## Page weight

- **First visit to Today:** 686 KiB (fonts about 120 KiB, JavaScript about 520 KiB, CSS 15 KiB).
- **A typical later day:** the service worker serves the app from its cache, so only data moves: weather and climate facts (a few KiB, cached for an hour or more) and, when signed in, sync pages of at most 100 changes.

## Reproduce

```sh
pnpm --filter @plantpal/web build
cd apps/web && pnpm exec vite preview --port 4199 &
npx lighthouse@12 http://127.0.0.1:4199/today --form-factor=mobile --throttling-method=simulate \
  --only-categories=performance,accessibility,best-practices
```
