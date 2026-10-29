import { describe, expect, it } from 'vitest';
import {
  climateDeltas,
  climateSummary,
  frostDates,
  hardiness,
  koppen,
  monthlyNormals,
  type DailySeries,
  type MonthlyNormal,
} from '../src/climate';

/** Synthetic daily series: sinusoidal temperatures with the coldest day at `coldDoy`, plus an exact yearly minimum. */
function series(o: {
  from: number;
  to: number;
  meanC: number;
  ampC: number;
  coldDoy: number;
  yearlyMinC?: number;
  precipMm?: number;
  missingEvery?: number;
}): DailySeries {
  const s: DailySeries = { dates: [], tmin: [], tmax: [], precip: [] };
  for (let y = o.from; y <= o.to; y++) {
    const days = (Date.UTC(y + 1, 0, 1) - Date.UTC(y, 0, 1)) / 86_400_000;
    for (let d = 0; d < days; d++) {
      const date = new Date(Date.UTC(y, 0, 1 + d)).toISOString().slice(0, 10);
      const phase = Math.cos(((d - o.coldDoy) / days) * 2 * Math.PI);
      const tmean = o.meanC - o.ampC * phase;
      let tmin = tmean - 4;
      if (o.yearlyMinC !== undefined && d === o.coldDoy) tmin = o.yearlyMinC;
      const missing = o.missingEvery !== undefined && d % o.missingEvery === 0;
      s.dates.push(date);
      s.tmin.push(missing ? null : Math.round(tmin * 10) / 10);
      s.tmax.push(missing ? null : Math.round((tmean + 4) * 10) / 10);
      s.precip.push(missing ? null : (o.precipMm ?? 2));
    }
  }
  return s;
}

const months = (t: number[], p: number[]): MonthlyNormal[] =>
  t.map((x, i) => ({ tmeanC: x, tminC: null, tmaxC: null, precipMm: p[i] ?? null }));

describe('normals', () => {
  it('computes monthly normals with the period and coverage stated', () => {
    const n = monthlyNormals(series({ from: 1991, to: 2020, meanC: 12, ampC: 8, coldDoy: 15 }), 1991, 2020);
    expect(n.period).toBe('1991–2020');
    expect(n.coverage).toBe(1);
    expect(n.months[0]?.tmeanC).toBeLessThan(n.months[6]?.tmeanC ?? 0);
    expect(n.annualMeanC).toBeCloseTo(12, 0);
    expect(n.months[0]?.precipMm).toBe(62);
  });

  it('never counts missing days as dry (S2)', () => {
    const n = monthlyNormals(
      series({ from: 2000, to: 2001, meanC: 10, ampC: 5, coldDoy: 15, missingEvery: 5 }),
      2000,
      2001,
    );
    expect(n.coverage).toBeLessThan(0.85);
    expect(n.months.every((m) => m.precipMm === null)).toBe(true);
    expect(n.annualPrecipMm).toBeNull();
  });
});

describe('L09: hardiness and frost dates', () => {
  it('uses the mean annual extreme minimum, not the coldest monthly mean', () => {
    const s = series({ from: 1991, to: 2020, meanC: 11, ampC: 7, coldDoy: 20, yearlyMinC: -6 });
    const h = hardiness(s, 1991, 2020);
    expect(h).toMatchObject({ meanExtremeMinC: -6, zone: '9a', years: 30 });
    // The coldest monthly mean is ~4 °C; using it would wrongly give zone 10 or warmer.
    expect(monthlyNormals(s, 1991, 2020).months[0]?.tmeanC).toBeGreaterThan(3);
  });

  it('refuses to guess with too little data', () => {
    expect(
      hardiness(series({ from: 2018, to: 2020, meanC: 11, ampC: 7, coldDoy: 20 }), 2018, 2020),
    ).toBeNull();
  });

  it('gives northern frost dates around midwinter in January', () => {
    const f = frostDates(series({ from: 1991, to: 2020, meanC: 9, ampC: 9, coldDoy: 15 }), 'north');
    expect(f?.frostSeasonsPct).toBe(100);
    const [lm] = (f?.lastSpring?.p90 ?? '').split('-').map(Number);
    const [fm] = (f?.firstAutumn?.p10 ?? '').split('-').map(Number);
    expect(lm).toBeGreaterThanOrEqual(2);
    expect(lm).toBeLessThanOrEqual(4);
    expect(fm).toBeGreaterThanOrEqual(11);
  });

  it('S18: southern frost seasons are centred on July, not split across calendar years', () => {
    const f = frostDates(series({ from: 1991, to: 2020, meanC: 9, ampC: 9, coldDoy: 196 }), 'south');
    const [lm] = (f?.lastSpring?.p50 ?? '').split('-').map(Number);
    const [fm] = (f?.firstAutumn?.p50 ?? '').split('-').map(Number);
    expect(lm).toBeGreaterThanOrEqual(8);
    expect(lm).toBeLessThanOrEqual(10);
    expect(fm).toBeGreaterThanOrEqual(5);
    expect(fm).toBeLessThanOrEqual(6);
  });

  it('says frost is rare instead of inventing dates', () => {
    const f = frostDates(series({ from: 1991, to: 2020, meanC: 26, ampC: 3, coldDoy: 15 }), 'north');
    expect(f).toMatchObject({ frostSeasonsPct: 0, lastSpring: null, firstAutumn: null });
  });
});

