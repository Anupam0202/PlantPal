import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  HORIZON_BINS,
  addObstacle,
  directSunOnDate,
  flatHorizon,
  horizonAt,
  isHorizon,
  lightClass,
  obstacleElevation,
  quickProfile,
  spotFromAnswers,
  sunProfile,
  wallBehind,
  type SunSpot,
} from '../src';

const PUNE = { lat: 18.52, lon: 73.86, timeZone: 'Asia/Kolkata' };
const LONDON = { lat: 51.5, lon: -0.12, timeZone: 'Europe/London' };
const SYDNEY = { lat: -33.87, lon: 151.21, timeZone: 'Australia/Sydney' };

const open = (base: typeof PUNE): SunSpot => ({ ...base, horizon: flatHorizon(), overhang: null });
const hourOf = (ms: number, tz: string) =>
  Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hour12: false, timeZone: tz }).format(ms));

describe('horizon helpers', () => {
  it('converts obstacles to elevation angles', () => {
    expect(obstacleElevation(10, 10)).toBeCloseTo(45, 6);
    expect(obstacleElevation(0, 5)).toBe(0);
    expect(obstacleElevation(3, 0)).toBe(90);
  });

  it('raises only the bins inside the span, wrapping through north', () => {
    const h = addObstacle(flatHorizon(), 350, 10, 30);
    expect(horizonAt(h, 355)).toBe(30);
    expect(horizonAt(h, 5)).toBe(30);
    expect(horizonAt(h, 15)).toBe(0);
    expect(horizonAt(h, 340)).toBe(0);
    expect(isHorizon(h)).toBe(true);
  });

  it('a wall behind a south-facing spot blocks the northern half', () => {
    const h = wallBehind(180);
    expect(horizonAt(h, 0)).toBe(90);
    expect(horizonAt(h, 80)).toBe(90);
    expect(horizonAt(h, 95)).toBe(0);
    expect(horizonAt(h, 180)).toBe(0);
    expect(horizonAt(h, 268)).toBe(0);
    expect(horizonAt(h, 275)).toBe(90);
  });

  it('never lowers an existing obstacle', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 359 }),
        fc.integer({ min: 0, max: 359 }),
        fc.integer({ min: 0, max: 90 }),
        (from, to, e) => {
          const base = addObstacle(flatHorizon(), 0, 180, 40);
          const next = addObstacle(base, from, to, e);
          expect(next).toHaveLength(HORIZON_BINS);
          next.forEach((v, i) => expect(v).toBeGreaterThanOrEqual(base[i]!));
        },
      ),
    );
  });
});

