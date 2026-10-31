import { Temporal } from 'temporal-polyfill';
import type { LocalDate } from './dates';

/**
 * Care schedules and occurrences (master prompt §6.6). A schedule rule, the identity of each occurrence
 * (`schedule + version + specimen + garden-local date`) and the append-only history of what was done
 * are kept apart. Dates are garden-local; times are resolved in the garden's IANA time zone.
 */

export interface RecurrenceRule {
  freq: 'daily' | 'weekly' | 'monthly';
  /** Every N days, weeks or months (≥ 1). */
  interval: number;
  /** ISO weekdays (1 = Monday … 7 = Sunday) for weekly rules; empty or missing means the start's weekday. */
  byWeekday?: readonly number[];
  startOn: LocalDate;
  until?: LocalDate | null;
  /** Garden-local time of day, `HH:MM`; null means any time that day. */
  at?: string | null;
}

const P = (d: LocalDate) => Temporal.PlainDate.from(d);
const cmp = (a: LocalDate, b: LocalDate) => Temporal.PlainDate.compare(P(a), P(b));

/** Garden-local dates on which the rule falls within `[from, to]` (inclusive). */
export function occurrenceDates(rule: RecurrenceRule, from: LocalDate, to: LocalDate): LocalDate[] {
  const interval = Math.max(1, Math.floor(rule.interval));
  const start = P(rule.startOn);
  const lo = cmp(from, rule.startOn) > 0 ? P(from) : start;
  const hiDate = rule.until && cmp(rule.until, to) < 0 ? rule.until : to;
  const hi = P(hiDate);
  if (Temporal.PlainDate.compare(lo, hi) > 0) return [];
  const out: LocalDate[] = [];

  if (rule.freq === 'daily') {
    const offset = lo.since(start, { largestUnit: 'days' }).days;
    let k = Math.ceil(offset / interval);
    for (let d = start.add({ days: k * interval }); Temporal.PlainDate.compare(d, hi) <= 0;) {
      out.push(d.toString());
      k++;
      d = start.add({ days: k * interval });
    }
    return out;
  }

  if (rule.freq === 'weekly') {
    const days =
      rule.byWeekday && rule.byWeekday.length > 0 ? new Set(rule.byWeekday) : new Set([start.dayOfWeek]);
    const weekStart = start.subtract({ days: start.dayOfWeek - 1 });
    for (let d = lo; Temporal.PlainDate.compare(d, hi) <= 0; d = d.add({ days: 1 })) {
      if (!days.has(d.dayOfWeek)) continue;
      const weeks = Math.floor(d.since(weekStart, { largestUnit: 'days' }).days / 7);
      if (weeks % interval === 0) out.push(d.toString());
    }
    return out;
  }

  // Monthly on the start's day of month, clamped to shorter months (31st → 30th; 29 Feb → 28 Feb).
  for (let k = 0; ; k += interval) {
    const firstOfMonth = start.with({ day: 1 }).add({ months: k });
    const d = firstOfMonth.with({ day: start.day }, { overflow: 'constrain' });
    if (Temporal.PlainDate.compare(d, hi) > 0) break;
    if (Temporal.PlainDate.compare(d, lo) >= 0) out.push(d.toString());
    if (k > 12 * 200) break;
  }
  return out;
}

/**
 * The instant an occurrence is due: its local time on that date in the garden's zone. In a DST gap the
 * time moves forward; in a fold the earlier instant is used. Without a time, the end of the local day.
 */
export function dueInstant(date: LocalDate, at: string | null | undefined, timeZone: string): number {
  const d = P(date);
  if (at && /^\d{2}:\d{2}$/.test(at)) {
    const [h, m] = at.split(':').map(Number);
    return d
      .toPlainDateTime({ hour: h ?? 0, minute: m ?? 0 })
      .toZonedDateTime(timeZone, { disambiguation: 'compatible' }).epochMilliseconds;
  }
  return d.add({ days: 1 }).toZonedDateTime({ timeZone }).epochMilliseconds - 1;
}

/** Stable identity of one occurrence; also stored on the care event that resolves it. */
export function occurrenceKey(
  scheduleId: string,
  scheduleVersion: number,
  specimenId: string | null,
  date: LocalDate,
): string {
  return `${scheduleId}.v${scheduleVersion}.${specimenId ?? '-'}.${date}`;
}

export type TaskKind = 'check-water' | 'water' | 'feed' | 'prune' | 'pest-check' | 'harvest' | 'custom';

export interface ScheduleLike {
  id: string;
  version: number;
  specimenId: string | null;
  zoneId: string | null;
  kind: TaskKind;
  title: string;
  rule: RecurrenceRule;
  /** The rule applies from this date; earlier occurrences belong to the previous version. */
  effectiveFrom: LocalDate;
  pausedUntil: LocalDate | null;
  deletedAt: number | null;
}

export type TaskAction = 'done' | 'checked' | 'skipped' | 'snoozed';

export interface TaskLogLike {
  occurrenceKey: string;
  action: TaskAction;
  at: number;
  snoozeUntil: number | null;
  voidedAt: number | null;
}

