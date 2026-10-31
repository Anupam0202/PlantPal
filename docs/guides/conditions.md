# Guide: Environment and conditions

Without internet access, run the web app in demo mode: `VITE_PROVIDERS=mock pnpm --filter @plantpal/web dev` (every value is labelled "Demo data").

1. **Location.** Garden › settings (or create a garden) → "Search for a town or area" → type "Pune" → pick it. The coordinates show as `18.52° N, 73.86° E`, the time zone switches to Asia/Kolkata and the hemisphere to Northern. Try "Sydney": `33.87° S, 151.21° E`, Southern. "Use my location" works too; the exact position stays on the device.
2. **Living Sky.** Today shows a sky that follows the real sun for that place (night, dawn, golden hour, day, dusk), clouds from cloud cover, light rain when it rains (off with reduced motion or low-data mode) and the moon's real phase at night, mirrored in the southern hemisphere. Sunrise and sunset are calculated on the device.
3. **Conditions.** Humidity, wind, rain chance and UV; a 7-day forecast; air quality with the US AQI band; a water outlook (ET₀ and rain for 3 days, with the reminder to check the soil); modelled ground-soil values; elevation and a monthly sun-energy chart.
4. **Provenance.** Every card shows its freshness (up to date, stale, unavailable with Retry, demo). "Source" opens provider, model, the approximate area actually sent (≈ 0.05°), retrieval time and licence.
5. **Resilience.** Block `air-quality-api.open-meteo.com` in devtools: only the air card shows "Unavailable"; everything else keeps working. Unblock and press Retry.
6. **Data sources.** Settings › Data sources lists every provider with licence, attribution and health.
7. **API.** `pnpm --filter @plantpal/api smoke` starts the Worker locally and checks `/api/v1/status`, facts, rate limits, problem responses, the OpenAPI document and the web app.

Automated evidence: 179 unit tests (providers' contracts, deadlines, retries, circuit breaker, stale handling, solar geometry, normals, hardiness, frost dates, Köppen–Geiger for 7 cities, climate deltas), 54 Playwright checks (location search, conditions, privacy of coordinates, per-source failure and retry, southern hemisphere, production CSP, axe), and the Worker smoke test.
