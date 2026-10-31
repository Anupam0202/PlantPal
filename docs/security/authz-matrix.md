# Authorization matrix

Roles come only from server-side membership (`memberships.role`), never from the client. Every request authenticates, loads the membership for the target workspace, checks the role, and checks that **every referenced id** (zone, container, plant, schedule, harvest, care event…) belongs to the same workspace. Tests are in `apps/api/test/accounts.test.ts` (endpoints) and `apps/web/test/sync/server.test.ts` (per-operation rules).

✓ allowed · ✗ refused (`403 FORBIDDEN`, or `rejected/FORBIDDEN` per sync op) · 401 = sign-in required · 410 = link not active.

## Accounts and workspaces

| Endpoint                                   | Owner                                                                   | Gardener | Helper | Viewer | Non-member        | Signed out |
| ------------------------------------------ | ----------------------------------------------------------------------- | -------- | ------ | ------ | ----------------- | ---------- |
| `GET /api/v1/me`                           | ✓                                                                       | ✓        | ✓      | ✓      | ✓ (no workspaces) | 401        |
| `POST /api/v1/workspaces` (claim a new id) | ✓                                                                       | ✓        | ✓      | ✓      | ✓                 | 401        |
| `POST /api/v1/workspaces` (existing id)    | ✓ (idempotent)                                                          | ✗        | ✗      | ✗      | ✗                 | 401        |
| `GET …/members`                            | ✓                                                                       | ✓        | ✓      | ✓      | ✗                 | 401        |
| `PATCH …/members/{user}` (role)            | ✓ (keeps one owner)                                                     | ✗        | ✗      | ✗      | ✗                 | 401        |
| `DELETE …/members/{user}` (someone else)   | ✓ (keeps one owner)                                                     | ✗        | ✗      | ✗      | ✗                 | 401        |
| `DELETE …/members/{me}` (leave)            | ✓ unless last owner                                                     | ✓        | ✓      | ✓      | ✗                 | 401        |
| `POST …/invitations`                       | ✓                                                                       | ✗        | ✗      | ✗      | ✗                 | 401        |
| `POST /api/v1/invitations/accept`          | any signed-in person with a valid, unused, unexpired token (single use) |          |        |        |                   | 401        |

## Sync

| Operation                                                                                              | Owner | Gardener | Helper | Viewer | Non-member |
| ------------------------------------------------------------------------------------------------------ | ----- | -------- | ------ | ------ | ---------- |
| `GET /api/v1/sync/pull`, `/snapshot`                                                                   | ✓     | ✓        | ✓      | ✓      | ✗          |
| Garden create / update                                                                                 | ✓     | ✓        | ✗      | ✗      | ✗          |
| Garden delete                                                                                          | ✓     | ✗        | ✗      | ✗      | ✗          |
| Space, container, plant, plan, plan item, layout, care schedule, health case: create / update / delete | ✓     | ✓        | ✗      | ✗      | ✗          |
| Care event, observation, harvest, task log, nature visit: create / void                                | ✓     | ✓        | ✓      | ✗      | ✗          |
| Pantry item: create / update / delete                                                                  | ✓     | ✓        | ✓      | ✗      | ✗          |
| Any op referencing a record in another workspace                                                       | ✗     | ✗        | ✗      | ✗      | ✗          |

## Plant-sitter links

| Endpoint                                                               | Owner | Gardener | Helper | Viewer | Non-member | Sitter (active link)                                        | Sitter (expired, not started or revoked) |
| ---------------------------------------------------------------------- | ----- | -------- | ------ | ------ | ---------- | ----------------------------------------------------------- | ---------------------------------------- |
| `POST/GET …/share-links`, `DELETE …/share-links/{id}`, `GET …/summary` | ✓     | ✗        | ✗      | ✗      | ✗          | —                                                           | —                                        |
| `GET /api/v1/share/{token}` (checklist)                                | —     | —        | —      | —      | —          | ✓ (linked spaces only)                                      | 410                                      |
| `POST /api/v1/share/{token}/care`                                      | —     | —        | —      | —      | —          | ✓ (plants in linked spaces; water, feed, pest check, other) | 410                                      |

## Realtime and push

