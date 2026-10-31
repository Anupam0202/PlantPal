# Guide: Community, Seed & Cutting Exchange, seed lots and maps

The community is **off by default**. To see it locally, run the Worker as in the [accounts and sync guide](accounts-and-sync.md), apply all migrations, and switch the flag on for your machine only:

```sh
pnpm --filter @plantpal/web build
cd apps/api
echo "BETTER_AUTH_SECRET=$(openssl rand -hex 32)" > .dev.vars
echo 'FEATURE_COMMUNITY="on"' >> .dev.vars
echo 'COMMUNITY_MIN_ACCOUNT_HOURS="0"' >> .dev.vars   # demo only; the default is 24
pnpm exec wrangler d1 migrations apply plantpal --local
pnpm exec wrangler dev                               # http://localhost:8787
```

Use two browsers (or a normal and a private window) as two people. Give both gardens a location in the same town.

1. **Off means off.** With the flag unset, `/community` says it is not switched on, and the garden works fully.
2. **Seed library (§6.13).**
   - Open a plant › **Save seeds from this plant**. The lot inherits the plant's name.
   - Add a germination test (for example 8 of 10 sprouted): the lot shows "80% sprouted".
   - **Grow a plant from this lot**, then open the new plant: its **Family tree** shows where it came from.
3. **Join the community.**
   - `/community` asks you to sign in with a passkey, then to create a profile.
   - The profile form shows "Near <your town>" and explains that only a rough area of about 5 km² is shared.
   - The feed is empty and invites you to start. Nothing is invented.
4. **Post and organise.** Share a post. Under **Events**, organise a seed swap with 1 place; the second person to say "Going" is told it is full and keeps their earlier answer.
5. **Offer seeds.** From the seed lot, **Offer on the exchange** (or **Exchange › Offer something**). Try a species listed invasive in your country: the listing is refused with the reason.
6. **Swap (second browser).**
   - Open the listing, ask a public question, then **Reserve**. It is held for 48 hours.
   - Both people share a contact note. Neither sees the other's until both have shared.
   - Both **Confirm the handoff**, then **Mark as completed**.
7. **Report and moderate.**
   - Report a post. Make yourself a moderator in the local database:
     `wrangler d1 execute plantpal --local --command "INSERT INTO community_staff (user_id, role, created_at) VALUES ('<user id>', 'moderator', 0)"`
   - `/admin` shows the queue. Give a reason and **Hide**; the audit log records it.
   - The author sees the notice with the reason and can **Appeal**. **Reverse it** in `/admin` restores the post.
8. **Community map.** The **Map** tab stays empty until five people in one hexagon have been active in the last 90 days; then it shows a count, never a person.
9. **Corridor map (§6.16).** `/nature/corridor` shows "Your garden is a stepping stone … from the nearest mapped park", the share of mapped green space around you, the nearest areas, and the map. Only the coarse tile id is sent; distances are worked out on the device.
10. **Offline and security headers.** In production headers (`vite preview`), the service worker now registers under Trusted Types; the map's worker starts; another origin's worker is refused.

## Evidence

- `pnpm run ci`: lint, format, typecheck, unit tests (community store and routes, seed lots and lineage, green-space provider, map geometry, Trusted Types policy), build, bundle budgets, header check.
- `pnpm exec playwright test` in `apps/web`: `community.spec.ts` (two people with virtual passkeys run the swap, report, moderation, appeal and map threshold; axe; no precise coordinates in any API request), `seeds.spec.ts`, `maps.spec.ts` (corridor map under the production CSP; axe), `shell.spec.ts` (community off without a server; service worker under Trusted Types).
- `pnpm --filter @plantpal/api smoke` (workerd + local D1): single-winner reservation, RSVP capacity, map threshold, 12 providers in status.
