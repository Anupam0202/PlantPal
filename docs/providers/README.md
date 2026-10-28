# Provider registry status

Snapshot for PlantPal v4, M3 (28 October 2026). Limits and terms come from the master prompt's October 2026 research (§15.3) and **must be re-verified before launch**.

| Provider                        | Adapter                    | Contract tests                                                    | Live check |
| ------------------------------- | -------------------------- | ----------------------------------------------------------------- | ---------- |
| Open-Meteo Forecast             | `openMeteo/forecast.ts`    | URL, units, nearest valid hour (L11), nulls, shape                | NOT_RUN    |
| Open-Meteo Air Quality (CAMS)   | `openMeteo/air.ts`         | pollutants, pollen coverage outside Europe                        | NOT_RUN    |
| Open-Meteo Elevation            | `openMeteo/elevation.ts`   | missing → unknown, not 0 m (L11)                                  | NOT_RUN    |
| Open-Meteo Geocoding            | `openMeteo/geocoding.ts`   | both hemispheres, empty results                                   | NOT_RUN    |
| Open-Meteo Historical           | `openMeteo/history.ts`     | 1991–2020 request, units, normals/hardiness input                 | NOT_RUN    |
| Open-Meteo Climate (HighResMIP) | `openMeteo/history.ts`     | 1950–2050 only, no scenario parameter, per-model split (L08)      | NOT_RUN    |
| NASA POWER climatology          | `nasaPower/climatology.ts` | fill values, kWh → MJ conversion                                  | NOT_RUN    |
| GBIF occurrences                | `gbif/occurrences.ts`      | true radius (`geoDistance`), open licences, records vs taxa (L10) | NOT_RUN    |

**Why NOT_RUN:** the build sandbox blocks outbound requests to every provider host. All tests use synthetic fixtures shaped like each provider's documented JSON (`packages/providers/src/fixtures`). They prove our parsing, validation, rounding, caching and failure handling, not the providers' current behaviour.

**To verify live** (any machine with internet access): set `PROVIDERS = "live"` in `apps/api/wrangler.toml` (or unset `VITE_PROVIDERS` and `VITE_API_BASE_URL` to use direct mode), open Today for a garden with a location, and check Settings › Data sources. Record the date, provider responses and any differences here.

## Attribution shown in the app

- Weather, air quality, elevation, geocoding, historical and climate data: "Weather data by Open-Meteo.com" (CC BY 4.0; the free API is for non-commercial use — a commercial launch needs a paid plan or self-hosting).
- Solar climatology: "Solar data from the NASA Langley Research Center POWER Project".
- Occurrences: "Occurrence data via GBIF.org", filtered to CC0 and CC BY datasets.
