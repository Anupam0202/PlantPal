import { addDays, startOfLocalDay } from './dates';
import type { LocalDate } from './dates';
import { sunPosition } from './solar';

/**
 * Sun Hours Finder (master prompt §6.2): direct-sun hours for one spot, from the sun's path and the
 * spot's obstruction horizon. Direct-sun hours are not day length, illuminance, PPFD or DLI (S4).
 */

export const HORIZON_BIN_DEG = 5;
export const HORIZON_BINS = 360 / HORIZON_BIN_DEG;

/** Obstruction elevation (degrees above horizontal) per 5° azimuth bin; bin `i` covers [5i, 5i + 5). */
export type Horizon = number[];

/** The sun's centre counts as up when its upper limb clears a flat horizon (matches sunrise times). */
const FLAT_HORIZON_ELEVATION = -0.267;

const norm360 = (deg: number) => ((deg % 360) + 360) % 360;
const clampElev = (deg: number) => Math.min(90, Math.max(0, deg));

export function flatHorizon(): Horizon {
  return new Array<number>(HORIZON_BINS).fill(0);
}

export function isHorizon(value: unknown): value is Horizon {
  return (
    Array.isArray(value) &&
    value.length === HORIZON_BINS &&
    value.every((v) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 90)
  );
}

/** Elevation angle of an obstacle's top: `height` above the plant's level, `distance` away (same units). */
export function obstacleElevation(height: number, distance: number): number {
  if (!(height > 0)) return 0;
  if (!(distance > 0)) return 90;
  return (Math.atan(height / distance) * 180) / Math.PI;
}

/**
 * Raises the horizon to at least `elevationDeg` from `fromAz` clockwise to `toAz` (wraps through north).
 * Bins partly covered by the span are raised, so obstacles are never under-counted.
 */
export function addObstacle(horizon: Horizon, fromAz: number, toAz: number, elevationDeg: number): Horizon {
  const out = horizon.slice();
  const from = norm360(fromAz);
  let span = norm360(toAz) - from;
  if (span <= 0) span += 360;
  const elev = clampElev(elevationDeg);
  for (let i = 0; i < HORIZON_BINS; i++) {
    // Clockwise offset of the bin's start from `from`; the bin overlaps [from, from + span) when it
    // starts inside the span or wraps past `from`.
    const offset = norm360(i * HORIZON_BIN_DEG - from);
    if (offset < span || offset + HORIZON_BIN_DEG > 360) out[i] = Math.max(out[i] ?? 0, elev);
  }
  return out;
}

/** A spot against a wall: everything more than 90° from the facing direction is blocked by the building. */
export function wallBehind(facingDeg: number, horizon: Horizon = flatHorizon()): Horizon {
  return addObstacle(horizon, facingDeg + 90, facingDeg + 270, 90);
}

export function horizonAt(horizon: Horizon, azimuthDeg: number): number {
  const i = Math.floor(norm360(azimuthDeg) / HORIZON_BIN_DEG) % HORIZON_BINS;
  return horizon[i] ?? 0;
}

export interface SunSpot {
  lat: number;
  lon: number;
  /** The garden's IANA time zone: days run from local midnight to local midnight (S3). */
  timeZone: string;
  horizon: Horizon;
  /**
   * Ceiling or balcony above: `facingDeg` is the open side, `cutoffDeg` the angle from the plant up
   * to the overhang's edge, measured in the vertical plane perpendicular to the facade.
   */
  overhang?: { facingDeg: number; cutoffDeg: number } | null;
}

function blockedByOverhang(o: NonNullable<SunSpot['overhang']>, elevation: number, azimuth: number): boolean {
  const gamma = (((azimuth - o.facingDeg + 540) % 360) - 180) * (Math.PI / 180);
  const cosG = Math.cos(gamma);
  // Sun behind the facade: the building itself is in the way.
  if (cosG <= 0) return true;
  const profile = (Math.atan(Math.tan((elevation * Math.PI) / 180) / cosG) * 180) / Math.PI;
  return profile > o.cutoffDeg;
}

export function isDirectSun(spot: SunSpot, epochMs: number): boolean {
  const { elevation, azimuth } = sunPosition(epochMs, spot.lat, spot.lon);
  const h = horizonAt(spot.horizon, azimuth);
  if (elevation <= (h > 0 ? h : FLAT_HORIZON_ELEVATION)) return false;
  if (spot.overhang && blockedByOverhang(spot.overhang, elevation, azimuth)) return false;
  return true;
}

export interface SunWindow {
  start: number;
  end: number;
}

export interface DaySun {
  date: LocalDate;
  directHours: number;
  /** Hours the sun is above a flat horizon: the most a fully open spot could get. */
  daylightHours: number;
  windows: SunWindow[];
}

/**
 * Direct sun on one garden-local date, sampled every `stepMin` minutes between local midnights.
 * Days of 23 or 25 hours (DST changes) are handled because sampling walks real instants.
 */
export function directSunOnDate(spot: SunSpot, date: LocalDate, stepMin = 2): DaySun {
  const start = startOfLocalDay(date, spot.timeZone);
  const end = startOfLocalDay(addDays(date, 1), spot.timeZone);
  const step = stepMin * 60_000;
  const open: SunSpot = { ...spot, horizon: flatHorizon(), overhang: null };
  let direct = 0;
  let daylight = 0;
  const windows: SunWindow[] = [];
  let current: SunWindow | null = null;
  for (let t = start; t < end; t += step) {
    const mid = t + Math.min(step, end - t) / 2;
    const dur = Math.min(step, end - t);
    if (isDirectSun(open, mid)) daylight += dur;
    if (isDirectSun(spot, mid)) {
      direct += dur;
      if (current && current.end === t) current.end = t + dur;
      else {
        current = { start: t, end: t + dur };
        windows.push(current);
      }
    }
  }
  return {
    date,
    directHours: direct / 3_600_000,
    daylightHours: daylight / 3_600_000,
    windows,
  };
}

