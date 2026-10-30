import type { LocalDate } from './dates';
import { weekStart } from './reflection';

/**
 * Field stamps (Appendix D): earned only from records the person can see, recalculated from those
 * records every time (deleting a record takes its credit away), no streaks, honest zeros count, and
 * widely spaced tiers. A stamp whose records PlantPal does not keep yet says so instead of guessing.
 */
export const STAMP_IDS = [
  'first-roots',
  'light-reader',
  'steady-hands',
  'rain-keeper',
  'soil-builder',
  'bloom-bridge',
  'native-nook',
  'host-haven',
  'pollinator-watch',
  'phenology-keeper',
  'first-harvest',
  'harvest',
  'seed-saver',
  'good-neighbour',
  'heat-shield',
  'trusted-sitter',
  'field-scholar',
  'open-science',
] as const;
export type StampId = (typeof STAMP_IDS)[number];

export interface StampInput {
  today: LocalDate;
  /** Living or past plants with their planted or sown date. */
  plantedOn: Array<LocalDate | null>;
  /** How each space's sun was measured. */
  sunMethods: Array<string | null>;
  /** Dates of care checks: completed or checked tasks and logged care. */
  careDays: LocalDate[];
  /** Rainwater used, per day, from logged watering (litres). */
  rainLitresByDay: Array<{ on: LocalDate; litres: number }>;
  /** Months with known forage (Bloom Bridge); null when it cannot be worked out. */
  bloomMonths: number | null;
  /** Active plants whose catalogue status for the garden's region is NATIVE (cited). */
  nativeActive: number;
  /** Timed pollinator counts: seconds counted and the protocol length. */
  timedCounts: Array<{ durationSec: number; plannedSec: number }>;
  /** Phenology checks by date. */
  phenologyDays: LocalDate[];
  /** Harvests: measured mass only (counts are never converted). */
  harvests: Array<{ massG: number | null }>;
  /** Seed lots saved from the person's own plants, with how many germination tests. */
  seedLots: Array<{ fromOwnPlant: boolean; tests: number }>;
  lessonsDone: number;
}

export interface Stamp {
  id: StampId;
  /** Thresholds for each tier, lowest first. */
  tiers: number[];
  /** Progress towards the next tier; null when PlantPal does not keep the records needed yet. */
  value: number | null;
  /** Tiers earned (0 = none yet). */
  earned: number;
}

/** Each watering's rainwater is capped at a plausible daily amount for a home catchment. */
export const RAIN_DAILY_CAP_L = 500;

const tierOf = (value: number, tiers: number[]) => tiers.filter((t) => value >= t).length;
const distinct = <T>(xs: T[]) => new Set(xs).size;

export function fieldStamps(i: StampInput): Stamp[] {
  const stamp = (id: StampId, tiers: number[], value: number | null): Stamp => ({
    id,
    tiers,
    value,
    earned: value === null ? 0 : tierOf(value, tiers),
  });

  const planted = i.plantedOn.filter((d): d is LocalDate => d !== null && d <= i.today).length;
  const scanned = i.sunMethods.filter((m) => m === 'horizon' || m === 'measured').length;
  const weeks = distinct(i.careDays.filter((d) => d <= i.today).map(weekStart));
  const byDay = new Map<string, number>();
  for (const r of i.rainLitresByDay) byDay.set(r.on, (byDay.get(r.on) ?? 0) + Math.max(0, r.litres));
  const rain = [...byDay.values()].reduce((t, l) => t + Math.min(l, RAIN_DAILY_CAP_L), 0);
  const counts = i.timedCounts.filter((c) => c.plannedSec > 0 && c.durationSec >= c.plannedSec).length;
  const phenoDays = [...new Set(i.phenologyDays)];
  const phenoMonths = distinct(phenoDays.map((d) => d.slice(0, 7)));
  const kg = i.harvests.reduce((t, h) => t + (h.massG ?? 0), 0) / 1000;

  return [
    stamp('first-roots', [1], planted),
    stamp('light-reader', [1], scanned),
    stamp('steady-hands', [12, 26, 52], weeks),
    stamp('rain-keeper', [50, 250, 1000], Math.round(rain)),
    // Compost made or used has no log in PlantPal yet.
    stamp('soil-builder', [10, 50, 200], null),
    stamp('bloom-bridge', [6, 9, 12], i.bloomMonths),
    stamp('native-nook', [3, 5, 10], i.nativeActive),
    // The catalogue does not record larval hosts yet.
    stamp('host-haven', [2], null),
    stamp('pollinator-watch', [3, 10, 25], counts),
    // Twelve checks on distinct dates, spread over at least three months.
    stamp('phenology-keeper', [12], phenoMonths >= 3 ? phenoDays.length : Math.min(phenoDays.length, 11)),
    stamp('first-harvest', [1], i.harvests.length),
    stamp('harvest', [1, 5, 20], Math.floor(kg * 10) / 10),
    stamp('seed-saver', [1], i.seedLots.filter((l) => l.fromOwnPlant && l.tests > 0).length),
    // These need records kept on the community server or features not built yet.
    stamp('good-neighbour', [1, 5], null),
    stamp('heat-shield', [1], null),
    stamp('trusted-sitter', [1], null),
    stamp('field-scholar', [5], i.lessonsDone),
    stamp('open-science', [10], null),
  ];
}
