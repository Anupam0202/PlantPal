# Deploy

The Worker (`apps/api`) serves the built web app and the API from one origin. Vercel builds previews of the web app from every push (static, direct provider mode, no accounts).

## One-time setup (owner)

1. `pnpm install` and `pnpm --filter @plantpal/web build`.
2. `cd apps/api && pnpm exec wrangler login`.
3. `pnpm exec wrangler d1 create plantpal` and put the returned id in `wrangler.toml` (`database_id`).
4. In `wrangler.toml` `[vars]`, set for production:
   - `PROVIDERS = "live"` (it is `mock` for local work);
   - `PUBLIC_ORIGIN` to the real https address (passkeys are bound to its host);
   - `ALLOWED_ORIGINS` to that same address;
   - `VAPID_PUBLIC_KEY` if Web Push is wanted;
   - keep `FEATURE_COMMUNITY = "off"` until the launch conditions in `docs/community-policy.md` are met.
5. Secrets (never committed):
   - `pnpm exec wrangler secret put BETTER_AUTH_SECRET` (`openssl rand -hex 32`);
   - `pnpm exec wrangler secret put VAPID_PRIVATE_KEY` (from `pnpm --filter @plantpal/api vapid:keys`), if push is wanted;
   - `TURNSTILE_SECRET_KEY` only after the Turnstile widget exists (ADR-0014).

## Every release

1. CI green on the commit: `pnpm run ci`, E2E, CodeQL.
2. `pnpm --filter @plantpal/api smoke` locally (workerd + local D1).
3. Apply migrations: `pnpm exec wrangler d1 migrations apply plantpal --remote`. Migrations only add tables and columns; none drops data. Check the list it prints before confirming.
4. `pnpm --filter @plantpal/web build`, then `pnpm --filter @plantpal/api deploy`.
5. Check `https://<origin>/api/v1/status` (every provider listed, no circuits open) and sign in with a test passkey.
6. Note the deployed version id that `wrangler deploy` prints, for rollback.
