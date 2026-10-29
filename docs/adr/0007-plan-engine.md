# ADR-0007: Plant catalogue, Sun Hours and the eligibility engine

- Status: Accepted
- Date: 2026-10-29

## Context

Seed onboarding (§6.1, W1) must give a credible plan in about 90 seconds, with or without AI, and every recommendation must be explainable, deterministic and honest about what is unknown (§17, S4, S9, S10, L21). The build sandbox cannot reach botanical sources (MOBOT, Kew, ASPCA pages time out or are blocked), so trait values cannot be checked against primary sources in this run.

## Decisions

1. **Catalogue as data with provenance** (`packages/catalog`). Every trait assertion carries a unit (numeric traits), an evidence grade, a source id and a review state. `tools/validate-catalog.ts` runs in CI and fails on a missing unit, an unknown source, a malformed value, a duplicate, invasive status without a cited list, or toxicity from AI or community sources. The seed has 73 container-friendly taxa. Their trait values are **AI drafts marked `needs_review`** under a source that says so; curators replace them (§18.5 F3). GBIF keys stay `null` until matched; they are never guessed.
2. **Toxicity and invasive status only from cited sources.** Pet toxicity comes from ASPCA plant entries, transcribed and still marked `needs_review`, with a per-plant link where one exists. Plants without a source have no toxicity assertion, which means unknown. _Lantana camara_ is `INVASIVE_LISTED` for India (GRIIS India) and Australia (Weeds of National Significance). The engine treats an unreviewed "non-toxic" listing as still needing a check, and treats any "toxic" listing as toxic.
3. **Sun Hours Finder in the domain package** (`sunhours.ts`). The obstruction horizon uses 72 bins of 5°. Walls and overhangs use a profile-angle model. Days run from local midnight to local midnight on real instants, so DST days are 23 or 25 hours. A flat horizon counts the sun from upper-limb sunrise, matching published sunrise times. Monthly profiles use the 21st of each month. Light classes follow common extension definitions (full sun ≥ 6 h, part sun 3–6 h), and PlantPal splits shade at 1 h. The computation runs inline: about 9,000 sun positions per profile take a few milliseconds, so the Web Worker suggested in §6.2 is unnecessary for now. The phone horizon scan (compass and camera) is deferred until an offline magnetic declination model is in place.
4. **Eligibility engine** (`eligibility.ts`). Hard rules E1–E7 set the status (`ELIGIBLE`, `NEEDS_INPUT`, `EXCLUDED`). Findings carry i18n codes, parameters and source ids. The soft score (goals, effort, light comfort; weights adjustable) ranks only eligible plants and never changes a status. The greedy starter-set builder allows at most two plants per family. Unknown light, unknown climate and an unknown water plan for covered spaces give `NEEDS_INPUT`, never a pass. Growing months and sowing windows follow hemisphere and latitude; the tropics use all months for light. Property tests cover monotonic safety, light 0, unknowns, stability under reordering, and the diversity constraint.
5. **Climate inputs.** The client and Worker build a climate profile from the last ten complete years of ERA5 reanalysis (Open-Meteo archive), plus one earlier year so northern July–June frost seasons are complete. The profile gives hardiness from the mean annual extreme minimum, 50th and 90th percentile frost dates, season length, hot days (≥ 35 °C) and Köppen class. When it is unavailable, the user's manual answers (frost: none, light or hard; hot summers) map to conservative values labelled `manual`.
6. **Plans are snapshots.** `plan` and `plan_item` (Dexie v3, included in backups) store every candidate's status, findings and flags at the time, plus a fingerprint of the inputs (excluding the month) so a plan can tell when the space or climate changed. Chosen eligible items become `planned` specimens with `catalogTaxonId`, all in one transaction.

## Consequences

- Recommendations are only as good as the draft traits until curators review them; the UI shows a "Draft data" note on every match.
- WCVP native ranges and the WGSRPD level-3 lookup are not imported yet. The garden region is the ISO country from place search; device location without reverse geocoding leaves it unknown, and plants listed as invasive anywhere are then flagged for review.
- Care schedules from plans arrive with the M5 care engine; Today's "next three steps" are derived from the plan meanwhile.
