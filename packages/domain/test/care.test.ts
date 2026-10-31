import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  careQueue,
  dueInstant,
  occurrenceDates,
  occurrenceKey,
  reviseSchedule,
  type ScheduleLike,
  type TaskLogLike,
} from '../src/care';

const schedule = (over: Partial<ScheduleLike> = {}): ScheduleLike => ({
  id: 's1',
  version: 1,
  specimenId: 'p1',
  zoneId: 'z1',
  kind: 'check-water',
  title: 'Check soil',
  rule: { freq: 'daily', interval: 2, startOn: '2026-10-01', at: '08:00' },
  effectiveFrom: '2026-10-01',
  pausedUntil: null,
  deletedAt: null,
  ...over,
});

describe('recurrence', () => {
  it('daily every 2 days from the start', () => {
    expect(
      occurrenceDates({ freq: 'daily', interval: 2, startOn: '2026-10-01' }, '2026-10-04', '2026-10-10'),
    ).toEqual(['2026-10-05', '2026-10-07', '2026-10-09']);
  });

  it('weekly on chosen weekdays, every other week', () => {
    // 2026-10-05 is a Monday.
    const d = occurrenceDates(
      { freq: 'weekly', interval: 2, byWeekday: [1, 4], startOn: '2026-10-05' },
      '2026-10-05',
      '2026-10-31',
    );
    expect(d).toEqual(['2026-10-05', '2026-10-08', '2026-10-19', '2026-10-22']);
  });

  it('monthly clamps to short months and handles leap days', () => {
    expect(
      occurrenceDates({ freq: 'monthly', interval: 1, startOn: '2026-01-31' }, '2026-01-01', '2026-04-30'),
    ).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
    expect(
      occurrenceDates({ freq: 'monthly', interval: 12, startOn: '2024-02-29' }, '2024-01-01', '2028-12-31'),
    ).toEqual(['2024-02-29', '2025-02-28', '2026-02-28', '2027-02-28', '2028-02-29']);
  });

  it('respects until and never returns dates before the start', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 9 }),
        fc.constantFrom('daily', 'weekly', 'monthly'),
        (interval, freq) => {
          const dates = occurrenceDates(
            { freq: freq as 'daily', interval, startOn: '2026-03-10', until: '2026-09-01' },
            '2026-01-01',
            '2026-12-31',
          );
          for (const d of dates) {
            expect(d >= '2026-03-10').toBe(true);
            expect(d <= '2026-09-01').toBe(true);
          }
          expect(new Set(dates).size).toBe(dates.length);
        },
      ),
    );
  });
});

describe('due instants across DST', () => {
  it('a time in the spring-forward gap moves forward, not back', () => {
    // London, 29 March 2026: 01:00–02:00 does not exist.
    const t = dueInstant('2026-03-29', '01:30', 'Europe/London');
    expect(new Date(t).toISOString()).toBe('2026-03-29T01:30:00.000Z');
  });

  it('a time in the autumn fold uses the earlier instant', () => {
    // London, 25 October 2026: 01:30 happens twice (BST then GMT).
    const t = dueInstant('2026-10-25', '01:30', 'Europe/London');
    expect(new Date(t).toISOString()).toBe('2026-10-25T00:30:00.000Z');
  });

  it('dates follow the garden zone, not the device: the same date is a different instant in Sydney', () => {
    const london = dueInstant('2026-10-28', '08:00', 'Europe/London');
    const sydney = dueInstant('2026-10-28', '08:00', 'Australia/Sydney');
    expect((london - sydney) / 3_600_000).toBe(11);
  });
});

