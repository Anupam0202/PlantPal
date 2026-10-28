/**
 * Climate computations on daily series (S7). Every result states its period, method and coverage.
 * Inputs come from reanalysis (Open-Meteo Historical, ERA5) or CMIP6 HighResMIP (Open-Meteo Climate).
 */

export interface DailySeries {
  /** `YYYY-MM-DD`, one per day. */
  dates: string[];
  tmin: Array<number | null>;
  tmax: Array<number | null>;
  precip: Array<number | null>;
}

export interface MonthlyNormal {
  /** Mean daily temperature (°C), as (tmin + tmax) / 2. */
  tmeanC: number | null;
  tminC: number | null;
  tmaxC: number | null;
  /** Mean monthly precipitation total (mm). */
  precipMm: number | null;
}

export interface Normals {
  period: string;
  years: number;
  /** Share of days with complete data (0–1). */
  coverage: number;
  months: MonthlyNormal[];
  annualMeanC: number | null;
  annualPrecipMm: number | null;
}

const mean = (xs: number[]) => (xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0) / xs.length);
const round = (x: number | null, d = 1) => (x === null ? null : Math.round(x * 10 ** d) / 10 ** d);

function yearOf(d: string) {
  return Number(d.slice(0, 4));
}
function monthOf(d: string) {
  return Number(d.slice(5, 7)) - 1;
}

/**
 * Monthly normals for `[startYear, endYear]`. Month-years with less than 90 % of days present are left
 * out of the precipitation totals rather than counted as dry (S2).
 */
export function monthlyNormals(s: DailySeries, startYear: number, endYear: number): Normals {
  const tmins: number[][] = Array.from({ length: 12 }, () => []);
  const tmaxs: number[][] = Array.from({ length: 12 }, () => []);
  const precipByMonthYear = new Map<string, { sum: number; n: number; days: number }>();
  let total = 0;
  let complete = 0;
  for (let i = 0; i < s.dates.length; i++) {
    const d = s.dates[i] ?? '';
    const y = yearOf(d);
    if (y < startYear || y > endYear) continue;
    total++;
    const m = monthOf(d);
    const lo = s.tmin[i];
    const hi = s.tmax[i];
    const p = s.precip[i];
    if (lo != null && hi != null && p != null) complete++;
    if (lo != null) tmins[m]?.push(lo);
    if (hi != null) tmaxs[m]?.push(hi);
    const key = `${y}-${m}`;
    const cur = precipByMonthYear.get(key) ?? {
      sum: 0,
      n: 0,
      days: new Date(Date.UTC(y, m + 1, 0)).getUTCDate(),
    };
    if (p != null) {
      cur.sum += p;
      cur.n++;
    }
    precipByMonthYear.set(key, cur);
  }
  const months: MonthlyNormal[] = Array.from({ length: 12 }, (_, m) => {
    const tmin = mean(tmins[m] ?? []);
    const tmax = mean(tmaxs[m] ?? []);
    const totals = [...precipByMonthYear.entries()]
      .filter(([k, v]) => Number(k.split('-')[1]) === m && v.n >= 0.9 * v.days)
      .map(([, v]) => v.sum);
    return {
      tminC: round(tmin),
      tmaxC: round(tmax),
      tmeanC: tmin !== null && tmax !== null ? round((tmin + tmax) / 2) : null,
      precipMm: round(mean(totals)),
    };
  });
  const tmeans = months.map((m) => m.tmeanC);
  const precips = months.map((m) => m.precipMm);
  return {
    period: `${startYear}–${endYear}`,
    years: endYear - startYear + 1,
    coverage: total === 0 ? 0 : complete / total,
    months,
    annualMeanC: tmeans.every((x) => x !== null) ? round(mean(tmeans as number[])) : null,
    annualPrecipMm: precips.every((x) => x !== null)
      ? round(
          (precips as number[]).reduce((a, b) => a + b, 0),
          0,
        )
      : null,
  };
}

/**
 * USDA-style hardiness zone from the **mean annual extreme minimum** temperature (L09) — not from the
 * coldest monthly mean, which overstates hardiness by several zones.
 */
export function hardiness(
  s: DailySeries,
  startYear: number,
  endYear: number,
): { meanExtremeMinC: number; zone: string; years: number } | null {
  const minByYear = new Map<number, { min: number; n: number }>();
  for (let i = 0; i < s.dates.length; i++) {
    const v = s.tmin[i];
    const y = yearOf(s.dates[i] ?? '');
    if (v == null || y < startYear || y > endYear) continue;
    const cur = minByYear.get(y) ?? { min: Number.POSITIVE_INFINITY, n: 0 };
    cur.min = Math.min(cur.min, v);
    cur.n++;
    minByYear.set(y, cur);
  }
  // Only years with at least 330 observed days count; a year missing its winter would look mild.
  const mins = [...minByYear.values()].filter((v) => v.n >= 330).map((v) => v.min);
  // Extremes need many years; USDA maps use 30. Fewer than 10 years is not a climate statistic.
  if (mins.length < 10) return null;
  const c = mean(mins) ?? 0;
  const f = (c * 9) / 5 + 32;
  const idx = Math.floor((f + 60) / 5); // half-zones of 5 °F starting at −60 °F
  const clamped = Math.min(Math.max(idx, 0), 25);
  const zone = `${Math.floor(clamped / 2) + 1}${clamped % 2 === 0 ? 'a' : 'b'}`;
  return { meanExtremeMinC: Math.round(c * 10) / 10, zone, years: mins.length };
}

