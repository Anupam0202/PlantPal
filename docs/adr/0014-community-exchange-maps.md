# ADR-0014: Community, Seed & Cutting Exchange, seed lots and maps

- Status: Accepted (feature off by default; launch is a separate owner decision)
- Date: 2026-10-30
- Specification: §6.13, §6.16, §19, §20

## Context

This covers the parts of PlantPal that involve other people: a community feed, events, a Seed & Cutting Exchange, moderation, a hex map of active growers, plus seed lots with propagation lineage and a corridor map of green space around the garden. The constraints:

- **Off by default.** `FEATURE_COMMUNITY` stays off until the owner approves it, `docs/community-policy.md` is adopted and at least one moderator is named (§20 launch condition).
- **Location privacy (§19).** Precise coordinates never leave the device. Public surfaces use H3 resolution 7 (about 5 km²) or coarser, and cells with fewer than five active contributors are hidden.
- **No fake activity, ever.** Every list starts empty and invites people to begin something.
- **Free tier.** Workers, D1 and Durable Objects only; no third-party trackers.

## Decisions

### 1. Profiles carry a coarse cell computed on the device

- The profile form computes the H3 resolution-7 cell with `h3-js` in the browser, from the garden's saved location or one device reading that is discarded at once. Only the cell id is sent.
- The server validates the cell by its bit layout (resolution, mode, base cell, unused digits; cross-checked against `h3-js` in tests) and derives the resolution-5 area that scopes feeds, events, listings and the map.
- Query keys use garden ids, never coordinates, so precise positions stay out of caches.

### 2. Exchange: a state machine with atomic reservations on D1

- `draft → listed → reserved (48 h) → handoff_confirmed (both parties) → completed`, plus `withdrawn`, `expired` (30 days) and `released / cancelled / expired` reservations.
- **Single winner without a lock object.** A D1 batch runs a conditional `UPDATE … WHERE state = 'listed'` followed by `INSERT … SELECT … WHERE changes() = 1`, backed by a partial unique index on active reservations. The concurrency test sends ten reservations at once and expects one winner; the workerd smoke proves it on real D1.
- **Contacts by mutual consent.** Each party may leave a contact note; neither is shown until both have shared one. There are no private messages in v1.
- **Biosecurity.** Listings of species recorded as invasive in the person's country (catalogue native-status data) are refused with the reason. Every exchange screen says that PlantPal records are not phytosanitary documents.
- A refused RSVP change (event full or cancelled) keeps the earlier answer: the RSVP is one conditional upsert.

### 3. Moderation

- Report reasons: spam, harassment, invasive or unsafe plant, illegal, misinformation, other. Three independent reports hide an item until a moderator reviews it.
- Moderator actions are keep, hide, remove, warn, suspend (days) and ban. Each is written to an audit log with a required reason. A ban hides everything the person shared; items can be restored one by one.
- The person sees each decision (with the reason) as a notice on the community page and can appeal once. Overturning an appeal reverses the action.
- Blocks work both ways: neither person sees the other's content, and they cannot reserve each other's listings.
- Posting rules: a profile, account age (`COMMUNITY_MIN_ACCOUNT_HOURS`, default 24), 10 posts an hour, standing (not suspended or banned), and Turnstile when configured.
- `/admin` is role-gated on the server; the page only mirrors that.

### 4. Seed lots and lineage (local-first)

- `SeedLot` is a synced entity (Dexie v8) with germination tests. `Specimen.seedLotId` links plants grown from a lot.
- Lineage (`ancestorsOf`, `descendantsOf`) is derived, not stored. Uploads go in lineage order so references always resolve on the server.
- A lot can be offered on the exchange in one tap when the community is on and the person has a profile.

### 5. Maps: MapLibre with OpenFreeMap, loaded on demand

- `MapView` lazy-loads MapLibre GL 6 (its own chunk, about 280 kB gzip, with a 300 kB ceiling in `tools/check-bundle.mjs`). It never blocks a page: without WebGL or tiles, a note appears and the page's list carries the same information.
- The style URL is configurable (`VITE_MAP_STYLE_URL`, default OpenFreeMap Liberty). If the style cannot be fetched, the hexagons draw on a plain background and the page says so.
- MapLibre's attribution control parses HTML, which Trusted Types blocks. The attribution ("© OpenFreeMap · © OpenMapTiles · © OpenStreetMap contributors") is plain text under the map instead.
- **Community map.** Cells with at least five contributors active in the last 90 days, coloured by count; the list names direction and distance from the area centre. No one's own location is drawn. Threatened species never appear because the map carries no species.
- **Corridor map (§6.16).** The browser sends only the resolution-7 tile id to `GET /api/v1/env/green-space`. The Worker asks Overpass for parks, woods, meadows, allotments, cemeteries, gardens and tagged green roofs inside the tile plus about 900 m, caches the result per tile for 90 days, and keeps the largest 300 areas. On the device, the page estimates the green share of each resolution-9 hexagon (13 sample points) and the distance to the nearest mapped area, for example "a stepping stone 340 m from the nearest mapped park". The page says this is mapped land cover, not habitat quality.

### 6. Trusted Types: a narrow default policy

The production CSP requires Trusted Types for scripts. Without a policy the browser refused every string script URL, which silently blocked the service worker (offline support, Web Push) and all web workers (the designer's sun heatmap, MapLibre). This was found while adding MapLibre; it had affected production builds from the start.

- `src/lib/trusted-types.ts` runs first in `main.tsx` and creates a `default` policy with only `createScriptURL`, which accepts same-origin http(s) URLs and throws for anything else (other origins, `data:`, `blob:`, `javascript:`).
- HTML and script-text sinks stay blocked because the policy defines nothing for them.
- An E2E test runs under the production headers with service workers allowed. It proves the service worker registers, a same-origin worker starts, and another origin's worker is refused. The test fails without the policy.

## Consequences

- The community can be switched on per deployment, but only after the launch condition is met. Until then `/community` explains that it is off, and the garden works fully without it.
- Turnstile is checked on the server when `TURNSTILE_SECRET_KEY` is set, but the client widget is not built yet: it needs a third-party script plus CSP and Trusted Types changes that need owner approval. Keep the secret unset until then.
- Photos on posts wait for media upload (R2, §14.4).
- Overpass and OpenFreeMap are public services with fair-use expectations. Overpass is called only from the Worker, at most one query every five seconds per isolate, and cached for 90 days. Tiles go through the browser cache only, with no prefetching.
