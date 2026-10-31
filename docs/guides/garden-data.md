# Guide: Local-first garden data

Run `pnpm install && pnpm --filter @plantpal/web build && pnpm --filter @plantpal/web preview`.

1. **First garden.** Open `/welcome` → **Start** → name it "Balcony" → Create. You land on Garden with an empty state.
2. **Spaces.** Garden › Spaces → **Add space** "South railing" (Balcony, full sun, faces S). Add a container "Big pot" (round, 30 cm × 25 cm deep) — volume ≈ 17.7 L is worked out for you.
3. **Plant with photo.** **Add plant** → "Cherry tomato", space South railing, container Big pot, add a phone photo. The photo is resized and re-encoded on the device; location data is removed.
4. **Log care.** On the plant page press **Log care** → Watered → 1 L → Save. The toast offers Undo. The History shows "Watered · 1 L".
5. **Type it.** Press the floating **Log care** button → "Or type it": `watered tomatoes 2 l; harvested 300 g basil` → **Read it**. Check the two proposal cards, then Save.
6. **Journal.** Garden › Journal shows everything by day, with filters.
7. **Offline.** Turn on airplane mode, reload: the app opens and you can still log care.
8. **Backup.** Settings › Your data → **Full backup (.zip)** and **Spreadsheets**. Delete all data (type DELETE), then import the zip: the preview shows counts; Import restores everything, photos included.
9. **Earlier PlantPal data.** In a browser that used the earlier PlantPal app, Today shows "We found your PlantPal data". Review counts and notes, remove the old plaintext Gemini key, then **Back up and bring it over**: a backup JSON downloads first, every record is checked after copying, and "Remove old data" cleans up once you are happy.

Automated evidence: `pnpm test` (113 unit tests incl. property tests and an interrupted-migration resume), `pnpm e2e` (44 checks incl. EXIF/GPS stripping, offline reopen, production CSP over the full flow, axe on every new page).
