/**
 * Synthetic responses shaped exactly like the providers' documented JSON. Used for tests, for the
 * labelled "Demo data" mode, and to intercept requests in browser tests. Values are plausible, not real.
 */
const pad = (n: number) => String(n).padStart(2, '0');

function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export interface ForecastFixtureOptions {
  lat?: number;
  lon?: number;
  start?: string;
  timezone?: string;
  utcOffsetSeconds?: number;
  /** Hour of `start` used as "now" for the current block. */
  currentHour?: number;
  /** Replace some hourly values with null (simulates a model gap). */
  nullSoilAfterHour?: number;
  units?: Partial<Record<string, string>>;
}

export function forecastFixture(o: ForecastFixtureOptions = {}) {
  const start = o.start ?? '2026-10-28';
  const offset = o.utcOffsetSeconds ?? 19800;
  const currentHour = o.currentHour ?? 14;
  const hours = 7 * 24;
  const time: string[] = [];
  const temp: number[] = [];
  const pp: number[] = [];
  const precip: number[] = [];
  const cloud: number[] = [];
  const code: number[] = [];
  const uv: number[] = [];
  const et0: number[] = [];
  const vpd: number[] = [];
  const sw: number[] = [];
  const soilT: Array<number | null> = [];
  const soilM: Array<number | null> = [];
  for (let i = 0; i < hours; i++) {
    const day = Math.floor(i / 24);
    const h = i % 24;
    time.push(`${addDays(start, day)}T${pad(h)}:00`);
    const diurnal = Math.sin(((h - 8) / 24) * 2 * Math.PI);
    temp.push(round1(25 + 6 * diurnal - day * 0.3));
    const rainy = day === 3 || day === 4;
    pp.push(rainy ? 70 : 10);
    precip.push(rainy && h > 13 && h < 18 ? 1.2 : 0);
    cloud.push(rainy ? 90 : 25);
    code.push(rainy ? 61 : h > 6 && h < 18 ? 1 : 0);
    const sun = Math.max(0, Math.sin(((h - 6) / 12) * Math.PI));
    uv.push(round1(sun * (rainy ? 3 : 8)));
    sw.push(Math.round(sun * (rainy ? 250 : 750)));
    et0.push(round1(sun * 0.45));
    vpd.push(round1(0.6 + 1.4 * Math.max(0, diurnal)));
    const gap = o.nullSoilAfterHour !== undefined && i >= o.nullSoilAfterHour;
    soilT.push(gap ? null : round1(24 + 3 * diurnal));
    soilM.push(gap ? null : 0.21);
  }
  const days = Array.from({ length: 7 }, (_, d) => addDays(start, d));
  const dayIdx = (d: number) => Array.from({ length: 24 }, (_, h) => d * 24 + h);
  const max = (arr: number[], d: number) => Math.max(...dayIdx(d).map((i) => arr[i] ?? 0));
  const min = (arr: number[], d: number) => Math.min(...dayIdx(d).map((i) => arr[i] ?? 0));
  const sum = (arr: number[], d: number) => round1(dayIdx(d).reduce((s, i) => s + (arr[i] ?? 0), 0));
  const units = {
    time: 'iso8601',
    temperature_2m: '°C',
    apparent_temperature: '°C',
    precipitation: 'mm',
    wind_speed_10m: 'km/h',
    wind_gusts_10m: 'km/h',
    ...o.units,
  };
  const ci = currentHour;
  return {
    latitude: o.lat ?? 18.5,
    longitude: o.lon ?? 73.875,
    generationtime_ms: 0.9,
    utc_offset_seconds: offset,
    timezone: o.timezone ?? 'Asia/Kolkata',
    timezone_abbreviation: 'GMT+5:30',
    elevation: 559,
    current_units: {
      ...units,
      interval: 'seconds',
      relative_humidity_2m: '%',
      is_day: '',
      weather_code: 'wmo code',
      cloud_cover: '%',
      wind_direction_10m: '°',
    },
    current: {
      time: `${start}T${pad(currentHour)}:15`,
      interval: 900,
      temperature_2m: temp[ci],
      relative_humidity_2m: 48,
      apparent_temperature: round1((temp[ci] ?? 25) + 1.4),
      is_day: currentHour > 6 && currentHour < 18 ? 1 : 0,
      precipitation: 0,
      weather_code: code[ci],
      cloud_cover: cloud[ci],
      wind_speed_10m: 11.2,
      wind_direction_10m: 285,
      wind_gusts_10m: 24.5,
    },
    hourly_units: {
      time: 'iso8601',
      temperature_2m: '°C',
      precipitation_probability: '%',
      precipitation: 'mm',
      cloud_cover: '%',
      weather_code: 'wmo code',
      uv_index: '',
      et0_fao_evapotranspiration: 'mm',
      vapour_pressure_deficit: 'kPa',
      shortwave_radiation: 'W/m²',
      soil_temperature_6cm: '°C',
      soil_moisture_3_to_9cm: 'm³/m³',
    },
    hourly: {
      time,
      temperature_2m: temp,
      precipitation_probability: pp,
      precipitation: precip,
      cloud_cover: cloud,
      weather_code: code,
      uv_index: uv,
      et0_fao_evapotranspiration: et0,
      vapour_pressure_deficit: vpd,
      shortwave_radiation: sw,
      soil_temperature_6cm: soilT,
      soil_moisture_3_to_9cm: soilM,
    },
    daily_units: {
      time: 'iso8601',
      weather_code: 'wmo code',
      temperature_2m_max: '°C',
      temperature_2m_min: '°C',
      precipitation_sum: 'mm',
      precipitation_probability_max: '%',
      sunrise: 'iso8601',
      sunset: 'iso8601',
      daylight_duration: 's',
      sunshine_duration: 's',
      uv_index_max: '',
      et0_fao_evapotranspiration: 'mm',
    },
    daily: {
      time: days,
      weather_code: days.map((_, d) => (d === 3 || d === 4 ? 61 : 1)),
      temperature_2m_max: days.map((_, d) => max(temp, d)),
      temperature_2m_min: days.map((_, d) => min(temp, d)),
      precipitation_sum: days.map((_, d) => sum(precip, d)),
      precipitation_probability_max: days.map((_, d) => max(pp, d)),
      sunrise: days.map((d) => `${d}T06:38`),
      sunset: days.map((d) => `${d}T18:06`),
      daylight_duration: days.map(() => 41_040),
      sunshine_duration: days.map((_, d) => (d === 3 || d === 4 ? 9_000 : 34_200)),
      uv_index_max: days.map((_, d) => max(uv, d)),
      et0_fao_evapotranspiration: days.map((_, d) => sum(et0, d)),
    },
  };
}

