import { Temporal } from 'temporal-polyfill';
import type { LocalDate } from './dates';

/**
 * Water-Wise engine (master prompt §6.4, S5): a daily container water balance that suggests when to
 * **check**, never a fixed prescription, and never controls anything. 1 mm over 1 m² is 1 litre.
 *
 * Every coefficient below is a documented, editable assumption, labelled as an estimate in the UI.
 */

/** Share of container volume a plant can readily use, by substrate (assumption; editable per container). */
export const SUBSTRATE_AVAILABLE_FRACTION = {
  'potting-mix': 0.3,
  'peat-free': 0.28,
  coir: 0.35,
  'garden-soil': 0.18,
  gritty: 0.15,
} as const;
export type Substrate = keyof typeof SUBSTRATE_AVAILABLE_FRACTION;

/**
 * Generic crop-coefficient classes for the mid season, scaled from FAO-56 Table 12 values for similar
 * crops (vegetables ≈ 1.0–1.15). Ornamentals and houseplants use broad class factors (estimates).
 */
export const KC_CLASS = {
  herb: 0.9,
  leafy: 1.0,
  fruiting: 1.1,
  root: 1.0,
  fruit: 0.95,
  flower: 0.9,
  foliage: 0.8,
  houseplant: 0.5,
} as const;
export type KcClass = keyof typeof KC_CLASS;

/** Growth stage multipliers on the mid-season Kc (FAO-56 initial / development / mid / late pattern). */
export const STAGE_FACTOR = { initial: 0.6, development: 0.85, mid: 1, late: 0.8 } as const;
export type Stage = keyof typeof STAGE_FACTOR;

/** Exposure multiplier from direct-sun hours and wind (assumption). */
export function exposureFactor(
  sunHours: number | null,
  wind: 'sheltered' | 'moderate' | 'exposed' | null,
): number {
  const sun = sunHours === null ? 0.85 : sunHours >= 6 ? 1 : sunHours >= 3 ? 0.8 : 0.6;
  const w = wind === 'exposed' ? 1.15 : wind === 'sheltered' ? 0.9 : 1;
  return Math.round(sun * w * 1000) / 1000;
}

/** Fraction of rain on the pot surface that soaks in (the rest splashes or runs off). */
export const RAIN_CATCH_EFFICIENCY = 0.9;
/** Indoors there is no reference ET₀ from weather; a low constant demand is assumed (estimate). */
export const INDOOR_ET_MM = 1.2;

export interface ContainerWater {
  volumeL: number;
  availableFraction: number;
  kc: number;
  exposure: number;
  /** Leaf canopy area that transpires, m² (≥ the pot surface for most plants). */
  canopyM2: number;
  /** Pot surface that catches rain, m². */
  catchM2: number;
  /** Rain cannot reach it (S5). */
  covered: boolean;
  indoor: boolean;
  /** Personal factor learned from checks, bounded to [0.5, 2]. */
  personalFactor: number;
}

export interface WaterDay {
  date: LocalDate;
  /** FAO-56 reference evapotranspiration, mm; null when unknown (never 0 by default, S2). */
  et0Mm: number | null;
  rainMm: number | null;
}

export interface WaterBalance {
  /** Readily available water when the pot is freshly watered, L. */
  capacityL: number;
  /** Stored water at the end of each day, L, never negative and never above capacity. */
  storedL: number[];
  demandL: number[];
  rainInL: number[];
  drainedL: number[];
  /** First day at or below half capacity: "likely dry at 2 cm, check". */
  checkBy: LocalDate | null;
  /** First day at or below 10 % of capacity. */
  dryBy: LocalDate | null;
  /** True when any input was unknown and a fallback was used: show a wider range, check more often. */
  uncertain: boolean;
}

const FALLBACK_ET0_MM = 4;

/**
 * Daily balance from a starting store: demand = ET₀ × Kc × exposure × canopy × personal factor;
 * rain adds only to uncovered pots, capped at capacity (the excess drains).
 */
export function simulateContainer(
  c: ContainerWater,
  days: readonly WaterDay[],
  startStoredL?: number,
): WaterBalance {
  const capacityL = Math.max(0, c.volumeL * c.availableFraction);
  let stored = Math.min(capacityL, Math.max(0, startStoredL ?? capacityL));
  const storedL: number[] = [];
  const demandL: number[] = [];
  const rainInL: number[] = [];
  const drainedL: number[] = [];
  let checkBy: LocalDate | null = null;
  let dryBy: LocalDate | null = null;
  let uncertain = false;
  for (const d of days) {
    let et0 = c.indoor ? INDOOR_ET_MM : d.et0Mm;
    if (et0 === null) {
      et0 = FALLBACK_ET0_MM;
      uncertain = true;
    }
    const demand = Math.max(0, et0 * c.kc * c.exposure * c.canopyM2 * c.personalFactor);
    const rain =
      c.covered || c.indoor || d.rainMm === null
        ? 0
        : Math.max(0, d.rainMm) * c.catchM2 * RAIN_CATCH_EFFICIENCY;
    if (!c.covered && !c.indoor && d.rainMm === null) uncertain = true;
    const afterRain = stored + rain;
    const drained = Math.max(0, afterRain - capacityL);
    stored = Math.max(0, afterRain - drained - demand);
    storedL.push(round3(stored));
    demandL.push(round3(demand));
    rainInL.push(round3(rain));
    drainedL.push(round3(drained));
    if (checkBy === null && stored <= capacityL * 0.5) checkBy = d.date;
    if (dryBy === null && stored <= capacityL * 0.1) dryBy = d.date;
  }
  return { capacityL: round3(capacityL), storedL, demandL, rainInL, drainedL, checkBy, dryBy, uncertain };
}

