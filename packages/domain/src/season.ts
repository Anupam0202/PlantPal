import type { MonthlyNormal } from './climate';

/**
 * Season model (§6.15, S18): seasons come from the climate class, hemisphere and the
 * monsoon, not from the Northern-Hemisphere calendar. Sowing windows come from monthly climatology.
 */

export type SeasonModel =
  'temperate' | 'cold' | 'mediterranean' | 'monsoon' | 'tropical-wet' | 'tropical-wet-dry' | 'arid';

export interface Season {
  key: string;
  /** Months, 0 = January. */
  months: number[];
}

/**
 * Season model from the Köppen–Geiger class. South Asia's wet summers (Aw, Am, Cwa, BSh near the
 * subcontinent, or the user's "monsoon" answer) use the monsoon model with Zaid, Kharif and Rabi.
 */
export function seasonModel(
  koppen: string | null,
  opts: { monsoon?: boolean | null; lat?: number | null; lon?: number | null } = {},
): SeasonModel | null {
  const southAsia =
    opts.lat != null && opts.lon != null && opts.lat > 5 && opts.lat < 35 && opts.lon > 60 && opts.lon < 98;
  if (opts.monsoon === true || (southAsia && koppen !== null && /^(Aw|Am|Cw|BSh)/.test(koppen)))
    return 'monsoon';
  if (!koppen) return null;
  if (koppen.startsWith('Af')) return 'tropical-wet';
  // Tropical highlands (Nairobi, Bogotá): temperate by temperature, but seasons follow the rains.
  if (koppen.startsWith('C') && opts.lat != null && Math.abs(opts.lat) < 15) return 'tropical-wet-dry';
  if (koppen.startsWith('A')) return 'tropical-wet-dry';
  if (koppen.startsWith('B')) return 'arid';
  if (koppen.startsWith('Cs')) return 'mediterranean';
  if (koppen.startsWith('C')) return 'temperate';
  return 'cold';
}

const shift = (months: number[], south: boolean) => (south ? months.map((m) => (m + 6) % 12) : months);

/** Named seasons for a model and hemisphere. */
export function seasonsFor(model: SeasonModel, hemisphere: 'north' | 'south'): Season[] {
  const s = hemisphere === 'south';
  switch (model) {
    case 'monsoon':
      return [
        { key: 'zaid', months: [2, 3, 4] },
        { key: 'kharif', months: [5, 6, 7, 8] },
        { key: 'rabi', months: [9, 10, 11, 0, 1] },
      ];
    case 'mediterranean':
      return [
        { key: 'wetCool', months: shift([10, 11, 0, 1, 2], s) },
        { key: 'spring', months: shift([3, 4], s) },
        { key: 'dryHot', months: shift([5, 6, 7, 8], s) },
        { key: 'autumn', months: shift([9], s) },
      ];
    case 'tropical-wet':
      return [{ key: 'yearRound', months: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] }];
    case 'tropical-wet-dry':
      return [
        { key: 'wet', months: shift([4, 5, 6, 7, 8, 9], s) },
        { key: 'dry', months: shift([10, 11, 0, 1, 2, 3], s) },
      ];
    case 'arid':
      return [
        { key: 'mild', months: shift([10, 11, 0, 1, 2, 3], s) },
        { key: 'hot', months: shift([4, 5, 6, 7, 8, 9], s) },
      ];
    case 'temperate':
    case 'cold':
      return [
        { key: 'spring', months: shift([2, 3, 4], s) },
        { key: 'summer', months: shift([5, 6, 7], s) },
        { key: 'autumn', months: shift([8, 9, 10], s) },
        { key: 'winter', months: shift([11, 0, 1], s) },
      ];
  }
}

export interface SowWindows {
  warm: number[];
  cool: number[];
}

/**
 * Sowing months from monthly climatology: warm-season crops when the month and the next are frost-free
 * on average (mean minimum ≥ 10 °C) and not scorching (mean maximum ≤ 36 °C); cool-season crops when
 * the mean is 6–24 °C and the mean maximum ≤ 32 °C (the tropical Rabi season fits). Null for missing months.
 */
export function sowWindows(months: readonly MonthlyNormal[]): SowWindows | null {
  if (months.length !== 12 || months.some((m) => m.tminC === null || m.tmaxC === null || m.tmeanC === null))
    return null;
  const warm: number[] = [];
  const cool: number[] = [];
  for (let i = 0; i < 12; i++) {
    const m = months[i]!;
    const next = months[(i + 1) % 12]!;
    if ((m.tminC ?? -99) >= 10 && (next.tminC ?? -99) >= 10 && (m.tmaxC ?? 99) <= 36) warm.push(i);
    if ((m.tmeanC ?? 99) >= 6 && (m.tmeanC ?? 99) <= 24 && (m.tmaxC ?? 99) <= 32) cool.push(i);
  }
  return { warm, cool };
}

/** The 90th percentile of daily maximum and 10th percentile of daily minimum, by calendar month. */
export function monthlyExtremes(
  dates: readonly string[],
  tmax: ReadonlyArray<number | null>,
  tmin: ReadonlyArray<number | null>,
): { tmaxP90: Array<number | null>; tminP10: Array<number | null> } {
  const hi: number[][] = Array.from({ length: 12 }, () => []);
  const lo: number[][] = Array.from({ length: 12 }, () => []);
  dates.forEach((d, i) => {
    const m = Number(d.slice(5, 7)) - 1;
    const a = tmax[i];
    const b = tmin[i];
    if (a != null) hi[m]?.push(a);
    if (b != null) lo[m]?.push(b);
  });
  const q = (xs: number[], p: number) => {
    if (xs.length < 60) return null; // about two years of that month at least
    const s = [...xs].sort((a, b) => a - b);
    const idx = (s.length - 1) * p;
    const l = Math.floor(idx);
    const h = Math.ceil(idx);
    return Math.round(((s[l] ?? 0) + ((s[h] ?? 0) - (s[l] ?? 0)) * (idx - l)) * 10) / 10;
  };
  return { tmaxP90: hi.map((xs) => q(xs, 0.9)), tminP10: lo.map((xs) => q(xs, 0.1)) };
}
