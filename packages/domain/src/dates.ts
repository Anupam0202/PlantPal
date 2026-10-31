import { Temporal } from 'temporal-polyfill';
import { isLocalDateString } from '@plantpal/schemas';

export type LocalDate = string;

export function isLocalDate(value: unknown): value is LocalDate {
  return typeof value === 'string' && isLocalDateString(value);
}

export function isValidTimeZone(tz: string): boolean {
  try {
    Temporal.Now.zonedDateTimeISO(tz);
    return true;
  } catch {
    return false;
  }
}

/** The device's IANA time zone, falling back to UTC. */
export function deviceTimeZone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return tz && isValidTimeZone(tz) ? tz : 'UTC';
  } catch {
    return 'UTC';
  }
}

/** Garden-local calendar date of an instant. */
export function localDateOf(epochMs: number, timeZone: string): LocalDate {
  return Temporal.Instant.fromEpochMilliseconds(epochMs)
    .toZonedDateTimeISO(timeZone)
    .toPlainDate()
    .toString();
}

export function todayIn(timeZone: string, now: number = Date.now()): LocalDate {
  return localDateOf(now, timeZone);
}

export function addDays(date: LocalDate, days: number): LocalDate {
  return Temporal.PlainDate.from(date).add({ days }).toString();
}

/** Whole days from `a` to `b` (positive when `b` is later). */
export function daysBetween(a: LocalDate, b: LocalDate): number {
  return Temporal.PlainDate.from(a).until(Temporal.PlainDate.from(b), { largestUnit: 'days' }).days;
}

/** Instant of local midnight at the start of `date` in `timeZone` (handles DST gaps). */
export function startOfLocalDay(date: LocalDate, timeZone: string): number {
  return Temporal.PlainDate.from(date).toZonedDateTime({ timeZone }).epochMilliseconds;
}

/**
 * An instant for a garden-local date plus the current wall-clock time, used when the user picks
 * a past date in a form ("watered yesterday") so the event keeps a plausible time of day.
 */
export function instantForLocalDate(date: LocalDate, timeZone: string, now: number = Date.now()): number {
  const nowZ = Temporal.Instant.fromEpochMilliseconds(now).toZonedDateTimeISO(timeZone);
  const zdt = Temporal.PlainDate.from(date).toZonedDateTime({ timeZone, plainTime: nowZ.toPlainTime() });
  return zdt.epochMilliseconds;
}

/**
 * Lenient parser for dates found in older data: accepts ISO date-times (with or without zone) and
 * plain `YYYY-MM-DD`. Returns `null` for anything else instead of guessing.
 */
export function parseLooseDate(
  value: unknown,
  timeZone: string,
): { epochMs: number; localDate: LocalDate; dateOnly: boolean } | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value <= 0) return null;
    return { epochMs: value, localDate: localDateOf(value, timeZone), dateOnly: false };
  }
  const s = value.trim();
  if (isLocalDate(s)) {
    return { epochMs: startOfLocalDay(s, timeZone), localDate: s, dateOnly: true };
  }
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) return null;
  try {
    const hasZone = /(Z|[+-]\d{2}:?\d{2})$/i.test(s);
    const epochMs = hasZone
      ? Temporal.Instant.from(s).epochMilliseconds
      : Temporal.PlainDateTime.from(s).toZonedDateTime(timeZone).epochMilliseconds;
    return { epochMs, localDate: localDateOf(epochMs, timeZone), dateOnly: false };
  } catch {
    return null;
  }
}
