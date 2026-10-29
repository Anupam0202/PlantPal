import { Temporal } from 'temporal-polyfill';
import type { RecurrenceRule, TaskKind } from './care';
import type { LocalDate } from './dates';
import { simulateContainer, suggestedWateringL, type ContainerWater, type WaterDay } from './water';

/**
 * Care plan from traits (§7 W4: "schedules created from traits, editable") and dynamic "check by"
 * water tasks from the Water-Wise balance (§6.4).
 */

export interface PlantForCare {
  specimenId: string;
  useGroup: string | null;
  foodValue: 'none' | 'low' | 'medium' | 'high' | null;
  plantedOn: LocalDate | null;
  /** Shortest days from planting to first harvest, when known. */
  daysToMaturityMin: number | null;
}

export interface ScheduleDraft {
  kind: TaskKind;
  rule: RecurrenceRule;
}

const plus = (d: LocalDate, days: number) => Temporal.PlainDate.from(d).add({ days }).toString();
const later = (a: LocalDate, b: LocalDate) =>
  Temporal.PlainDate.compare(Temporal.PlainDate.from(a), Temporal.PlainDate.from(b)) >= 0 ? a : b;

/** Default, editable schedules: feeding, a weekly pest look, and harvest checks for food plants. */
export function defaultSchedules(p: PlantForCare, today: LocalDate): ScheduleDraft[] {
  const start = p.plantedOn ?? today;
  const food =
    p.foodValue === 'medium' ||
    p.foodValue === 'high' ||
    ['fruiting', 'leafy', 'root', 'fruit'].includes(p.useGroup ?? '');
  const out: ScheduleDraft[] = [];
  if (p.useGroup === 'houseplant') {
    out.push({
      kind: 'feed',
      rule: { freq: 'monthly', interval: 1, startOn: later(plus(start, 28), today), at: null },
    });
  } else {
    out.push({
      kind: 'feed',
      rule: {
        freq: 'daily',
        interval: food ? 14 : 28,
        startOn: later(plus(start, food ? 14 : 28), today),
        at: null,
      },
    });
  }
  out.push({
    kind: 'pest-check',
    rule: { freq: 'weekly', interval: 1, startOn: later(plus(start, 3), today), at: null },
  });
  if (food && p.daysToMaturityMin !== null) {
    out.push({
      kind: 'harvest',
      rule: {
        freq: 'weekly',
        interval: 1,
        startOn: later(plus(start, p.daysToMaturityMin), today),
        at: null,
      },
    });
  }
  return out;
}

export interface WaterSubject {
  specimenId: string;
  zoneId: string | null;
  container: ContainerWater;
  /** Last time the pot's moisture was known: watered (1), checked wet (1), moist (0.6) or dry (0.1). */
  lastKnown: { date: LocalDate; fraction: number } | null;
}

export interface WaterCheck {
  key: string;
  specimenId: string;
  zoneId: string | null;
  /** Garden-local date by which to check the soil. */
  checkBy: LocalDate;
  /** Estimated share of readily available water left today, 0–1; null when never checked. */
  fractionToday: number | null;
  capacityL: number;
  /** A refill amount for the "Do" preset, L. */
  suggestedL: number;
  uncertain: boolean;
}

/** Fills a day series from `from` to `to`, using known days and nulls (unknown, not zero) elsewhere. */
export function daySeries(from: LocalDate, to: LocalDate, known: readonly WaterDay[]): WaterDay[] {
  const byDate = new Map(known.map((d) => [d.date, d]));
  const out: WaterDay[] = [];
  for (
    let d = Temporal.PlainDate.from(from);
    Temporal.PlainDate.compare(d, Temporal.PlainDate.from(to)) <= 0;
    d = d.add({ days: 1 })
  ) {
    const s = d.toString();
    out.push(byDate.get(s) ?? { date: s, et0Mm: null, rainMm: null });
    if (out.length > 400) break;
  }
  return out;
}

/** "Check by" tasks for every pot: simulate from the last known moisture through the next few days. */
export function waterChecks(
  subjects: readonly WaterSubject[],
  known: readonly WaterDay[],
  today: LocalDate,
  horizonDays = 4,
): WaterCheck[] {
  const end = plus(today, horizonDays);
  const out: WaterCheck[] = [];
  for (const s of subjects) {
    const capacityL = s.container.volumeL * s.container.availableFraction;
    if (!s.lastKnown) {
      // Never checked: start with a check today rather than guess.
      out.push({
        key: `water.${s.specimenId}.${today}`,
        specimenId: s.specimenId,
        zoneId: s.zoneId,
        checkBy: today,
        fractionToday: null,
        capacityL,
        suggestedL: suggestedWateringL(capacityL, capacityL * 0.3),
        uncertain: true,
      });
      continue;
    }
    // The day the moisture was known is already accounted for; the balance starts the day after.
    const startDay = plus(s.lastKnown.date, 1);
    const days = daySeries(startDay, later(end, startDay), known);
    const r = simulateContainer(s.container, days, capacityL * s.lastKnown.fraction);
    const todayIdx = days.findIndex((d) => d.date === today);
    const storedToday = todayIdx >= 0 ? (r.storedL[todayIdx] ?? capacityL) : capacityL * s.lastKnown.fraction;
    const initialLow = s.lastKnown.fraction <= 0.5 ? s.lastKnown.date : null;
    let checkBy = initialLow ?? r.checkBy ?? end;
    // Past-due checks surface today (never replayed day by day).
    if (Temporal.PlainDate.compare(Temporal.PlainDate.from(checkBy), Temporal.PlainDate.from(today)) < 0)
      checkBy = today;
    out.push({
      key: `water.${s.specimenId}.${checkBy}`,
      specimenId: s.specimenId,
      zoneId: s.zoneId,
      checkBy,
      fractionToday: capacityL > 0 ? Math.round((storedToday / capacityL) * 100) / 100 : null,
      capacityL: Math.round(capacityL * 100) / 100,
      suggestedL: suggestedWateringL(capacityL, storedToday),
      uncertain: r.uncertain,
    });
  }
  return out.sort((a, b) =>
    a.checkBy < b.checkBy ? -1 : a.checkBy > b.checkBy ? 1 : a.specimenId < b.specimenId ? -1 : 1,
  );
}

/** What a fingertip check means for the soil store (used to reset the balance). */
export const CHECK_FRACTION = { dry: 0.1, moist: 0.6, wet: 1 } as const;