describe('Sun Hours Finder acceptance fixtures (§6.2)', () => {
  it('Pune, 21 June, flat horizon: astronomical day length within ±5 min', () => {
    const day = directSunOnDate(open(PUNE), '2026-06-21', 1);
    // Published sunrise 05:59 and sunset 19:12 IST → 13 h 13 min.
    expect(Math.abs(day.directHours * 60 - (13 * 60 + 13))).toBeLessThanOrEqual(5);
    expect(day.directHours).toBeCloseTo(day.daylightHours, 6);
    expect(day.windows).toHaveLength(1);
  });

  it('a full western wall at 60° gives no afternoon sun', () => {
    const spot: SunSpot = { ...LONDON, horizon: addObstacle(flatHorizon(), 180, 360, 60), overhang: null };
    for (const date of ['2026-03-21', '2026-06-21', '2026-09-21', '2026-12-21']) {
      const day = directSunOnDate(spot, date, 2);
      for (const w of day.windows) expect(hourOf(w.end - 1, LONDON.timeZone)).toBeLessThan(14);
    }
    // Mornings are untouched.
    expect(directSunOnDate(spot, '2026-06-21').directHours).toBeGreaterThan(6);
  });

  it('Sydney: a north-facing spot gets winter sun, a south-facing one almost none', () => {
    const north = spotFromAnswers({ facingDeg: 0, covered: false, across: 'none' }, SYDNEY);
    const south = spotFromAnswers({ facingDeg: 180, covered: false, across: 'none' }, SYDNEY);
    const juneNorth = directSunOnDate(north, '2026-06-21').directHours;
    const juneSouth = directSunOnDate(south, '2026-06-21').directHours;
    expect(juneNorth).toBeGreaterThan(9);
    expect(juneSouth).toBe(0);
    // Southern summer: the sun rises and sets south of east and west, so a north-facing wall loses the ends of the day.
    const decNorth = directSunOnDate(north, '2026-12-21');
    expect(decNorth.directHours).toBeLessThan(decNorth.daylightHours - 2);
    expect(lightClass(sunProfile(north, 2026).meanHours)).toBe('full-sun');
  });

  it('a 45° overhang blocks high summer sun but not low winter sun', () => {
    const covered = spotFromAnswers(
      { facingDeg: 180, covered: true, overhangDeg: 45, across: 'none' },
      LONDON,
    );
    const uncovered = spotFromAnswers({ facingDeg: 180, covered: false, across: 'none' }, LONDON);
    const noonJune = Date.parse('2026-06-21T12:00:00Z');
    const noonDec = Date.parse('2026-12-21T12:00:00Z');
    const june = directSunOnDate(covered, '2026-06-21');
    const dec = directSunOnDate(covered, '2026-12-21');
    expect(june.windows.some((w) => w.start <= noonJune && w.end > noonJune)).toBe(false);
    expect(dec.windows.some((w) => w.start <= noonDec && w.end > noonDec)).toBe(true);
    expect(dec.directHours).toBeCloseTo(directSunOnDate(uncovered, '2026-12-21').directHours, 1);
    expect(june.directHours).toBeLessThan(directSunOnDate(uncovered, '2026-06-21').directHours - 3);
  });

  it('handles DST changes: the day of the change still matches day length', () => {
    for (const date of ['2026-03-29', '2026-10-25']) {
      const day = directSunOnDate(open(LONDON), date, 1);
      const nextDay = directSunOnDate(open(LONDON), date === '2026-03-29' ? '2026-03-30' : '2026-10-26', 1);
      // Day length changes by only a few minutes from one day to the next; a DST bug would add or lose an hour.
      expect(Math.abs(day.directHours - nextDay.directHours)).toBeLessThan(0.1);
    }
  });

  it('light 0 stays 0: a north-facing London wall gets no sun in midwinter', () => {
    const spot = spotFromAnswers({ facingDeg: 0, covered: false, across: 'medium' }, LONDON);
    const dec = directSunOnDate(spot, '2026-12-21');
    expect(dec.directHours).toBe(0);
    expect(lightClass(dec.directHours)).toBe('shade');
  });
});

describe('profiles and classes', () => {
  it('builds a 12-month profile with sensible extremes', () => {
    const p = sunProfile(open(LONDON), 2026);
    expect(p.monthlyHours).toHaveLength(12);
    expect(p.maxHours).toBe(p.monthlyHours[5]);
    expect(p.minHours).toBe(p.monthlyHours[11]);
  });

  it('classifies by extension thresholds', () => {
    expect(lightClass(6)).toBe('full-sun');
    expect(lightClass(5.9)).toBe('part-sun');
    expect(lightClass(3)).toBe('part-sun');
    expect(lightClass(2)).toBe('part-shade');
    expect(lightClass(0.5)).toBe('shade');
    expect(lightClass(0)).toBe('shade');
  });

  it('quick profile peaks at the local summer solstice', () => {
    const n = quickProfile(8, 2, 'north');
    const s = quickProfile(8, 2, 'south');
    expect(n[5]).toBe(8);
    expect(n[11]).toBe(2);
    expect(s[11]).toBe(8);
    expect(s[5]).toBe(2);
  });
});