export interface FrostDates {
  thresholdC: number;
  years: number;
  /** Share of seasons with at least one frost. */
  frostSeasonsPct: number;
  /** `MM-DD`; after this date there was no frost in 50 % / 90 % of seasons. Null when frost is rare. */
  lastSpring: { p50: string; p90: string } | null;
  /** `MM-DD`; frost had already arrived by this date in 10 % / 50 % of seasons. */
  firstAutumn: { p10: string; p50: string } | null;
}

const REF_YEAR = 2001; // non-leap reference year for day offsets

function mmdd(dayOfRefYear: number): string {
  const d = new Date(Date.UTC(REF_YEAR, 0, 1 + (((dayOfRefYear % 365) + 365) % 365)));
  return `${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function percentile(sorted: number[], p: number): number {
  const i = (sorted.length - 1) * p;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return (sorted[lo] ?? 0) + ((sorted[hi] ?? 0) - (sorted[lo] ?? 0)) * (i - lo);
}

/**
 * Probabilistic frost dates (L09). Seasons run from the warmest part of the year to the next, so a
 * winter is never split across calendar years: 1 July in the northern hemisphere, 1 January in the
 * southern (S18). Frost = daily minimum ≤ `thresholdC`.
 */
export function frostDates(s: DailySeries, hemisphere: 'north' | 'south', thresholdC = 0): FrostDates | null {
  const startMonth = hemisphere === 'north' ? 6 : 0; // July or January
  const seasons = new Map<number, { first: number | null; last: number | null; n: number }>();
  for (let i = 0; i < s.dates.length; i++) {
    const d = s.dates[i] ?? '';
    const v = s.tmin[i];
    if (v == null) continue;
    const y = yearOf(d);
    const m = monthOf(d);
    const seasonYear = m >= startMonth ? y : y - 1;
    const seasonStart = Date.UTC(seasonYear, startMonth, 1);
    const offset = Math.round((Date.parse(`${d}T00:00:00Z`) - seasonStart) / 86_400_000);
    const cur = seasons.get(seasonYear) ?? { first: null, last: null, n: 0 };
    cur.n++;
    if (v <= thresholdC) {
      cur.first = cur.first === null ? offset : Math.min(cur.first, offset);
      cur.last = cur.last === null ? offset : Math.max(cur.last, offset);
    }
    seasons.set(seasonYear, cur);
  }
  const full = [...seasons.values()].filter((x) => x.n >= 330);
  if (full.length < 10) return null;
  const withFrost = full.filter((x) => x.first !== null);
  const pct = withFrost.length / full.length;
  const startDoy = Math.round((Date.UTC(REF_YEAR, startMonth, 1) - Date.UTC(REF_YEAR, 0, 1)) / 86_400_000);
  if (pct < 0.1)
    return {
      thresholdC,
      years: full.length,
      frostSeasonsPct: Math.round(pct * 100),
      lastSpring: null,
      firstAutumn: null,
    };
  // Seasons without frost count as "frost ended before the season began" / "never came".
  const lasts = full.map((x) => (x.last === null ? -1 : x.last)).sort((a, b) => a - b);
  const firsts = full.map((x) => (x.first === null ? 400 : x.first)).sort((a, b) => a - b);
  const date = (off: number) => mmdd(startDoy + Math.round(off));
  const p50l = percentile(lasts, 0.5);
  const p90l = percentile(lasts, 0.9);
  const p10f = percentile(firsts, 0.1);
  const p50f = percentile(firsts, 0.5);
  return {
    thresholdC,
    years: full.length,
    frostSeasonsPct: Math.round(pct * 100),
    lastSpring: p90l < 0 ? null : { p50: date(Math.max(0, p50l)), p90: date(p90l) },
    firstAutumn: p10f >= 366 ? null : { p10: date(p10f), p50: date(Math.min(365, p50f)) },
  };
}

/**
 * Köppen–Geiger class (Peel, Finlayson & McMahon 2007) from monthly normals. Summer and winter halves
 * follow the hemisphere (S18).
 */
export function koppen(months: MonthlyNormal[], hemisphere: 'north' | 'south'): string | null {
  if (months.length !== 12 || months.some((m) => m.tmeanC === null || m.precipMm === null)) return null;
  const t = months.map((m) => m.tmeanC as number);
  const p = months.map((m) => m.precipMm as number);
  const mat = t.reduce((a, b) => a + b, 0) / 12;
  const map = p.reduce((a, b) => a + b, 0);
  const thot = Math.max(...t);
  const tcold = Math.min(...t);
  const tmon10 = t.filter((x) => x > 10).length;
  const pdry = Math.min(...p);
  const summerIdx = hemisphere === 'north' ? [3, 4, 5, 6, 7, 8] : [9, 10, 11, 0, 1, 2];
  const winterIdx = hemisphere === 'north' ? [9, 10, 11, 0, 1, 2] : [3, 4, 5, 6, 7, 8];
  const ps = summerIdx.map((i) => p[i] ?? 0);
  const pw = winterIdx.map((i) => p[i] ?? 0);
  const psSum = ps.reduce((a, b) => a + b, 0);
  const pwSum = pw.reduce((a, b) => a + b, 0);
  const psdry = Math.min(...ps);
  const pswet = Math.max(...ps);
  const pwdry = Math.min(...pw);
  const pwwet = Math.max(...pw);
  const pth = pwSum >= 0.7 * map ? 2 * mat : psSum >= 0.7 * map ? 2 * mat + 28 : 2 * mat + 14;

  if (thot < 10) return thot > 0 ? 'ET' : 'EF';
  if (map < 10 * pth) return `B${map < 5 * pth ? 'W' : 'S'}${mat >= 18 ? 'h' : 'k'}`;
  if (tcold >= 18) return pdry >= 60 ? 'Af' : pdry >= 100 - map / 25 ? 'Am' : 'Aw';
  const second = psdry < 40 && psdry < pwwet / 3 ? 's' : pwdry < pswet / 10 ? 'w' : 'f';
  const group = tcold > 0 ? 'C' : 'D';
  let third: string;
  if (thot >= 22) third = 'a';
  else if (tmon10 >= 4) third = 'b';
  else if (group === 'D' && tcold < -38) third = 'd';
  else third = 'c';
  return `${group}${second}${third}`;
}

export interface ModelSeries {
  model: string;
  series: DailySeries;
}

export interface ClimateDelta {
  baseline: string;
  future: string;
  models: string[];
  perModel: Array<{ model: string; dTmeanC: number; dPrecipPct: number | null }>;
  dTmeanC: { min: number; median: number; max: number } | null;
  dPrecipPct: { min: number; median: number; max: number } | null;
  note: string;
}

export const CLIMATE_API_RANGE = { first: 1950, last: 2050 } as const;

function windowMeans(s: DailySeries, from: number, to: number) {
  const temps: number[] = [];
  const precipByYear = new Map<number, { sum: number; n: number }>();
  let expected = 0;
  for (let i = 0; i < s.dates.length; i++) {
    const y = yearOf(s.dates[i] ?? '');
    if (y < from || y > to) continue;
    expected++;
    const lo = s.tmin[i];
    const hi = s.tmax[i];
    if (lo != null && hi != null) temps.push((lo + hi) / 2);
    const pr = s.precip[i];
    if (pr != null) {
      const cur = precipByYear.get(y) ?? { sum: 0, n: 0 };
      cur.sum += pr;
      cur.n++;
      precipByYear.set(y, cur);
    }
  }
  const coverage = expected === 0 ? 0 : temps.length / expected;
  const annual = [...precipByYear.values()].filter((v) => v.n >= 330).map((v) => v.sum);
  return { coverage, tmean: mean(temps), precip: mean(annual) };
}

/**
 * Change between two periods, computed **per model against its own baseline** (L08), then summarised
 * as a multi-model range. HighResMIP runs have no emission-scenario choice, so no scenario is named.
 */
export function climateDeltas(
  models: ModelSeries[],
  baseline: [number, number] = [1991, 2020],
  future: [number, number] = [2031, 2050],
): ClimateDelta {
  for (const y of [...baseline, ...future]) {
    if (y < CLIMATE_API_RANGE.first || y > CLIMATE_API_RANGE.last) {
      throw new RangeError(
        `Climate model data covers ${CLIMATE_API_RANGE.first}–${CLIMATE_API_RANGE.last} only`,
      );
    }
  }
  const perModel: ClimateDelta['perModel'] = [];
  for (const { model, series } of models) {
    const b = windowMeans(series, baseline[0], baseline[1]);
    const f = windowMeans(series, future[0], future[1]);
    if (b.coverage < 0.8 || f.coverage < 0.8 || b.tmean === null || f.tmean === null) continue;
    perModel.push({
      model,
      dTmeanC: Math.round((f.tmean - b.tmean) * 100) / 100,
      dPrecipPct:
        b.precip && f.precip !== null ? Math.round(((f.precip - b.precip) / b.precip) * 1000) / 10 : null,
    });
  }
  const summary = (xs: number[]) => {
    if (xs.length === 0) return null;
    const s = [...xs].sort((a, b) => a - b);
    return { min: s[0] ?? 0, median: Math.round(percentile(s, 0.5) * 100) / 100, max: s[s.length - 1] ?? 0 };
  };
  return {
    baseline: `${baseline[0]}–${baseline[1]}`,
    future: `${future[0]}–${future[1]}`,
    models: perModel.map((m) => m.model),
    perModel,
    dTmeanC: summary(perModel.map((m) => m.dTmeanC)),
    dPrecipPct: summary(perModel.flatMap((m) => (m.dPrecipPct === null ? [] : [m.dPrecipPct]))),
    note: 'CMIP6 HighResMIP models; each model compared with its own baseline; no emission scenario is selectable.',
  };
}
