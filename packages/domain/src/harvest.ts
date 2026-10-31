import type { Harvest, PantryItem, PantryState } from '@plantpal/schemas';
import { addDays } from './dates';
import { qty, totalsByDimension, type Quantity } from './quantity';

/** Mass and counts kept apart (S1): `500 g + 3 bunches` is never one number. */
export interface Totals {
  massG: number;
  counts: Record<string, number>;
  /** Records with no amount at all: counted as entries, never as zero grams. */
  withoutAmount: number;
  entries: number;
}

function quantitiesOf(r: {
  massG: number | null;
  count: number | null;
  countLabel: string | null;
}): Quantity[] {
  const out: Quantity[] = [];
  if (r.massG !== null) out.push(qty('mass', r.massG, 'g'));
  if (r.count !== null)
    out.push(qty('count', r.count, (r.countLabel ?? 'item').trim().toLowerCase() || 'item'));
  return out;
}

export function totalsOf(
  records: ReadonlyArray<{
    massG: number | null;
    count: number | null;
    countLabel: string | null;
    deletedAt: number | null;
  }>,
): Totals {
  const live = records.filter((r) => r.deletedAt === null);
  const all = live.flatMap(quantitiesOf);
  const t = totalsByDimension(all);
  const counts: Record<string, number> = {};
  for (const [k, q] of t) if (k.startsWith('count:')) counts[q.unit] = q.value;
  return {
    massG: Math.round((t.get('mass')?.value ?? 0) * 100) / 100,
    counts,
    withoutAmount: live.filter((r) => r.massG === null && r.count === null).length,
    entries: live.length,
  };
}

export const harvestTotals = (h: readonly Harvest[]) => totalsOf(h);

/** Given, composted and wasted are where produce ends; it can still be undone with a new version. */
export const FINAL_PANTRY_STATES: readonly PantryState[] = ['given', 'composted', 'wasted'];

export function canMovePantry(from: PantryState, to: PantryState): boolean {
  return from !== to && !FINAL_PANTRY_STATES.includes(from);
}

export function pantryTotals(items: readonly PantryItem[]): Record<PantryState, Totals> {
  const by = {} as Record<PantryState, PantryItem[]>;
  for (const s of ['fresh', 'stored', 'preserved', 'given', 'composted', 'wasted'] as const) by[s] = [];
  for (const i of items) if (i.deletedAt === null) by[i.state].push(i);
  return Object.fromEntries(Object.entries(by).map(([k, v]) => [k, totalsOf(v)])) as Record<
    PantryState,
    Totals
  >;
}

/**
 * Produce still on hand whose best-before date (set by the person) falls within `days` of `today`,
 * soonest first. PlantPal never invents storage times (S16).
 */
export function dueSoon(items: readonly PantryItem[], today: string, days = 2): PantryItem[] {
  const limit = addDays(today as Parameters<typeof addDays>[0], days);
  return items
    .filter(
      (i) =>
        i.deletedAt === null &&
        !FINAL_PANTRY_STATES.includes(i.state) &&
        i.bestBefore !== null &&
        i.bestBefore <= limit,
    )
    .sort((a, b) => (a.bestBefore ?? '').localeCompare(b.bestBefore ?? ''));
}
