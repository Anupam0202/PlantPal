# ADR-0005: Local-first store, legacy migration and archive format

- Status: Accepted
- Date: 2026-10-28

## Context

PlantPal must work offline, keep every v3 record, and never put records or secrets in `localStorage`. Sync (M10) needs stable ids, versions and an outbox.

## Decisions

1. **Schemas first.** `packages/schemas` defines every entity with Zod; `packages/domain` holds pure logic on those types. Every write is parsed before it is stored.
2. **Dexie (IndexedDB) store** in `apps/web/src/data/db.ts`, schema version 1. Versioned entities (garden, zone, container, specimen, soil test, health case) use optimistic concurrency (`version`, `VersionConflictError`). Care events, observations and harvests are append-only; removal is a `deletedAt` void with Undo.
3. **Outbox only for synced workspaces.** Local workspaces queue nothing; when a workspace is `synced`, each write appends an op in the same transaction (op id = event `opId` for append-only records, so retries are idempotent).
4. **Legacy migration as a pure plan.** `planLegacyMigration` turns raw v3 values into validated records with **deterministic ULIDs** (time from the legacy date, randomness from a hash of key + legacy id). The runner applies the plan in ordered steps, each committed atomically with its progress marker, adding only missing ids. Re-runs and resumed runs never duplicate or overwrite later edits. The plaintext v3 Gemini key is masked when read and never planned, exported or backed up.
5. **Photos are processed on the device**: decode with EXIF orientation, resize (≤ 2048 px, thumbnail ≤ 400 px), re-encode to WebP (JPEG fallback) — which drops EXIF and GPS — then SHA-256. Blobs live in their own table.
6. **Archive format** (`plantpal-archive`, version 1): a zip with `manifest.json` (counts and SHA-256 + size per file), `data/<table>.json` and `media/<id>[.thumb].<ext>`. Import verifies every checksum and schema before showing a preview; nothing changes until the user confirms. Records are re-homed into the device's workspace.
7. **Zod runs in jitless mode** in the browser, because its `new Function` probe is blocked (and reported) by the Trusted Types CSP.

## Consequences

- Tests run the data layer in Node with `fake-indexeddb` (happy-dom Blobs cannot be structured-cloned).
- `RecordNotFoundError` is deliberately not called `NotFoundError`: Dexie re-maps errors that share DOM exception names.
