import { describe, expect, it } from 'vitest';
import { daySeries, defaultSchedules, waterChecks, type WaterSubject } from '../src/careplan';
import type { ContainerWater } from '../src/water';

const pot: ContainerWater = {
  volumeL: 10,
  availableFraction: 0.3,
  kc: 1,
  exposure: 1,
  canopyM2: 0.1,
  catchM2: 0.05,
  covered: true,
  indoor: false,
  personalFactor: 1,
};

describe('default schedules from traits', () => {
  it('food plants get fortnightly feeding, a weekly pest look and harvest checks from maturity', () => {
    const s = defaultSchedules(
      {
        specimenId: 'p',
        useGroup: 'fruiting',
        foodValue: 'high',
        plantedOn: '2026-10-01',
        daysToMaturityMin: 55,
      },
      '2026-10-01',
    );
    expect(s.map((x) => x.kind)).toEqual(['feed', 'pest-check', 'harvest']);
    expect(s[0]?.rule).toMatchObject({ freq: 'daily', interval: 14, startOn: '2026-10-15' });
    expect(s[2]?.rule.startOn).toBe('2026-11-25');
  });

  it('houseplants are fed monthly and never get harvest checks', () => {
    const s = defaultSchedules(
      {
        specimenId: 'p',
        useGroup: 'houseplant',
        foodValue: 'none',
        plantedOn: null,
        daysToMaturityMin: null,
      },
      '2026-10-01',
    );
    expect(s.map((x) => x.kind)).toEqual(['feed', 'pest-check']);
    expect(s[0]?.rule.freq).toBe('monthly');
  });
});

describe('water checks (§6.4)', () => {
  const known = daySeries('2026-10-01', '2026-10-12', [
    ...Array.from({ length: 12 }, (_, i) => ({
      date: `2026-10-${String(i + 1).padStart(2, '0')}`,
      et0Mm: 5,
      rainMm: 0,
    })),
  ]);
  const subject = (lastKnown: WaterSubject['lastKnown']): WaterSubject => ({
    specimenId: 'basil',
    zoneId: 'z',
    container: pot,
    lastKnown,
  });

  it('never checked → check today, marked uncertain', () => {
    const [c] = waterChecks([subject(null)], known, '2026-10-05');
    expect(c).toMatchObject({ checkBy: '2026-10-05', fractionToday: null, uncertain: true });
  });

  it('after watering, the check comes when half the store is used ("likely dry at 2 cm")', () => {
    // 3 L store, 0.5 L/day → half on the third day after watering.
    const [c] = waterChecks([subject({ date: '2026-10-05', fraction: 1 })], known, '2026-10-05');
    expect(c?.checkBy).toBe('2026-10-08');
    expect(c?.key).toBe('water.basil.2026-10-08');
    expect(c?.uncertain).toBe(false);
  });

  it('overdue checks surface today instead of replaying', () => {
    const [c] = waterChecks([subject({ date: '2026-10-01', fraction: 1 })], known, '2026-10-10');
    expect(c?.checkBy).toBe('2026-10-10');
    expect(c?.fractionToday).toBe(0);
    expect(c?.suggestedL).toBeGreaterThan(3);
  });

  it('a "moist" check pushes the next check out; a "dry" one asks for action now', () => {
    const [moist] = waterChecks([subject({ date: '2026-10-05', fraction: 0.6 })], known, '2026-10-05');
    expect(moist?.checkBy).toBe('2026-10-06');
    const [dry] = waterChecks([subject({ date: '2026-10-05', fraction: 0.1 })], known, '2026-10-05');
    expect(dry?.checkBy).toBe('2026-10-05');
  });

  it('missing weather days are unknown, not zero, and make the estimate uncertain', () => {
    const [c] = waterChecks([subject({ date: '2026-10-05', fraction: 1 })], [], '2026-10-05');
    expect(c?.uncertain).toBe(true);
  });
});