| Endpoint                                                           | Member (any role) | Non-member        | Signed out | Other site (Origin) |
| ------------------------------------------------------------------ | ----------------- | ----------------- | ---------- | ------------------- |
| `GET /api/v1/workspaces/{id}/live` (WebSocket)                     | ✓                 | ✗                 | 401        | ✗                   |
| `POST/DELETE /api/v1/push/subscriptions`, `POST /api/v1/push/test` | own browsers only | own browsers only | 401        | —                   |

## Community (`FEATURE_COMMUNITY`, off by default)

Staff roles come only from the server-side `community_staff` table (granted by an admin). Every route except `status` is absent when the flag is off. Tests: `apps/api/test/community.test.ts`, `apps/web/e2e/community.spec.ts`.

"Poster" = signed in, has a profile, not banned or currently suspended, account older than `COMMUNITY_MIN_ACCOUNT_HOURS`, under 10 posts an hour (and Turnstile when configured).

| Endpoint                                                                                | Poster                    | Member with a profile         | Suspended / banned    | Signed in, no profile | Signed out | Moderator           | Admin     |
| --------------------------------------------------------------------------------------- | ------------------------- | ----------------------------- | --------------------- | --------------------- | ---------- | ------------------- | --------- |
| `GET /community/status`                                                                 | ✓                         | ✓                             | ✓                     | ✓                     | ✓          | ✓                   | ✓         |
| `GET/PUT /community/profile` (own; coarse cell only)                                    | ✓                         | ✓                             | ✓                     | ✓                     | 401        | ✓                   | ✓         |
| `GET /community/feed`, `/events`, `/events/{id}`, `/exchange`, `/exchange/{id}`, `/map` | ✓                         | ✓                             | ✓ (read)              | ✗                     | 401        | ✓                   | ✓         |
| `POST /community/posts`, `/events`, `/exchange`, `…/reserve`, `…/questions`             | ✓                         | ✗ until the poster rules pass | ✗                     | ✗                     | 401        | as poster           | as poster |
| `PUT /community/events/{id}/rsvp`                                                       | ✓                         | ✓                             | ✓                     | ✗                     | 401        | ✓                   | ✓         |
| `POST /community/events/{id}/cancel`                                                    | organiser only            | organiser only                | organiser only        | ✗                     | 401        | ✗ (use hide/remove) | ✗         |
| `POST /exchange/{id}/publish`, `/withdraw`, `/release`                                  | listing owner only        | listing owner only            | listing owner only    | ✗                     | 401        | ✗                   | ✗         |
| `POST /exchange/{id}/cancel`                                                            | active requester only     | active requester only         | active requester only | ✗                     | 401        | ✗                   | ✗         |
| `POST /exchange/{id}/confirm`, `/complete`, `PUT …/contact`                             | the two parties only      | the two parties only          | the two parties only  | ✗                     | 401        | ✗                   | ✗         |
| Contact notes in `GET /exchange/{id}`                                                   | parties, once both shared | parties, once both shared     | parties               | ✗                     | ✗          | ✗                   | ✗         |
| `POST /community/reports`, `/blocks`, `/appeals` (own actions)                          | ✓                         | ✓                             | ✓                     | ✗                     | 401        | ✓                   | ✓         |
| `GET /admin/queue`, `/admin/audit`; `POST /admin/actions`, `/admin/appeals/{id}`        | ✗                         | ✗                             | ✗                     | ✗                     | 401        | ✓                   | ✓         |
| `POST /admin/staff`                                                                     | ✗                         | ✗                             | ✗                     | ✗                     | 401        | ✗                   | ✓         |

Blocked people do not see each other's posts, events, listings or questions, and cannot reserve each other's listings. Public surfaces carry an H3 resolution-7 cell at most; the map hides cells with fewer than five active contributors.

## Environment: green space (corridor map)

| Endpoint                                   | Anyone (per-client rate limit) | Notes                                                                                  |
| ------------------------------------------ | ------------------------------ | -------------------------------------------------------------------------------------- |
| `GET /api/v1/env/green-space?cell={res-7}` | ✓                              | Coordinates are refused (400); Overpass is called only by the Worker, cached per tile. |
