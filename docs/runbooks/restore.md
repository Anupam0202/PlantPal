# Back up and restore

## People's own data

Everything a person records lives on their device first. Settings › Data exports a zip with a manifest and SHA-256 per file; importing shows a preview with conflicts. This works with or without an account.

## Server data (D1)

- D1 Time Travel keeps point-in-time history (30 days on the paid plan, 7 days on Free; check the current limits).
- See the history: `pnpm exec wrangler d1 time-travel info plantpal`.
- Restore to a time or bookmark: `pnpm exec wrangler d1 time-travel restore plantpal --timestamp=<unix-seconds>`. This replaces the whole database: writes after that time are lost on the server (devices still hold their copies and will re-sync what they can).
- For an extra copy before risky work: `pnpm exec wrangler d1 export plantpal --remote --output=plantpal-<date>.sql`. Store it encrypted; it contains account and garden data.

## After a restore

Devices that synced after the restore point have a cursor ahead of the server. The sync engine detects this (history horizon) and asks those devices to take a fresh snapshot, keeping their unsent changes for review (ADR-0013).
