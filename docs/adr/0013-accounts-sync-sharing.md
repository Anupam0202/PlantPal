# ADR-0013: Accounts, sync, sharing, realtime and Web Push (M10)

- Status: Accepted
- Date: 2026-10-30
- Milestone: M10 (§6.11, §14, §21)

## Context

PlantPal is local-first: everything works without an account (ADR-0005). M10 adds optional accounts so a person can back up their gardens, use them on several devices, share them with a household (owner, gardener, helper, viewer) and hand them to a plant-sitter for a trip. The constraints:

- Free tier (Workers, D1, Durable Objects).
- No passwords, and no email unless the owner configures it.
- Authorisation on every request.
- Nothing about a garden in logs or URLs.
- The in-app due list never depends on push.

## Decisions

### 1. Passkey-only accounts with Better Auth on D1

- **Better Auth 1.7** with the `@better-auth/passkey` plugin, using D1 directly (`database: env.DB`).
  - Email/password is disabled. Password hashing can exceed the free-plan CPU budget (§11), and we don't want to hold passwords.
  - There is no OAuth and no email. Better Auth's `user.email` column is required, so it holds `<uuid>@passkey.invalid`, which can never receive mail.
- **Sign-up is a passkey ceremony** (`registration.requireSession: false`).
  - `resolveUser` gives the new person a random id and the name they typed.
  - The account row is created in `afterVerification`, only after the authenticator's response verifies. An abandoned prompt leaves nothing behind.
  - While signed in, the same flow adds another passkey to the same account.
- **Relying party.** It is the host of `PUBLIC_ORIGIN`. Origins are checked against `PUBLIC_ORIGIN` plus `ALLOWED_ORIGINS`, which also serve as Better Auth's trusted origins (CSRF).
- **Cookies** are HttpOnly and SameSite=Lax, and Secure on https. Sessions last 30 days.
- **No IP addresses are stored with sessions** (`disableIpTracking`). Rate limiting for `/api/auth/*` uses the Worker's own per-client Durable Object limiter.
- **Secrets.** Accounts are off until the `BETTER_AUTH_SECRET` Worker secret exists. Until then `/api/auth/*` answers `503 CONFIGURATION_REQUIRED` and account routes answer `401`.
- **Workers detail.** Better Auth starts async setup (D1 reads) when created. A promise begun in one request cannot finish in another, and the request then hangs. So the Worker creates the auth instance per request. The smoke test caught this in workerd.
- **Schema.** Migration `0003_auth.sql` is generated from Better Auth's own schema (`pnpm --filter @plantpal/api auth:migration`). A test fails when it goes stale.

### 2. Workspaces and roles in our own tables (not the organisation plugin)

§11 suggested Better Auth's organisation plugin. We use three small tables beside the sync store instead: `workspaces`, `memberships` and `invitations`, plus `share_links` for sitters. The reasons:

- Membership must be read in the same place, and the same request, as the sync records it guards.
- The four roles are fixed and need no per-organisation role editing.
- Invitations are single-use links, not email.
- Sitter links have no counterpart in the plugin.

What it does:

- **Role rules** live in `packages/sync/src/roles.ts`:
  - viewers never write;
  - helpers write only care, observations, harvests, pantry, task logs and nature visits;
  - only owners delete a garden or manage people and links.
- **Every write** is checked per operation. Every referenced id (zone, container, plant, schedule, harvest…) must be in the same workspace.
- **A workspace always keeps one owner:** demoting or removing the last one is refused.
- **Custody (§6.11).** When someone leaves or is removed, the records they added stay with the garden. The idempotency log keeps who changed what. Nothing is deleted silently.
- **Invitation tokens** are 32 random bytes, shown once; only their SHA-256 is stored. Each one is single-use: the conditional `UPDATE … WHERE used_at IS NULL` makes two simultaneous accepts impossible. They expire after 1–168 hours.

### 3. Sync protocol (§14.3)

- **One write path.**
  - `POST /api/v1/sync/push` takes up to 100 queued operations: `opId`, `type`, `entityId`, the whole record, `baseVersion`.
  - Each op is authorised, validated against the same Zod schema the client used, reference-checked, and checked for idempotency (op id + payload hash).
  - It is applied in one D1 `batch()`: record, change-log row and idempotency row together.
  - Per-entity REST endpoints (`/gardens`, `/zones`, …) are not built. The push carries the per-op equivalent of `Idempotency-Key` and `If-Match`.
- **Conflict policy:**
  - **Versioned records** (garden, space, container, plant, plan, layout, schedule, health case, pantry item): a stale `baseVersion` returns `conflict` with the server copy. That copy wins on the device, and my version is kept for "Use mine / Keep theirs".
  - **Append-only records** (care, observations, harvests, task logs, nature visits) are merged by id and voided, never edited.
  - **Task completions** de-duplicate on the occurrence key, first wins. The duplicate check runs before reference checks, because a second completion points at its own, now redundant, care event.
- **Clients send whole records for updates.** The server never merges partial patches. The contract test caught the client sending patches.
- **Pull.**
  - `GET /api/v1/sync/pull?workspace&cursor` returns changes since a sequence number, tombstones included, in pages of up to 100.
  - A daily cron prunes history older than 90 days and moves each workspace's floor past it. A device behind the floor gets `409 SNAPSHOT_REQUIRED` and fetches a snapshot.
  - Its waiting changes then pause until the person reviews them.
