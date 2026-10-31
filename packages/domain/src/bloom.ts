import type { HEMISPHERES, Level, Taxon } from '@plantpal/schemas';
import { trait } from './eligibility';

type Hemisphere = (typeof HEMISPHERES)[number];

export type Month = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;
export const MONTHS: readonly Month[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

/** Catalogue bloom months are northern-hemisphere reference timing; the south is six months on. */
export function rotateMonth(m: number, hemisphere: Hemisphere): Month {
  return (hemisphere === 'south' ? ((m + 5) % 12) + 1 : m) as Month;
}

export interface BloomInput {
  id: string;
  name: string;
  /** Reference bloom months from the catalogue; `null` when unknown. */
  bloomMonths: readonly number[] | null;
  pollinatorValue: Level | null;
  /** The person's own flowering checks per month: they override the catalogue. */
  observed: Partial<Record<Month, 'YES' | 'NO'>>;
}

export type PlantMonth = 'bloom' | 'no' | 'unknown';
export type MonthState = 'FORAGE' | 'GAP' | 'UNKNOWN';

export interface BloomWheel {
  plants: Array<{
    id: string;
    name: string;
    months: Record<Month, PlantMonth>;
    source: Record<Month, 'observed' | 'catalogue' | 'unknown'>;
    /** True when it feeds pollinators while in bloom (medium or high value); null when unknown. */
    forage: boolean | null;
  }>;
  months: Record<Month, { state: MonthState; foragers: string[] }>;
  /** Months with zero known forage and nothing unknown: hunger gaps. */
  gaps: Month[];
  /** Months where missing data means we cannot tell. Never shown as gaps (S2). */
  unknown: Month[];
}

const forageOf = (v: Level | null): boolean | null => (v === null ? null : v !== 'low');

export function bloomWheel(plants: readonly BloomInput[], hemisphere: Hemisphere): BloomWheel {
  const rows = plants.map((p) => {
    const ref = p.bloomMonths ? new Set(p.bloomMonths.map((m) => rotateMonth(m, hemisphere))) : null;
    const months = {} as Record<Month, PlantMonth>;
    const source = {} as Record<Month, 'observed' | 'catalogue' | 'unknown'>;
    for (const m of MONTHS) {
      const seen = p.observed[m];
      if (seen) {
        months[m] = seen === 'YES' ? 'bloom' : 'no';
        source[m] = 'observed';
      } else if (ref) {
        months[m] = ref.has(m) ? 'bloom' : 'no';
        source[m] = 'catalogue';
      } else {
        months[m] = 'unknown';
        source[m] = 'unknown';
      }
    }
    return { id: p.id, name: p.name, months, source, forage: forageOf(p.pollinatorValue) };
  });

  const months = {} as BloomWheel['months'];
  const gaps: Month[] = [];
  const unknown: Month[] = [];
  for (const m of MONTHS) {
    const foragers = rows.filter((r) => r.months[m] === 'bloom' && r.forage === true).map((r) => r.name);
    const unsure = rows.some(
      (r) => r.months[m] === 'unknown' || (r.months[m] === 'bloom' && r.forage === null),
    );
    const state: MonthState = foragers.length > 0 ? 'FORAGE' : unsure ? 'UNKNOWN' : 'GAP';
    months[m] = { state, foragers };
    if (state === 'GAP') gaps.push(m);
    if (state === 'UNKNOWN') unknown.push(m);
  }
  return { plants: rows, months, gaps, unknown };
}

/** Catalogue plants that flower in at least one gap month and feed pollinators, most gap months first. */
export function gapFillers(
  taxa: readonly Taxon[],
  gaps: readonly Month[],
  hemisphere: Hemisphere,
): Array<{ taxon: Taxon; months: Month[] }> {
  if (gaps.length === 0) return [];
  const want = new Set(gaps);
  return taxa
    .flatMap((t) => {
      const bloom = trait(t, 'bloomMonths');
      if (!bloom || forageOf(trait(t, 'pollinatorValue')) !== true) return [];
      const months = [...new Set(bloom.map((m) => rotateMonth(m, hemisphere)))].filter((m) => want.has(m));
      return months.length ? [{ taxon: t, months: months.sort((a, b) => a - b) }] : [];
    })
    .sort((a, b) => b.months.length - a.months.length || a.taxon.names.en.localeCompare(b.taxon.names.en));
}
