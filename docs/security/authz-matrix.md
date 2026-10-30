# Authorization matrix (M10)

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