export function airFixture(o: { europe?: boolean; start?: string; currentHour?: number } = {}) {
  const pollen = (v: number) => (o.europe ? v : null);
  return {
    latitude: 18.5,
    longitude: 73.9,
    generationtime_ms: 0.4,
    utc_offset_seconds: 19800,
    timezone: 'Asia/Kolkata',
    timezone_abbreviation: 'GMT+5:30',
    elevation: 559,
    current_units: {
      time: 'iso8601',
      interval: 'seconds',
      us_aqi: 'USAQI',
      european_aqi: 'EAQI',
      pm2_5: 'μg/m³',
      pm10: 'μg/m³',
      ozone: 'μg/m³',
      nitrogen_dioxide: 'μg/m³',
      alder_pollen: 'grains/m³',
      birch_pollen: 'grains/m³',
      grass_pollen: 'grains/m³',
      mugwort_pollen: 'grains/m³',
      olive_pollen: 'grains/m³',
      ragweed_pollen: 'grains/m³',
    },
    current: {
      time: `${o.start ?? '2026-10-28'}T${pad(o.currentHour ?? 14)}:00`,
      interval: 3600,
      us_aqi: 87,
      european_aqi: 42,
      pm2_5: 29.6,
      pm10: 51.3,
      ozone: 92,
      nitrogen_dioxide: 14.8,
      alder_pollen: pollen(0),
      birch_pollen: pollen(0),
      grass_pollen: pollen(3.2),
      mugwort_pollen: pollen(0.4),
      olive_pollen: pollen(0),
      ragweed_pollen: pollen(1.1),
    },
  };
}

export const elevationFixture = (m: number | null = 559) => ({ elevation: [m === null ? Number.NaN : m] });

export const geocodingFixture = {
  results: [
    {
      id: 1259229,
      name: 'Pune',
      latitude: 18.51957,
      longitude: 73.85535,
      elevation: 560,
      feature_code: 'PPLA2',
      country_code: 'IN',
      admin1_id: 1264418,
      timezone: 'Asia/Kolkata',
      population: 2935744,
      country_id: 1269750,
      country: 'India',
      admin1: 'Maharashtra',
    },
    {
      id: 2147714,
      name: 'Sydney',
      latitude: -33.86785,
      longitude: 151.20732,
      elevation: 58,
      feature_code: 'PPLA',
      country_code: 'AU',
      timezone: 'Australia/Sydney',
      population: 4627345,
      country: 'Australia',
      admin1: 'New South Wales',
    },
  ],
  generationtime_ms: 1.2,
};

