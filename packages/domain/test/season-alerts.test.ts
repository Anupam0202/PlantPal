import { describe, expect, it } from 'vitest';
import { gardenAlerts, type PlantExposure } from '../src/alerts';
import { koppen, type MonthlyNormal } from '../src/climate';
import { monthlyExtremes, seasonModel, seasonsFor, sowWindows } from '../src/season';

const months = (t: number[], p: number[], diurnal: number): MonthlyNormal[] =>
  t.map((tmean, i) => ({
    tmeanC: tmean,
    tminC: tmean - diurnal,
    tmaxC: tmean + diurnal,
    precipMm: p[i] ?? null,
  }));

// Approximate 1991–2020 monthly means (°C) and precipitation (mm).
const CITIES = {
  Pune: {
    lat: 18.52,
    lon: 73.86,
    hemi: 'north',
    t: [21.4, 23.3, 26.6, 29.3, 30, 27.3, 25.6, 24.9, 25.1, 25.6, 23.2, 21.3],
    p: [1, 0.3, 3, 13, 40, 170, 190, 130, 130, 85, 30, 5],
    d: 7,
    koppen: 'Aw',
    model: 'monsoon',
  },
  London: {
    lat: 51.5,
    lon: -0.12,
    hemi: 'north',
    t: [5.2, 5.3, 7.6, 9.9, 13.3, 16.5, 18.7, 18.5, 15.7, 12, 8, 5.5],
    p: [55, 41, 42, 44, 49, 45, 45, 50, 49, 69, 59, 55],
    d: 4,
    koppen: 'Cfb',
    model: 'temperate',
  },
  Sydney: {
    lat: -33.87,
    lon: 151.21,
    hemi: 'south',
    t: [23, 23, 21.9, 19.4, 16.5, 14.1, 13.3, 14.5, 17, 18.9, 20.5, 22],
    p: [91, 131, 117, 115, 93, 132, 70, 76, 62, 73, 83, 77],
    d: 4,
    koppen: 'Cfa',
    model: 'temperate',
  },
  Nairobi: {
    lat: -1.29,
    lon: 36.82,
    hemi: 'south',
    t: [18.6, 19.4, 19.6, 19.3, 18, 16.6, 15.6, 16, 17.6, 18.8, 18.2, 18.1],
    p: [64, 56, 92, 219, 176, 35, 18, 24, 31, 61, 154, 101],
    d: 6,
    koppen: 'Cfb',
    model: 'tropical-wet-dry',
  },
  Minneapolis: {
    lat: 44.98,
    lon: -93.27,
    hemi: 'north',
    t: [-9, -6.4, 0.6, 8.6, 15.3, 20.6, 23.3, 21.9, 17.1, 9.6, 1.4, -6],
    p: [23, 20, 45, 72, 99, 111, 103, 109, 86, 62, 44, 30],
    d: 6,
    koppen: 'Dfa',
    model: 'cold',
  },
  Phoenix: {
    lat: 33.45,
    lon: -112.07,
    hemi: 'north',
    t: [13.6, 15.4, 18.8, 22.6, 27.6, 32.8, 35.4, 34.8, 31.4, 24.8, 17.6, 12.8],
    p: [23, 24, 25, 7, 3, 1, 26, 25, 16, 15, 16, 23],
    d: 7,
    koppen: 'BWh',
    model: 'arid',
  },
  Singapore: {
    lat: 1.35,
    lon: 103.82,
    hemi: 'north',
    t: [26.5, 27.1, 27.5, 27.9, 28.3, 28.3, 27.9, 27.9, 27.6, 27.6, 27, 26.4],
    p: [234, 115, 170, 154, 171, 133, 155, 148, 141, 156, 255, 288],
    d: 4,
    koppen: 'Af',
    model: 'tropical-wet',
  },
} as const;

describe('season model fixtures (§6.15)', () => {
  it.each(Object.entries(CITIES))('%s', (_name, c) => {
    const m = months([...c.t], [...c.p], c.d);
    const k = koppen(m, c.hemi);
    expect(k).toBe(c.koppen);
    expect(seasonModel(k, { lat: c.lat, lon: c.lon })).toBe(c.model);
    expect(seasonsFor(seasonModel(k, { lat: c.lat, lon: c.lon })!, c.hemi).length).toBeGreaterThan(0);
  });

  it('S18: southern summer is December–February', () => {
    const summer = seasonsFor('temperate', 'south').find((s) => s.key === 'summer');
    expect(summer?.months).toEqual([11, 0, 1]);
  });

  it('monsoon seasons are Zaid, Kharif and Rabi', () => {
    expect(seasonsFor('monsoon', 'north').map((s) => s.key)).toEqual(['zaid', 'kharif', 'rabi']);
    expect(seasonModel('Cfb', { monsoon: true })).toBe('monsoon');
  });
});