export interface SunProfile {
  year: number;
  /** Direct-sun hours on the 21st of each month, January first. */
  monthlyHours: number[];
  monthly: DaySun[];
  /** Mean of the monthly values. */
  meanHours: number;
  minHours: number;
  maxHours: number;
}

/** Monthly direct-sun profile on the 21st of every month of `year` (solstices and equinoxes included). */
export function sunProfile(spot: SunSpot, year: number, stepMin = 4): SunProfile {
  const monthly = Array.from({ length: 12 }, (_, m) =>
    directSunOnDate(spot, `${year}-${String(m + 1).padStart(2, '0')}-21`, stepMin),
  );
  const hours = monthly.map((d) => round1(d.directHours));
  return {
    year,
    monthlyHours: hours,
    monthly,
    meanHours: round1(hours.reduce((a, b) => a + b, 0) / 12),
    minHours: Math.min(...hours),
    maxHours: Math.max(...hours),
  };
}

const round1 = (x: number) => Math.round(x * 10) / 10;

/**
 * Quick estimate from what the user saw on a clear day in summer and in winter: a smooth annual curve
 * between the two, peaking at the local summer solstice (S18). Marked as an estimate by callers.
 */
export function quickProfile(
  summerHours: number,
  winterHours: number,
  hemisphere: 'north' | 'south',
): number[] {
  const peak = hemisphere === 'north' ? 5 : 11; // June or December (month index)
  return Array.from({ length: 12 }, (_, m) => {
    const w = (1 + Math.cos(((m - peak) * Math.PI) / 6)) / 2;
    return round1(winterHours + (summerHours - winterHours) * w);
  });
}

// ---------------------------------------------------------------- light classes

/**
 * Light classes by direct-sun hours. Extension services commonly define full sun as at least 6 hours
 * of direct sun, part sun or part shade as 3–6 hours and shade as under 3 hours (for example NC State
 * Extension's "Sun to Shade" handout). PlantPal splits shade at 1 hour to tell deep shade apart.
 */
export const LIGHT_CLASS_RULES = {
  fullSunMinHours: 6,
  partSunMinHours: 3,
  partShadeMinHours: 1,
  source: 'NC State Extension, "Sun to Shade" (summary of common extension definitions)',
  sourceUrl: 'https://buncombe.ces.ncsu.edu/wp-content/uploads/2020/06/Sun-to-Shade-Handout-short.pdf',
} as const;

export type LightClass = 'full-sun' | 'part-sun' | 'part-shade' | 'shade';

export function lightClass(directHours: number): LightClass {
  if (directHours >= LIGHT_CLASS_RULES.fullSunMinHours) return 'full-sun';
  if (directHours >= LIGHT_CLASS_RULES.partSunMinHours) return 'part-sun';
  if (directHours >= LIGHT_CLASS_RULES.partShadeMinHours) return 'part-shade';
  return 'shade';
}

/** Typical hours for each class, used when the user picks a class instead of measuring. */
export const LIGHT_CLASS_HOURS: Record<LightClass, { min: number; max: number }> = {
  'full-sun': { min: 6, max: 10 },
  'part-sun': { min: 3, max: 6 },
  'part-shade': { min: 1, max: 3 },
  shade: { min: 0, max: 1 },
};

// ---------------------------------------------------------------- quick horizon from simple answers

export type Obstruction = 'none' | 'low' | 'medium' | 'high';

/** Typical elevation of buildings or trees across from the spot, by the user's rough description. */
export const OBSTRUCTION_ELEVATION: Record<Obstruction, number> = { none: 0, low: 15, medium: 30, high: 50 };

export interface FacingAnswers {
  /** Direction the open side faces, degrees clockwise from north. Null for a fully open spot. */
  facingDeg: number | null;
  /** Covered by a ceiling or the balcony above. */
  covered: boolean;
  /** Typical overhang cut-off when covered: a standard balcony depth over a standard storey. */
  overhangDeg?: number;
  across: Obstruction;
}

/** Builds a horizon and overhang from the quick questions (facing, covered, what's across). */
export function spotFromAnswers(a: FacingAnswers, base: Pick<SunSpot, 'lat' | 'lon' | 'timeZone'>): SunSpot {
  let horizon = flatHorizon();
  const across = OBSTRUCTION_ELEVATION[a.across];
  if (a.facingDeg === null) {
    if (across > 0) horizon = addObstacle(horizon, 0, 360, across);
    return { ...base, horizon, overhang: null };
  }
  if (across > 0) horizon = addObstacle(horizon, a.facingDeg - 90, a.facingDeg + 90, across);
  horizon = wallBehind(a.facingDeg, horizon);
  return {
    ...base,
    horizon,
    overhang: a.covered ? { facingDeg: a.facingDeg, cutoffDeg: a.overhangDeg ?? 50 } : null,
  };
}

/** Months considered "growing months" for a sowing season, by hemisphere and latitude (S18). */
export function growingMonths(season: 'cool' | 'warm' | 'any', lat: number): number[] {
  const all = Array.from({ length: 12 }, (_, i) => i);
  // In the tropics temperature seasons are weak; light matters all year.
  if (season === 'any' || Math.abs(lat) < 23.5) return all;
  const north = lat >= 0;
  const warm = north ? [3, 4, 5, 6, 7, 8] : [9, 10, 11, 0, 1, 2];
  const cool = north ? [8, 9, 10, 2, 3, 4] : [2, 3, 4, 8, 9, 10];
  return season === 'warm' ? warm : cool;
}