export function solarFixture(o: { units?: string; fillJan?: boolean } = {}) {
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const all = [19.8, 22.3, 24.6, 25.9, 25.1, 16.9, 13.4, 13.8, 17.2, 19.6, 19.1, 18.6];
  const clr = [21.2, 24.1, 27.0, 29.1, 29.8, 29.6, 29.5, 29.0, 27.4, 24.6, 21.9, 20.6];
  const row = (vals: number[]) => {
    const r: Record<string, number> = Object.fromEntries(months.map((m, i) => [m, vals[i] ?? 0]));
    if (o.fillJan) r.JAN = -999;
    r.ANN = Math.round((vals.reduce((a, b) => a + b, 0) / 12) * 100) / 100;
    return r;
  };
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [73.9, 18.5, 581.2] },
    properties: { parameter: { ALLSKY_SFC_SW_DWN: row(all), CLRSKY_SFC_SW_DWN: row(clr) } },
    header: {
      title: 'NASA/POWER Climatology',
      api: { version: 'v2.8.0', name: 'POWER Climatology API' },
      fill_value: -999,
      start: '2001',
      end: '2020',
    },
    messages: [],
    parameters: {
      ALLSKY_SFC_SW_DWN: {
        units: o.units ?? 'MJ/m^2/day',
        longname: 'All Sky Surface Shortwave Downward Irradiance',
      },
      CLRSKY_SFC_SW_DWN: {
        units: o.units ?? 'MJ/m^2/day',
        longname: 'Clear Sky Surface Shortwave Downward Irradiance',
      },
    },
  };
}

/** Daily archive/climate-shaped data built from a seasonal curve (for adapter and climate tests). */
export function dailyFixture(o: {
  from: number;
  to: number;
  models?: readonly string[];
  warmingPerDecade?: number;
  units?: string;
  /** Annual mean, seasonal amplitude and half the day–night range, °C (defaults: a mild temperate curve). */
  mean?: number;
  amplitude?: number;
  diurnal?: number;
}) {
  const time: string[] = [];
  const base: Record<string, number[]> = { tmax: [], tmin: [], precip: [] };
  for (let y = o.from; y <= o.to; y++) {
    const days = (Date.UTC(y + 1, 0, 1) - Date.UTC(y, 0, 1)) / 86_400_000;
    for (let d = 0; d < days; d++) {
      time.push(new Date(Date.UTC(y, 0, 1 + d)).toISOString().slice(0, 10));
      const t =
        (o.mean ?? 15) -
        (o.amplitude ?? 9) * Math.cos(((d - 15) / days) * 2 * Math.PI) +
        ((y - o.from) / 10) * (o.warmingPerDecade ?? 0);
      const diurnal = o.diurnal ?? 5;
      base.tmax?.push(Math.round((t + diurnal) * 10) / 10);
      base.tmin?.push(Math.round((t - diurnal) * 10) / 10);
      base.precip?.push(d % 4 === 0 ? 6 : 0);
    }
  }
  const units = {
    time: 'iso8601',
    temperature_2m_max: o.units ?? '°C',
    temperature_2m_min: o.units ?? '°C',
    precipitation_sum: 'mm',
  };
  if (!o.models) {
    return {
      latitude: 51.5,
      longitude: -0.1,
      daily_units: units,
      daily: {
        time,
        temperature_2m_max: base.tmax,
        temperature_2m_min: base.tmin,
        precipitation_sum: base.precip,
      },
    };
  }
  const daily: Record<string, unknown> = { time };
  o.models.forEach((m, i) => {
    daily[`temperature_2m_max_${m}`] = base.tmax?.map((v) => Math.round((v + i * 0.3) * 10) / 10);
    daily[`temperature_2m_min_${m}`] = base.tmin?.map((v) => Math.round((v + i * 0.3) * 10) / 10);
    daily[`precipitation_sum_${m}`] = base.precip;
  });
  return { latitude: 51.5, longitude: -0.1, daily_units: units, daily };
}

