# ADR-0012: Nature log, Bloom Bridge, Lens, harvest and pantry, Impact Ledger

- Status: Accepted
- Date: 2026-10-29

## Context

M9 covers several features:

- the Nature Log, with timed counts and phenology checks (§6.10, W7);
- the Bloom Bridge (§6.9);
- the Native & Invasive Lens UI (§6.3);
- neighbourhood nature;
- harvest and pantry (§6.13);
- Impact Ledger v1 (§6.14).

The science rules decide most of the design:

- **S1:** quantities only add within a dimension.
- **S2:** missing is not zero, and "checked and absent" is not "not checked".
- **S8:** records reflect effort, and only compatible visits are compared.
- **S9:** unknown status is unknown.
- **S12 and L16:** no carbon numbers without a cited method.
- **S16:** PlantPal does not guess food safety.

## Decisions

1. **One `NatureVisit` record for every protocol** (Dexie v7, append-only, included in backups):
   - `fit-count`: 10 minutes, a 50 × 50 cm patch, PoMS insect groups;
   - `bird-count`: 5 minutes;
   - `sighting`;
   - `phenology`.

   Every record has one of four states: `YES`, `NO`, `UNCERTAIN` or `NOT_CHECKED`.
   - A group counted at zero is stored as `NO` with count 0, and the UI says "A zero is data".
   - Unchecked phenophases are stored as `NOT_CHECKED`, so "not looked" is never read as "absent".
   - Unsure identifications are kept and listed, but left out of totals.

2. **Trends are gated.**
   - Two visits are comparable only when they meet all of these:
     - same protocol;
     - both ran the full planned time;
     - same target flower, with the flowers in the patch counted;
     - within 21 days of each other in the season;
     - temperatures within 5 °C of each other;
     - the same kind of sky.
   - A trend needs three comparable counts. Otherwise the log shows history and the reasons, never a change.
   - Weather is prefilled from the forecast as `MODELLED` and becomes `MEASURED` when edited. Counts outside the PoMS weather guidance (dry, ≥ 13 °C in sun or ≥ 15 °C when cloudy) are saved and marked. That guidance was checked against PoMS-derived sources; verify it against the current protocol before launch.
3. **Darwin Core export.**
   - Exports use `occurrenceStatus` `present` or `absent`. `NOT_CHECKED` rows are left out, and unsure rows are qualified.
   - Coordinates are rounded to 0.01° with a 1 km uncertainty.
   - The sampling protocol, effort and patch size are written out. Cells are formula-safe, and coordinates are written as numbers.
   - PoMS is credited, with a link to its own submission route. PlantPal does not submit on anyone's behalf.
4. **Bloom Bridge.**
   - The catalogue gains a `bloomMonths` trait: northern-hemisphere reference timing for 62 taxa. It is an AI draft, `needs_review` like every other trait. An empty list means "does not flower", as for ferns; a missing trait means unknown.
   - Months are rotated six months for the southern hemisphere. Gardens within 30° of the equator are told that timing often differs.
   - The person's own "flower" checks override the catalogue month by month.
   - Month states:
     - `FORAGE`: at least one plant with medium or high pollinator value is flowering.
     - `GAP`: every plant is known and none provides forage.
     - `UNKNOWN`: missing data. It is never shown as a gap.
   - "Fill the gap" lists catalogue plants that flower in the gap months and feed pollinators. It keeps only those the eligibility engine marks `ELIGIBLE` for the garden's first space, natives first.
5. **Lens.** The page reuses the engine's `nativeStatusOf`, so the Lens and recommendations always agree.
   - Each plant shows its status for the garden's region, the source matrix with review state, and the reason when the status is unknown (not linked, no region, no statement).
   - Listed invasives get practical guidance.
   - Planned plants are included, so an invasive is flagged before it is planted.
   - The words "not invasive" never appear.
6. **Nature nearby.**
   - iNaturalist species counts come from research-grade observations, grouped by `iconic_taxa` (Insecta, Aves, Plantae). Numeric taxon ids could not be verified from this sandbox, so they are not hard-coded. Insects are labelled "including pollinators".
   - GBIF occurrence counts come from CC0 and CC BY records only. Records and species are kept apart.
   - Only a point rounded to about 5 km and a radius of 1–5 km leave the device.
   - Both providers are called from the browser like the other open APIs, cached in IndexedDB, and labelled when the data is demo data.
7. **Harvest and pantry.**
   - Harvests are entered as a weight (g, kg, oz or lb, stored as grams) or as a count with its own label. Totals stay per dimension, so "0.45 kg · 3 bunches" never becomes one number (L15).
   - A harvest can go straight to the pantry (`PantryItem`, versioned).
   - Pantry states are fresh, stored, preserved, given, composted and wasted. Given, composted and wasted are final.
   - Use-by dates are only the person's own (S16). Today shows a "Use soon" notice two days ahead.
8. **Impact Ledger v1.** Every row carries how it was obtained:
   - `MEASURED`: logged values.
   - `DERIVED`: counts over records.
   - `ESTIMATED`: canopy area, with the range from the spread ranges.

   Rows cover:
   - food by weight and by count;
   - rain, tap and greywater used;
   - waterings with no recorded amount;
   - composted and shared produce;
   - native plants, with a note that statuses are drafts;
   - months with pollinator food;
   - nature visits, time spent observing and kinds seen;
   - plants given away;
   - the share of pots with peat-free mix;
   - canopy area and trees.

   Unknown values stay unknown. Carbon is always "Not estimated", and a test checks that no CO₂ value is ever produced.

## Deferred

- **Exchange listings, reservations and handoffs (W8 after the pantry):** need accounts and the community flag (M10–M11).
- **Seed lots and the propagation family tree:** M11, with the exchange.
- **AI recipes and storage guidance:** need user-confirmed edible identities and sourced storage data (S16).
- **Avoided-emissions ranges for composting:** need a cited factor set (for example US EPA WARM) reviewed before any number is shown.
- **Garden Story** (M12), group ledgers (with accounts), optional iNaturalist upload (COND), on-device bird sound ID (EXP).
- **Larval-host and bird-food rings on the wheel:** the catalogue has no sourced data for them yet.
- **iNaturalist flowering-annotation histograms:** the annotation term ids need verifying.
