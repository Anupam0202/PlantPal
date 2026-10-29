import { Temporal } from 'temporal-polyfill';
import type { LocalDate } from './dates';

/**
 * Heat Shield and Frost Guard (master prompt §6.5). These are **gardening guidance, not safety
 * warnings**. They are compared with the garden's own climatology and each plant's tolerance, look 24–72
 * hours ahead, and never trigger from stale forecasts.
 */

export const FROST_TRIGGER_C = 2;
export const HARD_FROST_C = -2;
export const HEAT_DAY_C = 35;

export interface ForecastDay {
  date: LocalDate;
  tmaxC: number | null;
  tminC: number | null;
}

export interface PlantExposure {
  specimenId: string;
  name: string;
  /** Lowest tolerated air temperature, °C; null when the catalogue has no value. */
  minTempC: number | null;
  heatTolerance: 'low' | 'medium' | 'high' | null;
  indoor: boolean;
  containers: boolean;
  /** Direct-sun hours in the warm months (higher exposure amplifies heat). */
  sunHours: number | null;
}

export type FrostAction = 'cover' | 'moveIn' | 'group' | 'wrapPots' | 'waterBefore';
export type HeatAction = 'shadeCloth' | 'moveTender' | 'waterEarly' | 'groupPots' | 'mulch' | 'postpone';

export interface GardenAlert {
  kind: 'frost' | 'heat';
  severity: 'watch' | 'act';
  date: LocalDate;
  /** Forecast value that triggered it, °C. */
  valueC: number;
  thresholdC: number;
  /** For heat: the garden's own 90th percentile for that month, when known. */
  climatologyC: number | null;
  affected: Array<{
    specimenId: string;
    name: string;
    reason: 'belowTolerance' | 'nearTolerance' | 'unknown' | 'heatSensitive';
  }>;
  actions: Array<FrostAction | HeatAction>;
}

export interface AlertInput {
  forecast: readonly ForecastDay[];
  /** A forecast past its freshness window must not raise alerts. */
  stale: boolean;
  today: LocalDate;
  /** 90th percentile of daily maximum by month (January first), from the climate profile. */
  tmaxP90ByMonth: ReadonlyArray<number | null> | null;
  plants: readonly PlantExposure[];
  /** Days ahead to consider, 1–3. */
  horizonDays?: number;
}

const monthIdx = (d: LocalDate) => Number(d.slice(5, 7)) - 1;

export function gardenAlerts(input: AlertInput): GardenAlert[] {
  if (input.stale) return [];
  const horizon = Math.min(3, Math.max(1, input.horizonDays ?? 3));
  const last = Temporal.PlainDate.from(input.today).add({ days: horizon }).toString();
  const outdoor = input.plants.filter((p) => !p.indoor);
  const alerts: GardenAlert[] = [];

  for (const day of input.forecast) {
    if (day.date < input.today || day.date > last) continue;

    // Frost: forecast minimum at 2 m of 2 °C or less. Pots lose heat from the sides too: 2 °C margin.
    if (day.tminC !== null && day.tminC <= FROST_TRIGGER_C) {
      const affected: GardenAlert['affected'] = [];
      for (const p of outdoor) {
        const margin = p.containers ? 2 : 0;
        if (p.minTempC === null) affected.push({ specimenId: p.specimenId, name: p.name, reason: 'unknown' });
        else if (p.minTempC + margin > day.tminC)
          affected.push({ specimenId: p.specimenId, name: p.name, reason: 'belowTolerance' });
        else if (p.minTempC + margin + 3 > day.tminC)
          affected.push({ specimenId: p.specimenId, name: p.name, reason: 'nearTolerance' });
      }
      if (affected.length > 0) {
        const act = affected.some((a) => a.reason === 'belowTolerance') || day.tminC <= HARD_FROST_C;
        alerts.push({
          kind: 'frost',
          severity: act ? 'act' : 'watch',
          date: day.date,
          valueC: day.tminC,
          thresholdC: FROST_TRIGGER_C,
          climatologyC: null,
          affected,
          actions: [
            'cover',
            'moveIn',
            'group',
            ...(outdoor.some((p) => p.containers) ? (['wrapPots'] as const) : []),
            'waterBefore',
          ],
        });
      }
    }

    // Heat: hot by absolute standards or unusually hot for this place and month.
    if (day.tmaxC !== null) {
      const p90 = input.tmaxP90ByMonth?.[monthIdx(day.date)] ?? null;
      const unusual = p90 !== null && day.tmaxC >= p90 && day.tmaxC >= 28;
      if (day.tmaxC >= HEAT_DAY_C || unusual) {
        const affected: GardenAlert['affected'] = [];
        for (const p of outdoor) {
          const exposed = (p.sunHours ?? 6) >= 4 ? 0 : 2; // shade buys a couple of degrees of slack
          const limit =
            p.heatTolerance === 'low'
              ? 28
              : p.heatTolerance === 'medium'
                ? 33
                : p.heatTolerance === 'high'
                  ? 38
                  : null;
          if (limit === null) affected.push({ specimenId: p.specimenId, name: p.name, reason: 'unknown' });
          else if (day.tmaxC >= limit + exposed)
            affected.push({ specimenId: p.specimenId, name: p.name, reason: 'heatSensitive' });
        }
        if (affected.length > 0) {
          alerts.push({
            kind: 'heat',
            severity:
              day.tmaxC >= HEAT_DAY_C + 3 || affected.some((a) => a.reason === 'heatSensitive')
                ? 'act'
                : 'watch',
            date: day.date,
            valueC: day.tmaxC,
            thresholdC: Math.min(HEAT_DAY_C, p90 ?? HEAT_DAY_C),
            climatologyC: p90,
            affected,
            actions: ['shadeCloth', 'moveTender', 'waterEarly', 'groupPots', 'mulch', 'postpone'],
          });
        }
      }
    }
  }
  // One alert per kind: the most severe (coldest or hottest) day in the window.
  const pick = (kind: 'frost' | 'heat') => {
    const xs = alerts.filter((a) => a.kind === kind);
    if (xs.length === 0) return [];
    return [
      xs.reduce((a, b) => (kind === 'frost' ? (b.valueC < a.valueC ? b : a) : b.valueC > a.valueC ? b : a)),
    ];
  };
  return [...pick('frost'), ...pick('heat')];
}
