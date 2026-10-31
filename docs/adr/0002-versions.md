# ADR-0002: Pinned toolchain and library versions

- Status: Accepted
- Date: 2026-10-27

Versions installed and verified in the build sandbox for the v4 upgrade (lockfile `pnpm-lock.yaml` is authoritative).

| Package                   | Version  |
| ------------------------- | -------- |
| `react`                   | 19.3.1   |
| `react-dom`               | 19.3.1   |
| `vite`                    | 8.3.5    |
| `@vitejs/plugin-react`    | 6.1.2    |
| `typescript`              | 6.0.3    |
| `@tanstack/react-router`  | 1.170.46 |
| `@tanstack/router-plugin` | 1.168.48 |
| `@tanstack/react-query`   | 5.105.0  |
| `tailwindcss`             | 4.3.3    |
| `@tailwindcss/vite`       | 4.3.3    |
| `@base-ui/react`          | 1.9.0    |
| `motion`                  | 14.6.0   |
| `zod`                     | 4.6.7    |
| `dexie`                   | 4.4.7    |
| `zustand`                 | 5.0.16   |
| `sonner`                  | 2.0.8    |
| `cmdk`                    | 1.1.1    |
| `lucide-react`            | 1.62.0   |
| `vite-plugin-pwa`         | 2.0.0    |
| `workbox-precaching`      | 7.4.1    |
| `hono`                    | 4.13.14  |
| `drizzle-orm`             | 0.45.4   |
| `wrangler`                | 4.153.0  |
| `@google/genai`           | 2.31.0   |
| `temporal-polyfill`       | 1.0.6    |
| `vitest`                  | 5.0.5    |
| `@playwright/test`        | 1.63.0   |
| `eslint`                  | 9.39.5   |
| `typescript-eslint`       | 8.72.1   |
| `prettier`                | 3.9.10   |
| `turbo`                   | 2.11.10  |
| `happy-dom`               | 21.0.4   |
| `fake-indexeddb`          | 6.2.6    |
| `fast-check`              | 4.10.2   |
| `axe-core`                | 4.14.0   |
| `maplibre-gl`             | 6.14.0   |
| `h3-js`                   | 4.2.1    |

## Notes

- **TypeScript 6.0**, not 7.0: `typescript-eslint` 8.72 supports TypeScript `< 6.1`.
- **ESLint 9**, not 10: `eslint-plugin-jsx-a11y` 6.10 declares ESLint ≤ 9.
- **Playwright 1.63** matches the preinstalled Chromium build in the sandbox and CI installs its own browser.
- **Base UI** is published as `@base-ui/react` (the old `@base-ui-components/react` name is retired).
- Node 22 LTS and pnpm 10.28 (`packageManager` field).