export const gbifNearbyFixture = {
  offset: 0,
  limit: 0,
  endOfRecords: false,
  count: 18342,
  results: [],
  facets: [
    {
      field: 'SPECIES_KEY',
      counts: [
        { name: '2480528', count: 1204 },
        { name: '9809229', count: 811 },
        { name: '5229490', count: 640 },
        { name: '2493091', count: 402 },
      ],
    },
  ],
};

/** Backbone matches for a few names; anything else returns `NONE` like the real API. */
const GBIF_NAMES: Record<string, { key: number; family: string; canonical: string; author: string }> = {
  'ocimum basilicum': { key: 2927096, family: 'Lamiaceae', canonical: 'Ocimum basilicum', author: 'L.' },
  'ocimum tenuiflorum': { key: 2927094, family: 'Lamiaceae', canonical: 'Ocimum tenuiflorum', author: 'L.' },
  'solanum lycopersicum': {
    key: 2930137,
    family: 'Solanaceae',
    canonical: 'Solanum lycopersicum',
    author: 'L.',
  },
  'mentha spicata': { key: 2927233, family: 'Lamiaceae', canonical: 'Mentha spicata', author: 'L.' },
  'epipremnum aureum': {
    key: 2868323,
    family: 'Araceae',
    canonical: 'Epipremnum aureum',
    author: '(Linden & André) G.S.Bunting',
  },
  'tagetes erecta': { key: 3088958, family: 'Asteraceae', canonical: 'Tagetes erecta', author: 'L.' },
  'salvia hispanica': { key: 2927324, family: 'Lamiaceae', canonical: 'Salvia hispanica', author: 'L.' },
};

export function speciesMatchFixture(name: string) {
  const hit = GBIF_NAMES[name.trim().toLowerCase().split(/\s+/).slice(0, 2).join(' ')];
  if (!hit) return { confidence: 100, matchType: 'NONE', synonym: false };
  return {
    usageKey: hit.key,
    scientificName: `${hit.canonical} ${hit.author}`,
    canonicalName: hit.canonical,
    rank: 'SPECIES',
    status: 'ACCEPTED',
    confidence: 98,
    matchType: 'EXACT',
    kingdom: 'Plantae',
    family: hit.family,
    synonym: false,
  };
}

export function commonsFixture(name: string) {
  const file = name.trim().replace(/\s+/g, '_');
  return {
    batchcomplete: '',
    query: {
      pages: {
        '101': {
          pageid: 101,
          ns: 6,
          title: `File:${file}_leaves.jpg`,
          index: 1,
          imageinfo: [
            {
              thumburl: `https://upload.wikimedia.org/wikipedia/commons/thumb/a/a1/${file}_leaves.jpg/640px-${file}_leaves.jpg`,
              descriptionurl: `https://commons.wikimedia.org/wiki/File:${file}_leaves.jpg`,
              mime: 'image/jpeg',
              extmetadata: {
                LicenseShortName: { value: 'CC BY-SA 4.0' },
                LicenseUrl: { value: 'https://creativecommons.org/licenses/by-sa/4.0' },
                Artist: { value: '<a href="//commons.wikimedia.org/wiki/User:Example">Example Botanist</a>' },
              },
            },
          ],
        },
        '102': {
          pageid: 102,
          ns: 6,
          title: `File:${file}_flower.jpg`,
          index: 2,
          imageinfo: [
            {
              thumburl: `https://upload.wikimedia.org/wikipedia/commons/thumb/b/b2/${file}_flower.jpg/640px-${file}_flower.jpg`,
              descriptionurl: `https://commons.wikimedia.org/wiki/File:${file}_flower.jpg`,
              mime: 'image/jpeg',
              extmetadata: {
                LicenseShortName: { value: 'CC BY-NC 2.0' },
                Artist: { value: 'Not reusable here' },
              },
            },
          ],
        },
      },
    },
  };
}

export function wikidataSearchFixture(gbifKey: number) {
  const known = Object.values(GBIF_NAMES).some((n) => n.key === gbifKey);
  return { batchcomplete: '', query: { search: known ? [{ ns: 0, title: `Q${gbifKey % 100000}` }] : [] } };
}

export function wikidataLabelsFixture(qid: string) {
  return {
    entities: {
      [qid]: {
        labels: {
          en: { language: 'en', value: 'basil' },
          hi: { language: 'hi', value: 'तुलसी' },
          es: { language: 'es', value: 'albahaca' },
        },
        aliases: {
          en: [
            { language: 'en', value: 'sweet basil' },
            { language: 'en', value: 'Ocimum basilicum' },
          ],
        },
      },
    },
  };
}
