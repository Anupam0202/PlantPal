# Guide: Care and climate

Use a fresh browser profile, or demo mode (`VITE_PROVIDERS=mock pnpm --filter @plantpal/web dev`).

1. **Plant something.** Make a plan in Seed onboarding (`/welcome`), open a planned plant in Garden, and press **Mark as planted**. The care panel lists its schedules (feeding, a weekly pest look, harvest checks for food plants), each marked "From traits", with pause and remove.
2. **Today cockpit.** Under the Living Sky, **Needs attention** shows "Check soil · <plant>" ("Not checked yet"). Press **Check**, then pick soil, leaves and pests.
   - **Dry:** suggests "Water now: about X L", with an editable amount and source (grey water carries a caution). **Log watering** records the amount, and the next check moves to a later day under **This week**.
   - **Moist:** "Done, no water needed". It counts as care, and the pot learns: its water factor goes down.
3. **Skip, snooze, undo.** Skip with a reason (rained, still moist, away) or snooze (in 3 hours, tomorrow at 08:00 garden time). Each action has **Undo**.
4. **Frost Guard.** With a forecast night at or below 2 °C, a frost card lists the actions and the plants at risk ("below its limit", or "tolerance unknown"), marked "Gardening guidance, not a safety warning". Stale forecasts raise nothing.
5. **Welcome back.** After 3 or more days without activity, missed tasks fold into one check per plant.
6. **Climate Fit.** Nature › Climate Fit shows:
   - hardiness from the mean annual extreme minimum ("your coldest night is typically about …");
   - frost dates or "frost is rare";
   - hot days, the Köppen class, and local seasons (Zaid, Kharif and Rabi for Pune);
   - monthly normals as a chart and a table, with the ERA5 period stated;
   - **Load projections**: model change around 2040, each model against its own past, with no scenario named.
7. **Calendar.** Plan › Calendar shows sowing months per planned plant from local climatology.

Automated evidence:

- **Unit tests:**
  - recurrence: DST gap and fold, garden time zone, leap day, snooze, idempotent completion, holiday collapse, versioned edits;
  - water balance property tests (bounded storage, covered pots get no rain, unknown is not zero), recalibration bounds, and tank mass conservation;
  - alert triggers and suppression;
  - season model for seven reference cities, and sowing windows;
  - care commands, and the local database upgrade to schema version 4.
- **Playwright:** the W3 loop with frost guidance, skip and undo, Climate Fit with projections, the calendar, and a phone-width check on every key page.