describe('sowing windows from climatology', () => {
  it('London: warm crops in summer only; cool crops spring to autumn', () => {
    const c = CITIES.London;
    const w = sowWindows(months([...c.t], [...c.p], c.d));
    expect(w?.warm).toEqual([5, 6, 7]);
    expect(w?.cool).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('Pune: cool crops in the Rabi months, warm crops outside the hottest weeks', () => {
    const c = CITIES.Pune;
    const w = sowWindows(months([...c.t], [...c.p], c.d));
    expect(w?.cool).toEqual([0, 1, 10, 11]);
    expect(w?.warm).not.toContain(3);
    expect(w?.warm).not.toContain(4);
  });

  it('Minneapolis: a short warm window; missing months give null', () => {
    const c = CITIES.Minneapolis;
    expect(sowWindows(months([...c.t], [...c.p], c.d))?.warm).toEqual([5, 6, 7]);
    const broken = months([...c.t], [...c.p], c.d);
    broken[2] = { tmeanC: null, tminC: null, tmaxC: null, precipMm: null };
    expect(sowWindows(broken)).toBeNull();
  });

  it('monthly extremes need enough days and give p90 / p10', () => {
    const dates: string[] = [];
    const tmax: number[] = [];
    const tmin: number[] = [];
    for (let y = 2016; y <= 2025; y++)
      for (let d = 1; d <= 31; d++) {
        dates.push(`${y}-07-${String(d).padStart(2, '0')}`);
        tmax.push(30 + (d % 10));
        tmin.push(15 + (d % 10));
      }
    const e = monthlyExtremes(dates, tmax, tmin);
    expect(e.tmaxP90[6]).toBe(38);
    expect(e.tminP10[6]).toBe(16);
    expect(e.tmaxP90[0]).toBeNull();
  });
});

describe('Heat Shield and Frost Guard (§6.5)', () => {
  const plants: PlantExposure[] = [
    {
      specimenId: 'basil',
      name: 'Basil',
      minTempC: 10,
      heatTolerance: 'high',
      indoor: false,
      containers: true,
      sunHours: 7,
    },
    {
      specimenId: 'kale',
      name: 'Kale',
      minTempC: -10,
      heatTolerance: 'medium',
      indoor: false,
      containers: true,
      sunHours: 7,
    },
    {
      specimenId: 'lettuce',
      name: 'Lettuce',
      minTempC: -2,
      heatTolerance: 'low',
      indoor: false,
      containers: true,
      sunHours: 5,
    },
    {
      specimenId: 'pothos',
      name: 'Pothos',
      minTempC: 12,
      heatTolerance: 'medium',
      indoor: true,
      containers: true,
      sunHours: 0,
    },
    {
      specimenId: 'mystery',
      name: 'Mystery',
      minTempC: null,
      heatTolerance: null,
      indoor: false,
      containers: false,
      sunHours: null,
    },
  ];
  const base = { today: '2026-11-20', stale: false, tmaxP90ByMonth: null, plants };

  it('frost at 1 °C tomorrow: tender and unknown plants, not indoor ones', () => {
    const a = gardenAlerts({ ...base, forecast: [{ date: '2026-11-21', tmaxC: 9, tminC: 1 }] });
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ kind: 'frost', severity: 'act', date: '2026-11-21' });
    const ids = a[0]!.affected.map((x) => x.specimenId);
    expect(ids).toContain('basil');
    expect(ids).toContain('lettuce');
    expect(ids).toContain('mystery');
    expect(ids).not.toContain('pothos');
    expect(ids).not.toContain('kale');
  });

  it('no alert from a stale forecast, or beyond 72 hours, or above 2 °C', () => {
    const cold = [{ date: '2026-11-21', tmaxC: 5, tminC: -3 }];
    expect(gardenAlerts({ ...base, stale: true, forecast: cold })).toEqual([]);
    expect(gardenAlerts({ ...base, forecast: [{ date: '2026-11-25', tmaxC: 5, tminC: -3 }] })).toEqual([]);
    expect(gardenAlerts({ ...base, forecast: [{ date: '2026-11-21', tmaxC: 15, tminC: 3 }] })).toEqual([]);
  });

  it('heat against the local 90th percentile and plant tolerance; the hottest day wins', () => {
    const p90 = new Array<number | null>(12).fill(null);
    p90[4] = 31;
    const a = gardenAlerts({
      ...base,
      today: '2026-05-10',
      tmaxP90ByMonth: p90,
      forecast: [
        { date: '2026-05-10', tmaxC: 31, tminC: 20 },
        { date: '2026-05-11', tmaxC: 33, tminC: 21 },
      ],
    });
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ kind: 'heat', date: '2026-05-11', valueC: 33, climatologyC: 31 });
    const ids = a[0]!.affected.map((x) => x.specimenId);
    expect(ids).toContain('lettuce');
    expect(ids).toContain('mystery');
    expect(ids).not.toContain('basil');
  });

  it('an ordinary warm day for the place raises nothing', () => {
    const p90 = new Array<number | null>(12).fill(36);
    expect(
      gardenAlerts({
        ...base,
        today: '2026-05-10',
        tmaxP90ByMonth: p90,
        forecast: [{ date: '2026-05-10', tmaxC: 33, tminC: 22 }],
      }),
    ).toEqual([]);
  });
});
