# Guide: Nature, harvest and impact

Everything works in demo mode (`VITE_PROVIDERS=mock pnpm --filter @plantpal/web dev`). Nature nearby then shows labelled demo data.

1. **Timed pollinator count (W7).** Nature › **Timed pollinator count**.
   - Pick a target flower (plants usually flowering now are listed first, marked ✿) or type one, then count the flowers in the 50 × 50 cm patch.
   - The weather is prefilled from the forecast and editable. A notice says whether it meets the PoMS guidance.
   - **Start 10-minute count**: tap the large group buttons each time an insect lands. The screen stays on, and **Pause** and **Finish now** are there.
   - **Review**: correct any number, or mark a group **Not sure**. A count of zero shows "A zero is data. Thank you for counting." **Save count**.
2. **Bird count and sightings.**
   - **5-minute bird count**: add each bird with the most seen at once. Seeing none is saved as a result.
   - **Log a sighting**: group, optional name, count, behaviour, the plant it was on, and an "I'm not sure" option.
3. **Flowering and fruiting checks.** For each plant, Buds, Flowers, Fruit and New leaves each take **Yes**, **No**, **Not sure** or **Not checked**. Unchecked phases are stored as "Not checked".
4. **Nature log.**
   - Every visit is listed, with badges for "Stopped early", "Outside PoMS weather" and "not sure".
   - **Trends** appear per target flower only after three comparable counts. Otherwise the log explains why other counts were not compared.
   - **Export Darwin Core CSV** (location rounded to about 1 km), with the PoMS credit and link.
5. **Bloom Bridge.**
   - The wheel shows a ring per plant and an outer band marked forage, gap or unknown. The months-by-plant table holds the same data.
   - Hunger gaps and unknown months are listed separately.
   - **Fill the gap** lists eligible plants that flower in the gap months, natives first.
   - In a southern-hemisphere garden the months rotate; near the equator a note says timing differs.
6. **Native & Invasive Lens.** Each plant shows Native, Introduced, Listed invasive, Sources disagree or Unknown for the garden's region, with sources and review state.
   - In Pune, _Lantana camara_ is listed invasive (GRIIS India) with guidance.
   - Unknown says why.
   - A native cultivar notes that its wildlife value may differ.
7. **Nature nearby.** Insects, birds and plants recorded within 1, 2 or 5 km (iNaturalist, research grade), and GBIF records (CC0 and CC BY only). It says "Records reflect where people looked, not how many there are" and that only a rounded point is sent.
8. **Harvest and pantry.** Garden › **Harvest**.
   - Log 450 g of cherry tomatoes with a use-by date, then 3 bunches of coriander. This year shows "0.45 kg · 3 bunches", and weights and counts are never added together.
   - Both go into the pantry. **Move to** stored, preserved, given away, composted or wasted.
   - Today shows **Use soon** two days before a use-by date.
9. **Impact ledger.** Nature › **Impact ledger** lists, for this year, the last 12 months or all time:
   - food by weight and by count;
   - rain, tap and greywater;
   - waterings with no amount;
   - composted and shared produce;
   - native plants, months with pollinator food, nature visits, time observing and kinds seen;
   - the peat-free share, canopy estimate (with range) and trees.

   Each line says Logged, Estimate or Counted from records, with its source. Carbon is "Not estimated".

Automated evidence:

- **Unit tests:**
  - four-state totals, with zero as data and unsure kept aside;
  - PoMS weather guidance;
  - compatibility reasons and the three-count trend gate, including the season window across the new year;
  - Darwin Core export: absences, unchecked rows left out, rounded and formula-safe;
  - Bloom Bridge: southern rotation, a fixture garden with exactly two gap months, unknown never a gap, observations overriding the catalogue;
  - Lens fixtures: a native, _Lantana camara_ GRIIS-listed in India, a conflict, unknown with reasons;
  - harvest and pantry totals per dimension, final states, use-soon;
  - Impact Ledger methods, unknowns and no carbon number;
  - iNaturalist and GBIF URLs, licence filter, rounding and radius clamp;
  - nature and pantry commands, archive round trip, Dexie v7 upgrade.
- **Playwright (both viewports):**
  - **W7:** two FIT counts including a zero, unsure groups, the trend gate, and the Darwin Core download;
  - Lens, Bloom Bridge and four-state phenology;
  - harvest to pantry, Today's use-soon, and the Impact Ledger;
  - nature nearby, including the rounded point;
  - axe on every new page, and a phone-width check of every new route.