export interface Occurrence {
  key: string;
  scheduleId: string;
  specimenId: string | null;
  zoneId: string | null;
  kind: TaskKind;
  title: string;
  date: LocalDate;
  dueAt: number;
}

export interface CollapsedCheck {
  specimenId: string | null;
  zoneId: string | null;
  /** Occurrences folded into one check (never replayed one by one). */
  missed: Occurrence[];
}

export interface CareQueue {
  overdue: Occurrence[];
  dueToday: Occurrence[];
  /** Next seven days after today, by date. */
  thisWeek: Occurrence[];
  /** Set after a long gap: overdue items collapse into one check per plant (§6.6 holiday triage). */
  welcomeBack: { daysAway: number; checks: CollapsedCheck[] } | null;
}

export interface QueueInput {
  schedules: readonly ScheduleLike[];
  logs: readonly TaskLogLike[];
  today: LocalDate;
  timeZone: string;
  now: number;
  /** Days back to look for overdue work. */
  lookbackDays?: number;
  /** Gap since the last logged action that counts as "away". */
  awayDays?: number;
  /** Instant of the last task action or care event in this garden, if any. */
  lastActivityAt?: number | null;
}

/** Resolution of each occurrence key: the latest non-voided log wins; a "done" or "checked" is final. */
function resolutions(logs: readonly TaskLogLike[]) {
  const byKey = new Map<string, TaskLogLike>();
  for (const l of logs) {
    if (l.voidedAt !== null) continue;
    const prev = byKey.get(l.occurrenceKey);
    if (!prev) byKey.set(l.occurrenceKey, l);
    else if (prev.action === 'done' || prev.action === 'checked') continue;
    else if (l.action === 'done' || l.action === 'checked' || l.at >= prev.at) byKey.set(l.occurrenceKey, l);
  }
  return byKey;
}

/** Builds the Today care queue: overdue → due today → this week, with holiday collapse. */
export function careQueue(input: QueueInput): CareQueue {
  const lookback = input.lookbackDays ?? 14;
  const today = P(input.today);
  const from = today.subtract({ days: lookback }).toString();
  const to = today.add({ days: 7 }).toString();
  const resolved = resolutions(input.logs);
  const overdue: Occurrence[] = [];
  const dueToday: Occurrence[] = [];
  const thisWeek: Occurrence[] = [];

  for (const s of input.schedules) {
    if (s.deletedAt !== null) continue;
    const start = cmp(s.effectiveFrom, from) > 0 ? s.effectiveFrom : from;
    for (const date of occurrenceDates(s.rule, start, to)) {
      if (s.pausedUntil && cmp(date, s.pausedUntil) <= 0) continue;
      const key = occurrenceKey(s.id, s.version, s.specimenId, date);
      const log = resolved.get(key);
      if (log && log.action !== 'snoozed') continue;
      if (log?.action === 'snoozed' && log.snoozeUntil !== null && log.snoozeUntil > input.now) continue;
      const occ: Occurrence = {
        key,
        scheduleId: s.id,
        specimenId: s.specimenId,
        zoneId: s.zoneId,
        kind: s.kind,
        title: s.title,
        date,
        dueAt: dueInstant(date, s.rule.at, input.timeZone),
      };
      const c = cmp(date, input.today);
      if (c < 0) overdue.push(occ);
      else if (c === 0) dueToday.push(occ);
      else thisWeek.push(occ);
    }
  }
  const byDue = (a: Occurrence, b: Occurrence) => a.dueAt - b.dueAt || (a.key < b.key ? -1 : 1);
  overdue.sort(byDue);
  dueToday.sort(byDue);
  thisWeek.sort(byDue);

  // Holiday triage: after a gap, overdue work becomes one check per plant (or per space) instead of a
  // replay of every missed watering.
  const awayDays = input.awayDays ?? 3;
  const lastAt = input.lastActivityAt ?? null;
  const gapDays = lastAt === null ? null : Math.floor((input.now - lastAt) / 86_400_000);
  let welcomeBack: CareQueue['welcomeBack'] = null;
  const multiple = new Map<string, Occurrence[]>();
  for (const o of overdue) {
    const k = o.specimenId ?? `zone:${o.zoneId ?? '-'}`;
    multiple.set(k, [...(multiple.get(k) ?? []), o]);
  }
  if (gapDays !== null && gapDays >= awayDays && overdue.length > 0) {
    welcomeBack = {
      daysAway: gapDays,
      checks: [...multiple.values()].map((missed) => ({
        specimenId: missed[0]?.specimenId ?? null,
        zoneId: missed[0]?.zoneId ?? null,
        missed,
      })),
    };
  }
  return { overdue: welcomeBack ? [] : overdue, dueToday, thisWeek, welcomeBack };
}

/** A new version of a schedule applies from `today`; earlier occurrences keep their old identity. */
export function reviseSchedule<S extends ScheduleLike>(
  s: S,
  patch: Partial<Pick<S, 'rule' | 'title'>>,
  today: LocalDate,
): S {
  return { ...s, ...patch, version: s.version + 1, effectiveFrom: today };
}
