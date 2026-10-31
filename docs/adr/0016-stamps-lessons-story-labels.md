# ADR-0016: Field stamps, field lessons, Garden Story and plant labels

- Status: Accepted
- Date: 2026-10-30
- Specification: §6.14, §6.17, §6.20, Appendix D

## Decisions

### 1. Field stamps are a pure function of the records

- `fieldStamps()` in `packages/domain` takes counts drawn from the records and returns each stamp's tiers, progress and earned tier. It runs again whenever a record changes, so deleting a record takes its credit away (fixes L29: no unreachable tiers, no XP bursts, nothing displayed that was not earned).
- No streaks anywhere: Steady Hands counts distinct weeks, not consecutive ones.
- Anti-gaming rules from Appendix D: planted dates in the future do not count; rainwater is capped at 500 L per day; timed counts count only at full length; phenology needs 12 distinct dates across 3 months; harvest uses weighed mass only.
- Stamps whose records PlantPal does not keep yet (Soil Builder, Host Haven, Good Neighbour, Heat Shield, Trusted Sitter, Open Science) say so instead of showing progress.
- A newly earned stamp plays a stamp press once (instant under reduced motion). XP and badges from the earlier PlantPal app are shown read-only in their own section and never mixed in.

### 2. Field lessons

Six lessons of three to five minutes (light basics, watering by touch, saving seeds, timed counts, balcony composting, reading a forecast), each with one question. Completion is stored on the device and counts towards Field Scholar. The wording is general guidance with links to the sources a curator should check it against; it is marked as needing review.

### 3. Garden Story

`gardenStory()` builds a year from the records: first plantings, the bloom months with known forage, top harvests (weights and counts kept apart), visitors seen in nature visits, rainwater used and one photo per month. Sharing shows only the garden's name, never its address or coordinates. Photos are left out unless the person includes them, with a warning about faces and details of their home. "Save as image" draws a 1080 × 1350 card on a canvas; "Print or save as PDF" prints only the story.

### 4. Plant labels without a PDF library

The spec suggested pdf-lib. Labels are instead drawn on a canvas at 300 dpi and each A4 page is embedded as a JPEG in a minimal PDF written by `features/labels/pdf.ts` (JPEG is a native PDF image format). This keeps the chunk at about 5 kB instead of about 200 kB, and every script the browser can draw (Hindi, accented names) prints correctly without embedding fonts. The trade-off is that label text is not selectable in the PDF. QR codes come from `uqr` (MIT, no dependencies). Each label has the plant's name, scientific name, planted date, up to three care basics from cited catalogue traits, and a QR code to the plant's page. That page opens only on a device that has the garden; share-token QR codes for other people are not built.