- **Refused changes** stay on the device with their reason, to retry, discard or export. They are never resent on their own.
- **Revocation.** When access is removed (a pull answers 403), that garden's waiting changes move to "unsent" and can never be uploaded there.
- **Guest → account.** "Back up and sync" claims the device's workspace id and queues every record as a create, references first (parent plants before cuttings), through the same validated push. Versions restart at 1, because no other device has these records yet.
- **One sync leader per browser.** It is chosen with the Web Locks API; other tabs ask it to run through a `BroadcastChannel`. It syncs when changes are queued, on reconnect, on focus, every minute while visible and on live pings, and backs off after errors.

### 4. Plant-sitter links (§6.11)

- **The owner picks spaces and dates (at most 30 days).** Every id must be in that garden.
- **The sitter needs no account.** They open `/sit#<token>`. The token travels in the URL fragment, which browsers never send to servers or put in logs.
- **What the sitter can do:** see only active plants in those spaces, only between the dates, and log water, feed, pest check or other.
- **How sitter care is stored:** it goes through the same `applyOp` path as a helper (`sitter:<linkId>`). So it is validated, appears in everyone's change feed, and makes up the owner's summary.
- **Links** can be turned off at any time. Tokens are stored hashed and rate-limited.

### 5. Realtime: GardenRoom (§14.3)

- **One Durable Object per shared garden**, using hibernating WebSockets. `ping` is answered without waking the room.
- **Messages are change notices only** (`{"type":"changed","seq":N}`). Members then pull, and pull checks access as always.
- **The live socket is guarded.** It checks the session, membership and the `Origin` header, because WebSockets skip CORS (cross-site socket hijacking). It is handled before the app router so the upgrade response is not rebuilt.
- **Removed members** have their sockets closed (code 4003).
- **Fallback.** Polling on focus and every minute stays. Browsers whose CSP does not let `'self'` cover `wss:` simply poll.

### 6. Web Push (§21)

- **WebCrypto only, so it runs in Workers:**
  - message encryption per RFC 8291 (aes128gcm, one RFC 8188 record);
  - VAPID per RFC 8292 (ES256 JWT, 12-hour expiry).
- **Payloads are encrypted to the browser.** Push services relay bytes they cannot read.
- **Subscriptions are accepted only for known browser push services** (FCM, Mozilla, Apple, Windows), so the server never calls arbitrary URLs (SSRF). Gone subscriptions (404/410) are deleted on the next send.
- **Opt-in per device.** Permission is asked only on a tap. iPhone and iPad get the Home Screen hint (iOS 16.4+).
- **Off until configured.** Push stays off until `VAPID_PUBLIC_KEY` (var) and `VAPID_PRIVATE_KEY` (secret) exist; `pnpm --filter @plantpal/api vapid:keys` makes a pair.
- **Only the test notification ships in M10.** The care-due digest and invitation notices come with the scheduled digest work.

## Verification

- `apps/web/test/sync/server.test.ts` (role matrix, idempotency, conflicts, completion de-dup, contract test over every kind of change) and `engine.test.ts`. These run the web data layer against the real server logic through a JSON boundary: claim, pull, snapshot with review, conflicts, duplicates, refusals and joining.
- `apps/api/test/accounts.test.ts`, with migrations 0001–0004 on SQLite D1:
  - the authorisation matrix for owner, gardener, helper, viewer and non-member, on every endpoint that touches garden data;
  - expired, early and revoked sitter links;
  - single-use and expired invitations;
  - last-owner rules;
  - live pings and kicks;
  - the history horizon.
- `apps/api/test/auth.test.ts`: real WebAuthn verification with a software passkey. It covers sign-up, sign-out and sign-in, a second passkey, forged signatures, look-alike origins, replayed challenges, and checks that no password, email or IP is stored.
- `apps/api/test/push.test.ts`: our messages decrypt with Martin Thomson's reference ECE implementation; the VAPID signature verifies with the public key; the push-service allowlist and the subscription routes behave.
- `apps/web/e2e/accounts.spec.ts`: Chromium's virtual authenticator signs up against the real API running in-process. It then backs up a garden, creates a sitter link that a second browser uses, and checks the owner's summary, revocation, sign-out and sign-in. Accessibility checks run on every new screen, on mobile and desktop.
- `apps/api/scripts/smoke.ts` in workerd (`wrangler dev`):
  - passkey sign-up with a software passkey;
  - claiming a workspace;
  - the live socket, with a foreign origin refused, auto-response pong, and a "changed" ping after a push;
  - push subscription save, refuse and remove.

## Consequences

- **Deploying** needs the owner's Cloudflare account and approval, plus these secrets: `BETTER_AUTH_SECRET`, `VAPID_PRIVATE_KEY` and the `VAPID_PUBLIC_KEY` var. Passkeys need the real `PUBLIC_ORIGIN` (https).
- **Media is not synced yet.** Photos stay on the device until the R2 pipeline (§14.4). Soil tests and drafts are local too.
- **Per-entity REST endpoints and the Better Auth organisation plugin are not used** (see above). Revisit if third-party clients need them.
- **The UI does not hide edit buttons by role.** A viewer's edits are refused by the server and listed under "Changes not sent" with the reason.
