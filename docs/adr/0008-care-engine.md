# ADR-0008: Care engine, Water-Wise checks, alerts and the season model

- Status: Accepted
- Date: 2026-10-29

## Context

Daily care must be calm and honest (§6.4–§6.6, §6.15, S5, S7, S18). Fixed watering timetables are wrong for containers. Missed tasks must not pile up. Dates must follow the garden's time zone through DST. Alerts must never come from stale data or pose as safety warnings.

## Decisions

1. **Rule, identity and history are separate** (`packages/domain/src/care.ts`). A schedule holds a recurrence rule (daily, weekly on chosen weekdays, or monthly clamped to short months and leap days), a `version` and an `effectiveFrom` date. An occurrence's identity is `schedule.vVersion.specimen.localDate`. History is the append-only `task_log`. Editing a series bumps the version from today, so past occurrences keep their identity. A snooze hides one occurrence until a time. A pause skips occurrences until a date. Due instants resolve in the garden's IANA zone: a time in a DST gap moves forward, and a time in a fold uses the earlier instant.
2. **Idempotent completion.** The id of a "done" or "checked" log is derived from the occurrence key and its due time, so a double tap or an offline replay returns the existing record and never logs care twice. "Checked, still moist" is completed care (appropriate inaction). Undo voids the log and any care event it created.
3. **Holiday triage.** After a gap of three days or more with no logged activity, overdue occurrences collapse into one check per plant ("Welcome back"). They are never replayed.
4. **Water-Wise as "check by" dates** (`water.ts`, `careplan.ts`). Each active plant gets a daily container balance:
   - Demand is ET₀ × Kc class × exposure × canopy × the pot's learned factor; 1 mm over 1 m² is 1 L.
   - Rain is added only to uncovered pots (90 % catch), capped at the readily available water, and the excess drains.
   - The balance starts from the last watering or soil check: dry 0.1, moist 0.6, wet 1.0.
   - The check falls on the first day the store is at or below half, "likely dry at 2 cm".
   - Missing weather is unknown, not zero, and flags the estimate as uncertain.
   - Each check moves the pot's factor by 15 % within [0.5, 2].
   - All coefficients are documented assumptions (substrate fractions, FAO-56-based Kc classes, exposure), labelled as estimates.
   - Nothing is actuated.
5. **Default schedules from traits.** Planting a planned specimen creates editable schedules from its catalogue traits:
   - food plants are fed every 14 days, others every 28, houseplants monthly;
   - a weekly pest look;
   - weekly harvest checks from the plant's days-to-maturity.
6. **Heat Shield and Frost Guard** (`alerts.ts`). Alerts look 24–72 hours ahead and are suppressed when the forecast is stale.
   - Frost: a forecast minimum of 2 °C or less, compared with each plant's minimum, with a 2 °C margin for pots. Unknown tolerance is listed rather than assumed safe.
   - Heat: 35 °C, or a day at or above the garden's own 90th-percentile maximum for the month (from the climate profile) when it is at least 28 °C, compared with each plant's heat tolerance. Shade gives 2 °C of slack.
   - Only the worst day of each kind is shown, with a checklist and the plants affected. Each alert is labelled "gardening guidance, not a safety warning".
7. **Season model and sowing windows** (`season.ts`).
   - Season model comes from Köppen class, hemisphere and the monsoon: monsoon (Zaid / Kharif / Rabi), Mediterranean, temperate, cold, tropical wet, tropical wet-dry (including tropical highlands), and arid.
   - Sowing windows come from monthly climatology:
     - warm crops when this month and the next average ≥ 10 °C minimum and ≤ 36 °C maximum;
     - cool crops when the mean is 6–24 °C and the maximum ≤ 32 °C.
   - The eligibility rule E7 uses these windows when local climate is available; when no month suits a crop, the rule says so instead of excluding it.
8. **Climate Fit.** The climate profile adds monthly 90th-percentile maxima and 10th-percentile minima. Projections compare 2031–2050 with 1991–2014 for each CMIP6 HighResMIP model against its own baseline (two requests, about 3 MB, cached a year). They are loaded only on request and never named as a scenario. The Worker computes them on demand with a 30-day HTTP cache; queue-based precomputation waits for real traffic.
9. **Layouts fit phones.** Mobile Chrome zoomed the whole app out whenever a row was wider than the screen, even inside a scrolling container. Rows such as the 7-day forecast, the week strip and the sowing calendar now fit the width. An E2E test checks the layout width of every key page on a phone viewport.

## Consequences

- Web Push delivery and quiet hours need server-side subscriptions, which come with accounts (ADR-0013). Without an account, alerts and tasks appear in the app.
- Official warning feeds (NWS, MeteoAlarm, GDACS), the Rain Harvest planner screen, batch watering and chill hours are not built yet. The tank simulation exists in the domain with property tests.
- Köppen classes follow Peel et al. (2007); the Beck et al. (2018) refinements are not applied.
