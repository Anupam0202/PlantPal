import { Temporal } from 'temporal-polyfill';
import type { LocalDate } from './dates';

/** Monday of the week containing `date` (ISO weeks). */
export function weekStart(date: LocalDate): LocalDate {
  const d = Temporal.PlainDate.from(date);
  return d.subtract({ days: d.dayOfWeek - 1 }).toString();
}

/** Last week's Monday–Sunday and this week's id, in the garden's own dates. */
export function lastWeek(today: LocalDate): { from: LocalDate; to: LocalDate; thisWeek: LocalDate } {
  const thisWeek = weekStart(today);
  const from = Temporal.PlainDate.from(thisWeek).subtract({ days: 7 }).toString();
  const to = Temporal.PlainDate.from(thisWeek).subtract({ days: 1 }).toString();
  return { from, to, thisWeek };
}

export interface WeekRecords {
  care: Array<{ kind: string; on: LocalDate }>;
  notes: Array<{ title: string; on: LocalDate }>;
  visits: Array<{ protocol: string; on: LocalDate }>;
  harvests: Array<{ massG: number | null; count: number | null; on: LocalDate }>;
}

export interface WeekSummary {
  from: LocalDate;
  to: LocalDate;
  care: number;
  careByKind: Record<string, number>;
  notes: string[];
  visits: number;
  harvests: number;
  /** Measured mass only; counts are never converted (S1). */
  harvestG: number;
  quiet: boolean;
}

/** Counts what was recorded between `from` and `to` (inclusive). Nothing is estimated. */
export function summarizeWeek(r: WeekRecords, from: LocalDate, to: LocalDate): WeekSummary {
  const inWeek = (on: LocalDate) => on >= from && on <= to;
  const care = r.care.filter((c) => inWeek(c.on));
  const careByKind: Record<string, number> = {};
  for (const c of care) careByKind[c.kind] = (careByKind[c.kind] ?? 0) + 1;
  const notes = r.notes.filter((n) => inWeek(n.on)).map((n) => n.title);
  const visits = r.visits.filter((v) => inWeek(v.on)).length;
  const harvests = r.harvests.filter((h) => inWeek(h.on));
  const harvestG = harvests.reduce((t, h) => t + (h.massG ?? 0), 0);
  return {
    from,
    to,
    care: care.length,
    careByKind,
    notes,
    visits,
    harvests: harvests.length,
    harvestG,
    quiet: care.length + notes.length + visits + harvests.length === 0,
  };
}

/** The plain-English summary the app shows and, if the person asks, sends for F8 wording. */
export function summaryText(s: WeekSummary): string {
  if (s.quiet) return 'Nothing logged last week.';
  const kinds = Object.entries(s.careByKind)
    .map(([k, n]) => `${k} ${n}`)
    .join(', ');
  return [
    s.care ? `Care logged ${s.care} times (${kinds}).` : null,
    s.notes.length ? `${s.notes.length} journal notes: ${s.notes.slice(0, 5).join('; ')}.` : null,
    s.visits ? `${s.visits} nature visits.` : null,
    s.harvests
      ? `${s.harvests} harvests${s.harvestG ? ` (${Math.round(s.harvestG) / 1000} kg weighed)` : ''}.`
      : null,
  ]
    .filter(Boolean)
    .join(' ');
}