describe('care queue', () => {
  const now = Date.parse('2026-10-10T09:00:00Z');
  const base = { today: '2026-10-10', timeZone: 'Europe/London', now };

  it('sorts overdue, today and this week; done and checked are final', () => {
    const logs: TaskLogLike[] = [
      {
        occurrenceKey: occurrenceKey('s1', 1, 'p1', '2026-10-07'),
        action: 'done',
        at: now,
        snoozeUntil: null,
        voidedAt: null,
      },
      {
        occurrenceKey: occurrenceKey('s1', 1, 'p1', '2026-10-05'),
        action: 'checked',
        at: now,
        snoozeUntil: null,
        voidedAt: null,
      },
    ];
    const q = careQueue({
      ...base,
      schedules: [schedule({ effectiveFrom: '2026-10-05' })],
      logs,
      lastActivityAt: now,
    });
    expect(q.overdue.map((o) => o.date)).toEqual(['2026-10-09']);
    expect(q.dueToday).toEqual([]);
    expect(q.thisWeek.map((o) => o.date)).toEqual(['2026-10-11', '2026-10-13', '2026-10-15', '2026-10-17']);
  });

  it('a snooze hides an occurrence until its time, then it returns', () => {
    const key = occurrenceKey('s1', 1, 'p1', '2026-10-09');
    const snooze = (until: number): TaskLogLike => ({
      occurrenceKey: key,
      action: 'snoozed',
      at: now - 1,
      snoozeUntil: until,
      voidedAt: null,
    });
    const s = [schedule({ effectiveFrom: '2026-10-09' })];
    expect(
      careQueue({ ...base, schedules: s, logs: [snooze(now + 3600_000)], lastActivityAt: now }).overdue,
    ).toEqual([]);
    expect(
      careQueue({ ...base, schedules: s, logs: [snooze(now - 1)], lastActivityAt: now }).overdue,
    ).toHaveLength(1);
  });

  it('double-tap and offline replay: duplicate "done" logs resolve once', () => {
    const key = occurrenceKey('s1', 1, 'p1', '2026-10-09');
    const done: TaskLogLike = {
      occurrenceKey: key,
      action: 'done',
      at: now,
      snoozeUntil: null,
      voidedAt: null,
    };
    const q = careQueue({
      ...base,
      schedules: [schedule({ effectiveFrom: '2026-10-09' })],
      logs: [done, done, { ...done, action: 'snoozed', snoozeUntil: 0 }],
      lastActivityAt: now,
    });
    expect(q.overdue).toEqual([]);
  });

  it('holiday triage: a week away collapses missed waterings into one check per plant', () => {
    const schedules = [schedule(), schedule({ id: 's2', specimenId: 'p2' })];
    const q = careQueue({ ...base, schedules, logs: [], lastActivityAt: now - 8 * 86_400_000 });
    expect(q.welcomeBack?.daysAway).toBe(8);
    expect(q.welcomeBack?.checks).toHaveLength(2);
    expect(q.welcomeBack?.checks[0]?.missed.length).toBeGreaterThan(1);
    expect(q.overdue).toEqual([]);
  });

  it('pausing skips occurrences until the pause ends', () => {
    const q = careQueue({
      ...base,
      schedules: [schedule({ pausedUntil: '2026-10-12' })],
      logs: [],
      lastActivityAt: now,
    });
    expect(q.overdue).toEqual([]);
    expect(q.thisWeek[0]?.date).toBe('2026-10-13');
  });

  it('editing a series starts a new version today; past occurrences do not come back', () => {
    const s = schedule({ effectiveFrom: '2026-10-09' });
    const done: TaskLogLike = {
      occurrenceKey: occurrenceKey('s1', 1, 'p1', '2026-10-09'),
      action: 'done',
      at: now,
      snoozeUntil: null,
      voidedAt: null,
    };
    const revised = reviseSchedule(s, { rule: { ...s.rule, interval: 3 } }, '2026-10-10');
    const q = careQueue({ ...base, schedules: [revised], logs: [done], lastActivityAt: now });
    expect(q.overdue).toEqual([]);
    expect(q.dueToday.map((o) => o.key)).toEqual([occurrenceKey('s1', 2, 'p1', '2026-10-10')]);
  });
});
