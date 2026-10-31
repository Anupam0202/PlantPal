import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  canopyM2,
  exposureFactor,
  potSurfaceM2,
  recalibrate,
  simulateContainer,
  simulateTank,
  suggestTankSize,
  suggestedWateringL,
  type ContainerWater,
  type WaterDay,
} from '../src/water';

const pot = (over: Partial<ContainerWater> = {}): ContainerWater => ({
  volumeL: 10,
  availableFraction: 0.3,
  kc: 1,
  exposure: 1,
  canopyM2: 0.1,
  catchM2: 0.05,
  covered: false,
  indoor: false,
  personalFactor: 1,
  ...over,
});
const days = (et0: number | null, rain: number | null, n = 7): WaterDay[] =>
  Array.from({ length: n }, (_, i) => ({
    date: `2026-06-${String(10 + i).padStart(2, '0')}`,
    et0Mm: et0,
    rainMm: rain,
  }));

describe('container water balance', () => {
  it('1 mm over 1 m² is 1 litre', () => {
    const r = simulateContainer(pot({ canopyM2: 1, volumeL: 100 }), days(1, 0, 1));
    expect(r.demandL[0]).toBe(1);
  });

  it('suggests a check day, not a prescription', () => {
    // Capacity 3 L, demand 5 mm × 0.1 m² = 0.5 L/day → half capacity on day 3.
    const r = simulateContainer(pot(), days(5, 0));
    expect(r.capacityL).toBe(3);
    expect(r.checkBy).toBe('2026-06-12');
    expect(r.dryBy).toBe('2026-06-15');
  });

  it('S5: a covered pot gets no rain', () => {
    const open = simulateContainer(pot(), days(5, 20), 1);
    const covered = simulateContainer(pot({ covered: true }), days(5, 20), 1);
    expect(open.rainInL.every((x) => x > 0)).toBe(true);
    expect(covered.rainInL.every((x) => x === 0)).toBe(true);
  });

  it('S2: unknown ET₀ or rain is not zero; it widens the estimate', () => {
    expect(simulateContainer(pot(), days(null, 0)).uncertain).toBe(true);
    expect(simulateContainer(pot(), days(4, null)).uncertain).toBe(true);
    expect(simulateContainer(pot(), days(0, 0)).uncertain).toBe(false);
  });

  it('storage stays within [0, capacity] and excess rain drains (property)', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            et0: fc.double({ min: 0, max: 12, noNaN: true }),
            rain: fc.double({ min: 0, max: 120, noNaN: true }),
          }),
          {
            minLength: 1,
            maxLength: 60,
          },
        ),
        fc.double({ min: 0.5, max: 2, noNaN: true }),
        fc.boolean(),
        (series, factor, covered) => {
          const c = pot({ personalFactor: factor, covered });
          const r = simulateContainer(
            c,
            series.map((d, i) => ({
              date: `2026-01-${String((i % 28) + 1).padStart(2, '0')}`,
              et0Mm: d.et0,
              rainMm: d.rain,
            })),
          );
          for (const s of r.storedL) {
            expect(s).toBeGreaterThanOrEqual(0);
            expect(s).toBeLessThanOrEqual(r.capacityL + 1e-9);
          }
          if (covered) expect(r.drainedL.every((x) => x === 0)).toBe(true);
        },
      ),
    );
  });
});

describe('recalibration', () => {
  it('moves the personal factor toward what the user observed, bounded', () => {
    expect(recalibrate(1, 'dry', 'moist')).toBe(0.85);
    expect(recalibrate(1, 'moist', 'dry')).toBe(1.15);
    expect(recalibrate(1, 'dry', 'dry')).toBe(1);
    let f = 1;
    for (let i = 0; i < 50; i++) f = recalibrate(f, 'dry', 'wet');
    expect(f).toBe(0.5);
    for (let i = 0; i < 50; i++) f = recalibrate(f, 'moist', 'dry');
    expect(f).toBe(2);
  });
});

describe('helpers', () => {
  it('exposure, pot surface, canopy and watering presets', () => {
    expect(exposureFactor(7, 'exposed')).toBe(1.15);
    expect(exposureFactor(2, 'sheltered')).toBe(0.54);
    expect(potSurfaceM2({ diameterCm: 30 })).toBeCloseTo(0.0707, 3);
    expect(potSurfaceM2({ lengthCm: 60, widthCm: 20 })).toBeCloseTo(0.12, 6);
    expect(potSurfaceM2({})).toBeNull();
    expect(canopyM2(null, null)).toBe(0.01);
    expect(canopyM2(40, 0.07)).toBeCloseTo(0.1257, 3);
    expect(suggestedWateringL(3, 1)).toBe(2.2);
    expect(suggestedWateringL(3, 3)).toBe(0.1);
  });
});

describe('rain harvest tank', () => {
  it('conserves mass and never goes negative or above capacity (property)', () => {
    fc.assert(
      fc.property(
        fc.array(fc.double({ min: 0, max: 80, noNaN: true }), { minLength: 1, maxLength: 365 }),
        fc.double({ min: 1, max: 100, noNaN: true }),
        fc.double({ min: 0, max: 2000, noNaN: true }),
        fc.double({ min: 0, max: 50, noNaN: true }),
        fc.double({ min: 0, max: 20, noNaN: true }),
        (rain, area, capacity, demand, flush) => {
          const r = simulateTank(
            {
              catchmentM2: area,
              runoffCoefficient: 0.8,
              firstFlushL: flush,
              capacityL: capacity,
              dailyDemandL: demand,
            },
            rain,
          );
          for (const s of r.storageL) {
            expect(s).toBeGreaterThanOrEqual(-1e-9);
            expect(s).toBeLessThanOrEqual(capacity + 1e-9);
          }
          // start + inflow − supplied − overflow = end
          expect(r.startL + r.inflowL - r.suppliedL - r.overflowL).toBeCloseTo(r.endL, 6);
          expect(r.metFraction).toBeGreaterThanOrEqual(0);
          expect(r.metFraction).toBeLessThanOrEqual(1 + 1e-9);
        },
      ),
    );
  });

  it('first flush is diverted and overflow days are counted', () => {
    const r = simulateTank(
      { catchmentM2: 10, runoffCoefficient: 1, firstFlushL: 5, capacityL: 100, dailyDemandL: 0 },
      [20, 0, 20],
    );
    expect(r.inflowL).toBe(390);
    expect(r.overflowDays).toBe(2);
    expect(r.endL).toBe(100);
  });

  it('suggests the smallest tank that meets most of the demand', () => {
    const rain = Array.from({ length: 120 }, (_, i) => (i % 10 === 0 ? 25 : 0));
    const s = suggestTankSize(
      { catchmentM2: 8, runoffCoefficient: 0.8, firstFlushL: 2, dailyDemandL: 10 },
      rain,
    );
    expect(s.result.metFraction).toBeGreaterThanOrEqual(0.8);
    expect(s.capacityL).toBeLessThanOrEqual(200);
  });
});