const round3 = (x: number) => Math.round(x * 1000) / 1000;

export type SoilCheck = 'dry' | 'moist' | 'wet';

/**
 * Learns from a fingertip check (§6.4): if the pot was wetter than predicted, the plant uses less than
 * assumed; if drier, more. Each check moves the factor by 15 %, bounded to [0.5, 2].
 */
export function recalibrate(factor: number, predicted: 'dry' | 'moist', observed: SoilCheck): number {
  let next = factor;
  if (predicted === 'dry' && (observed === 'moist' || observed === 'wet')) next = factor * 0.85;
  if (predicted === 'moist' && observed === 'dry') next = factor * 1.15;
  return Math.round(Math.min(2, Math.max(0.5, next)) * 1000) / 1000;
}

/** A watering amount that refills the readily available water without flooding (presets in the UI). */
export function suggestedWateringL(capacityL: number, storedL: number): number {
  const deficit = Math.max(0, capacityL - storedL);
  // Water until a little drains: 10 % extra flushes salts; never less than 0.1 L.
  return Math.max(0.1, Math.round(deficit * 1.1 * 10) / 10);
}

/** Pot surface from container dimensions, m². */
export function potSurfaceM2(dims: {
  diameterCm?: number;
  lengthCm?: number;
  widthCm?: number;
}): number | null {
  if (dims.diameterCm) return Math.PI * (dims.diameterCm / 200) ** 2;
  if (dims.lengthCm && dims.widthCm) return (dims.lengthCm / 100) * (dims.widthCm / 100);
  return null;
}

/** Plant canopy from its typical spread, m² (falls back to the pot surface). */
export function canopyM2(spreadCm: number | null, potM2: number | null): number {
  const fromSpread = spreadCm === null ? null : Math.PI * (spreadCm / 200) ** 2;
  return Math.max(fromSpread ?? 0, potM2 ?? 0, 0.01);
}

export function addDaysTo(date: LocalDate, n: number): LocalDate {
  return Temporal.PlainDate.from(date).add({ days: n }).toString();
}

// ---------------------------------------------------------------- rain harvest

/** Typical runoff coefficients by roof surface (assumption; check local extension guidance). */
export const RUNOFF_COEFFICIENT = {
  metal: 0.9,
  'tile-or-concrete': 0.8,
  'membrane-or-bitumen': 0.85,
  green: 0.3,
} as const;
export type RoofSurface = keyof typeof RUNOFF_COEFFICIENT;

/** Roofs whose runoff should not go on edible crops (S5, §6.4). */
export const ROOFS_NOT_FOR_EDIBLES: readonly RoofSurface[] = ['membrane-or-bitumen'];

export interface TankInput {
  catchmentM2: number;
  runoffCoefficient: number;
  /** Diverted at the start of each rain day, L. */
  firstFlushL: number;
  capacityL: number;
  dailyDemandL: number;
  startL?: number;
}

export interface TankResult {
  storageL: number[];
  inflowL: number;
  suppliedL: number;
  overflowL: number;
  demandL: number;
  overflowDays: number;
  /** Share of demand met from the tank, 0–1. */
  metFraction: number;
  startL: number;
  endL: number;
}

/** Daily tank mass balance (§6.4): storage never negative, never above capacity, mass conserved. */
export function simulateTank(t: TankInput, dailyRainMm: readonly number[]): TankResult {
  const cap = Math.max(0, t.capacityL);
  const startL = Math.min(cap, Math.max(0, t.startL ?? 0));
  let s = startL;
  const storageL: number[] = [];
  let inflowL = 0;
  let suppliedL = 0;
  let overflowL = 0;
  let overflowDays = 0;
  for (const rain of dailyRainMm) {
    const gross = Math.max(0, rain) * t.catchmentM2 * t.runoffCoefficient;
    const inflow = rain > 0 ? Math.max(0, gross - t.firstFlushL) : 0;
    inflowL += inflow;
    s += inflow;
    if (s > cap) {
      overflowL += s - cap;
      overflowDays++;
      s = cap;
    }
    const supply = Math.min(s, Math.max(0, t.dailyDemandL));
    suppliedL += supply;
    s -= supply;
    storageL.push(s);
  }
  const demandL = Math.max(0, t.dailyDemandL) * dailyRainMm.length;
  return {
    storageL,
    inflowL,
    suppliedL,
    overflowL,
    demandL,
    overflowDays,
    metFraction: demandL === 0 ? 1 : suppliedL / demandL,
    startL,
    endL: s,
  };
}

/** Smallest tank from `sizes` meeting `target` of demand, or the largest when none does. */
export function suggestTankSize(
  base: Omit<TankInput, 'capacityL'>,
  dailyRainMm: readonly number[],
  sizes: readonly number[] = [100, 200, 300, 500, 1000, 2000],
  target = 0.8,
): { capacityL: number; result: TankResult } {
  const sorted = [...sizes].sort((a, b) => a - b);
  let last: { capacityL: number; result: TankResult } | null = null;
  for (const capacityL of sorted) {
    const result = simulateTank({ ...base, capacityL }, dailyRainMm);
    last = { capacityL, result };
    if (result.metFraction >= target) return last;
  }
  return last ?? { capacityL: 0, result: simulateTank({ ...base, capacityL: 0 }, dailyRainMm) };
}
