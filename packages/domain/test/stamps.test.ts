import { describe, expect, it } from 'vitest';
import { fieldStamps, RAIN_DAILY_CAP_L, type StampInput } from '../src';

const empty: StampInput = {
  today: '2026-10-30',
  plantedOn: [],
  sunMethods: [],
  careDays: [],
  rainLitresByDay: [],
  bloomMonths: null,
  nativeActive: 0,
  timedCounts: [],
  phenologyDays: [],
  harvests: [],
  seedLots: [],
  lessonsDone: 0,
};
const of = (i: Partial<StampInput>) =>
  Object.fromEntries(fieldStamps({ ...empty, ...i }).map((s) => [s.id, s]));

describe('field stamps (Appendix D)', () => {
  it('start with nothing earned, and say which records are not kept yet', () => {
    const s = of({});
    expect(Object.values(s).every((x) => x.earned === 0)).toBe(true);
    expect(s['soil-builder']!.value).toBeNull();
    expect(s['good-neighbour']!.value).toBeNull();
    expect(s['steady-hands']!.value).toBe(0);
  });

  it('First Roots needs a planted date that is not in the future', () => {
    expect(of({ plantedOn: ['2026-11-02'] })['first-roots']!.earned).toBe(0);
    expect(of({ plantedOn: [null, '2026-10-01'] })['first-roots']!.earned).toBe(1);
  });

  it('Steady Hands counts distinct weeks, not consecutive ones: gaps never take credit away', () => {
    const days = Array.from({ length: 12 }, (_, w) => {
      const d = new Date(Date.UTC(2026, 0, 5 + w * 14));
      return d.toISOString().slice(0, 10);
    });
    const s = of({ careDays: [...days, ...days] })['steady-hands']!;
    expect(s.value).toBe(12);
    expect(s.earned).toBe(1);
  });

  it('Rain Keeper caps implausible days', () => {
    const s = of({
      rainLitresByDay: [
        { on: '2026-07-01', litres: 30 },
        { on: '2026-07-01', litres: 30 },
        { on: '2026-07-02', litres: 5000 },
      ],
    })['rain-keeper']!;
    expect(s.value).toBe(60 + RAIN_DAILY_CAP_L);
    expect(s.earned).toBe(2);
  });

  it('Pollinator Watch counts full-length counts, including zero counts', () => {
    const s = of({
      timedCounts: [
        { durationSec: 600, plannedSec: 600 },
        { durationSec: 600, plannedSec: 600 },
        { durationSec: 300, plannedSec: 600 },
        { durationSec: 610, plannedSec: 600 },
      ],
    })['pollinator-watch']!;
    expect(s.value).toBe(3);
    expect(s.earned).toBe(1);
  });

  it('Phenology Keeper needs twelve distinct dates over at least three months', () => {
    const twoMonths = Array.from(
      { length: 12 },
      (_, i) => `2026-0${5 + (i % 2)}-${String(10 + i).padStart(2, '0')}`,
    );
    expect(of({ phenologyDays: twoMonths })['phenology-keeper']!.earned).toBe(0);
    const threeMonths = Array.from(
      { length: 12 },
      (_, i) => `2026-0${5 + (i % 3)}-${String(10 + i).padStart(2, '0')}`,
    );
    expect(of({ phenologyDays: [...threeMonths, threeMonths[0]!] })['phenology-keeper']!.earned).toBe(1);
  });

  it('Harvest uses measured mass only; counts never become kilograms', () => {
    const s = of({ harvests: [{ massG: 600 }, { massG: 500 }, { massG: null }] });
    expect(s['first-harvest']!.earned).toBe(1);
    expect(s['harvest']!.value).toBe(1.1);
    expect(s['harvest']!.earned).toBe(1);
  });

  it('Seed Saver needs a lot from your own plant with a germination test; removing it removes the stamp', () => {
    expect(of({ seedLots: [{ fromOwnPlant: false, tests: 2 }] })['seed-saver']!.earned).toBe(0);
    expect(of({ seedLots: [{ fromOwnPlant: true, tests: 0 }] })['seed-saver']!.earned).toBe(0);
    expect(of({ seedLots: [{ fromOwnPlant: true, tests: 1 }] })['seed-saver']!.earned).toBe(1);
    expect(of({ seedLots: [] })['seed-saver']!.earned).toBe(0);
  });

  it('tiers are widely spaced and reachable', () => {
    for (const s of fieldStamps(empty)) {
      expect([...s.tiers].sort((a, b) => a - b)).toEqual(s.tiers);
      for (let k = 1; k < s.tiers.length; k++)
        expect(s.tiers[k]! / s.tiers[k - 1]!).toBeGreaterThanOrEqual(1.3);
    }
    expect(of({ nativeActive: 10 })['native-nook']!.earned).toBe(3);
    expect(of({ bloomMonths: 12 })['bloom-bridge']!.earned).toBe(3);
    expect(of({ lessonsDone: 5 })['field-scholar']!.earned).toBe(1);
  });
});
