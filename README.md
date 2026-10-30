<div align="center">

# 🌿 PlantPal

### A living field guide for the space you actually have

[![CI](https://github.com/Anupam0202/PlantPal/actions/workflows/ci.yml/badge.svg)](https://github.com/Anupam0202/PlantPal/actions/workflows/ci.yml)
[![CodeQL](https://github.com/Anupam0202/PlantPal/actions/workflows/codeql.yml/badge.svg)](https://github.com/Anupam0202/PlantPal/actions/workflows/codeql.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-2f6b3a.svg)](LICENSE)

_Grow the right plants for your balcony, yard or rooftop, keep them alive through heat, drought and frost, and measure what your space gives back to nature — using free, open environmental data and your own Gemini key._

</div>

---

## Why PlantPal

Most plant apps guess. PlantPal shows its working:

- **Evidence first.** Every fact carries its source, date and evidence grade (measured, modelled, catalogue, AI-suggested…). Nothing is presented as more certain than it is.
- **Local-first.** Your garden lives on your device and works offline. An account is optional and only needed to sync or share.
- **Bring your own key.** AI features use _your_ Gemini API key. It is encrypted on your device and sent only to Google — never to PlantPal servers. Everything that does not need AI works without a key.
- **For the environment.** Native and pollinator-friendly choices, invasive-species warnings, water-wise care and an honest impact ledger.

## Status

PlantPal is being rebuilt as v4 ("Living Field Guide") milestone by milestone. See [`RUN-STATE.md`](RUN-STATE.md) for the live tracker and [`docs/PlantPal-Master-Prompt-v4.md`](docs/PlantPal-Master-Prompt-v4.md) for the full specification.

| Milestone | What it delivers                                                                                       | State |
| --------- | ------------------------------------------------------------------------------------------------------ | ----- |
| M0        | Safety net: licence, community files, CodeQL, Dependabot, decision records                             | Done  |
| M1        | Monorepo, design system, accessible app shell, PWA, strict CSP, CI                                     | Done  |
| M2        | Local-first garden data, journal, photos, export/import, migration from v3                             | Done  |
| M3        | Environmental data with provenance, API Worker, Living Sky, location                                   | Done  |
| M4        | Plant catalogue, Sun Hours Finder, eligibility engine, Seed onboarding, plans                          | Done  |
| M5        | Care schedules, Today cockpit, Water-Wise checks, frost and heat alerts, Climate Fit                   | Done  |
| M6        | AI with your own Gemini key: vault, model discovery, explanations, quick capture                       | Done  |
| M7        | Plant health cases, photo identification, species pages and cited species drafts                       | Done  |
| M8        | Space designer: plans to scale, checks, sun and shade, growth, versions, exports                       | Done  |
| M9        | Nature log and timed counts, Bloom Bridge, native and invasive lens, harvest and pantry, impact ledger | Done  |
| M10       | Optional passkey accounts, sync, shared gardens and roles, plant-sitter links, live updates, Web Push  | Done  |
| M11       | Seed library and lineage; community, Seed & Cutting Exchange and moderation (off by default); maps     | Done  |
| M12       | Garden Copilot, voice, story, learning paths, release hardening                                        | Next  |

The previous single-file app (v3) has been retired; its known problems are tracked in [`docs/traceability.md`](docs/traceability.md).

## Tech stack

| Area    | Choice                                                                                                                    |
| ------- | ------------------------------------------------------------------------------------------------------------------------- |
| Web app | React 19, Vite 8, TanStack Router + Query, Zustand, Tailwind CSS 4, Base UI, Motion                                       |
| Offline | Installable PWA (Workbox), IndexedDB via Dexie                                                                            |
| API     | Cloudflare Workers + Hono, D1 (Drizzle), R2, Durable Objects (free tier)                                                  |
| AI      | Google Gemini via `@google/genai`, with the user's own key and runtime model discovery                                    |
| Data    | Open-Meteo, NASA POWER, GBIF, iNaturalist, Wikipedia/Wikidata, OpenStreetMap (Overpass), OpenFreeMap — free, no paid tier |
| Maps    | MapLibre GL with OpenFreeMap tiles and H3 hexagons, loaded only on map pages                                              |
| Quality | TypeScript (strict), ESLint, Prettier, Vitest, Playwright + axe (WCAG 2.2 AA)                                             |

Pinned versions are recorded in [`docs/adr/0002-versions.md`](docs/adr/0002-versions.md).

## Getting started

### Prerequisites

- Node.js 22 or newer
- pnpm 10 (`corepack enable` picks up the version from `package.json`)

### Run it

```bash
git clone https://github.com/Anupam0202/PlantPal.git
cd PlantPal
pnpm install
pnpm dev          # web app on http://localhost:5173
```

No `.env` file and no API key are needed to run the app. Weather and place data come from free public services (Open-Meteo, NASA POWER); without internet access use demo data with `VITE_PROVIDERS=mock pnpm dev`. To route requests through the API Worker instead, run `pnpm dev:api` and set `VITE_API_BASE_URL=http://127.0.0.1:8787`. When AI features arrive, you add your Gemini key inside the app under **Settings → AI**; get one free at [Google AI Studio](https://aistudio.google.com/app/apikey).

### Accounts, sync and push (optional)

The app works fully without them. To try accounts locally, run the Worker with a secret (see [`docs/demo/M10.md`](docs/demo/M10.md)):

```sh
cd apps/api && echo "BETTER_AUTH_SECRET=$(openssl rand -hex 32)" > .dev.vars
pnpm exec wrangler d1 migrations apply plantpal --local && pnpm exec wrangler dev
```

Open `http://localhost:8787` (passkeys need a domain such as `localhost`, not an IP address). `pnpm --filter @plantpal/api vapid:keys` makes Web Push keys.

The community (feed, events, Seed & Cutting Exchange, moderation) is **off by default**. It may be switched on for a public deployment only after the owner adopts [`docs/community-policy.md`](docs/community-policy.md) and names a moderator; to try it locally see [`docs/demo/M11.md`](docs/demo/M11.md).

### Useful scripts

| Command          | What it does                                                                  |
| ---------------- | ----------------------------------------------------------------------------- |
| `pnpm dev`       | Start the web app with hot reload                                             |
| `pnpm build`     | Production build of every package                                             |
| `pnpm test`      | Unit and component tests (Vitest)                                             |
| `pnpm e2e`       | End-to-end and accessibility tests (Playwright; run `pnpm build` first)       |
| `pnpm lint`      | ESLint with zero warnings allowed                                             |
| `pnpm typecheck` | TypeScript across the workspace                                               |
| `pnpm run ci`    | Everything CI runs: lint, typecheck, tests, build, secret scan, bundle budget |

The component gallery is at `/dev/design-system` in development and preview builds.

## Project layout

```
apps/
  web/        React PWA
  api/        Cloudflare Worker (Hono)
packages/
  ui/         design tokens and accessible components
  domain/     pure garden logic (units, dates, schedules, solar geometry)
  schemas/    shared Zod schemas
  providers/  environmental data adapters with provenance
  ai/         Gemini client, prompts and safety checks
  catalog/    curated plant catalogue
  db/         database schema
  sync/       offline sync engine
docs/         specification, decision records, demo scripts
tools/        build checks (secret scan, bundle budget, icons)
```

## Privacy and security

- No secrets in the client bundle; CI scans the build output for key patterns.
- Strict Content Security Policy with Trusted Types; the only policy allows same-origin script URLs (service worker and web workers).
- Your location is rounded before it leaves your device for public data providers. The community and the corridor map get only a hexagon of about 5 km², and the community map hides any hexagon with fewer than five active people.
- Accounts are optional and use passkeys only: no passwords, no email, and no IP addresses stored with sessions. Invitation and plant-sitter tokens are shown once, kept only as hashes, and travel in the URL fragment so they never reach server logs.
- Push notifications are end-to-end encrypted to your browser (RFC 8291) and sent only to known browser push services.
- Report vulnerabilities privately as described in [`SECURITY.md`](SECURITY.md).

## Contributing

Contributions are welcome — please read [`CONTRIBUTING.md`](CONTRIBUTING.md) and the [Code of Conduct](CODE_OF_CONDUCT.md).

## License

[MIT](LICENSE) © Anupam Roy

<div align="center">

_PlantPal's suggestions are guidance, not guarantees. Check local regulations before planting, and never eat or use a plant medicinally based on an app's identification._

</div>