describe('L09: Köppen–Geiger (Peel et al. 2007)', () => {
  it.each([
    [
      'London',
      'north',
      [5.2, 5.3, 7.6, 9.9, 13.3, 16.5, 18.7, 18.5, 15.7, 12, 8, 5.5],
      [55, 41, 42, 44, 49, 45, 45, 50, 49, 69, 59, 55],
      'Cfb',
    ],
    [
      'Rome',
      'north',
      [7.5, 8.5, 10.7, 13.3, 17.6, 21.5, 24.4, 24.5, 21, 16.8, 11.7, 8.5],
      [67, 73, 58, 81, 53, 34, 19, 37, 73, 113, 111, 81],
      'Csa',
    ],
    [
      'Sydney',
      'south',
      [23, 23, 21.9, 19.4, 16.5, 14.1, 13.3, 14.5, 17, 18.9, 20.5, 22],
      [91, 131, 117, 115, 93, 132, 70, 76, 62, 73, 83, 77],
      'Cfa',
    ],
    [
      'Pune',
      'north',
      [21.4, 23.3, 26.6, 29.3, 30, 27.3, 25.6, 24.9, 25.1, 25.6, 23.2, 21.3],
      [1, 0.3, 3, 13, 40, 170, 190, 130, 130, 85, 30, 5],
      'Aw',
    ],
    [
      'Cairo',
      'north',
      [14, 15.5, 17.8, 21.5, 25, 27.4, 28, 28, 26.3, 23.7, 19.2, 15.5],
      [5, 4, 4, 1, 0.5, 0, 0, 0, 0, 1, 3, 6],
      'BWh',
    ],
    [
      'Singapore',
      'north',
      [26.5, 27.1, 27.5, 27.9, 28.3, 28.3, 27.9, 27.9, 27.6, 27.6, 27, 26.4],
      [234, 115, 170, 154, 171, 133, 155, 148, 141, 156, 255, 288],
      'Af',
    ],
    [
      'Moscow',
      'north',
      [-6.5, -6.7, -1, 6.7, 13.2, 17, 19.2, 17, 11.3, 5.6, -1.2, -5.2],
      [52, 41, 35, 37, 49, 80, 85, 82, 68, 71, 55, 52],
      'Dfb',
    ],
  ] as const)('%s → %s', (_name, hemi, t, p, expected) => {
    expect(koppen(months([...t], [...p]), hemi)).toBe(expected);
  });

  it('returns null rather than guessing with missing months', () => {
    const m = months([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
    m[3] = { tmeanC: null, tminC: null, tmaxC: null, precipMm: null };
    expect(koppen(m, 'north')).toBeNull();
  });
});

describe('L08: climate deltas', () => {
  const model = (name: string, warming: number, wetter: number) => {
    const base = series({ from: 1991, to: 2020, meanC: 20, ampC: 5, coldDoy: 15, precipMm: 2 });
    const fut = series({
      from: 2031,
      to: 2050,
      meanC: 20 + warming,
      ampC: 5,
      coldDoy: 15,
      precipMm: 2 * (1 + wetter),
    });
    return {
      model: name,
      series: {
        dates: [...base.dates, ...fut.dates],
        tmin: [...base.tmin, ...fut.tmin],
        tmax: [...base.tmax, ...fut.tmax],
        precip: [...base.precip, ...fut.precip],
      },
    };
  };

  it('compares each model with its own baseline and reports a multi-model range', () => {
    const d = climateDeltas([model('A', 0.8, 0.05), model('B', 1.2, -0.02), model('C', 1.6, 0.1)]);
    expect(d.baseline).toBe('1991–2020');
    expect(d.future).toBe('2031–2050');
    expect(d.dTmeanC).toEqual({ min: 0.8, median: 1.2, max: 1.6 });
    expect(d.dPrecipPct?.min).toBeCloseTo(-2, 0);
    expect(d.dPrecipPct?.max).toBeCloseTo(10, 0);
    expect(d.note).toMatch(/no emission scenario/);
  });

  it('rejects years outside 1950–2050 and drops models with poor coverage', () => {
    expect(() => climateDeltas([], [1991, 2020], [2071, 2090])).toThrow(RangeError);
    const thin = model('Thin', 1, 0);
    thin.series.tmin = thin.series.tmin.map((v, i) => (i % 3 === 0 ? null : v));
    expect(climateDeltas([thin, model('Ok', 1, 0)]).models).toEqual(['Ok']);
  });
});

describe('climateSummary', () => {
  it('southern hemisphere: frost season wraps the new year and hot summers are counted', () => {
    // Coldest in mid-July (day 196), warmest in January.
    const s = series({ from: 2015, to: 2025, meanC: 17, ampC: 16, coldDoy: 196 });
    const c = climateSummary(s, 2016, 2025, 'south');
    expect(c.period).toBe('2016–2025');
    expect(c.frost?.frostSeasonsPct).toBe(100);
    // Frost-free season runs from late spring (Sep–Oct) to autumn (May–June) the next year.
    expect(c.seasonDays).toBeGreaterThan(200);
    expect(c.seasonDays).toBeLessThan(330);
    expect(c.hotSummers).toBe(true);
    expect(c.koppen).not.toBeNull();
  });

  it('frost-free places get a 365-day season; too few years give null, not a guess', () => {
    const warm = climateSummary(
      series({ from: 2015, to: 2025, meanC: 26, ampC: 4, coldDoy: 15 }),
      2016,
      2025,
      'north',
    );
    expect(warm.seasonDays).toBe(365);
    const short = climateSummary(
      series({ from: 2022, to: 2025, meanC: 10, ampC: 9, coldDoy: 15 }),
      2022,
      2025,
      'north',
    );
    expect(short.extremeMinC).toBeNull();
    expect(short.seasonDays).toBeNull();
    expect(short.koppen).toBeNull();
  });
});
