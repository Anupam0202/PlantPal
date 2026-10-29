import type { CheckState, NatureVisit, VisitRecord, VisitWeather } from '@plantpal/schemas';
import { toCsv, type CsvColumn } from './csv';

/** Protocol lengths, in seconds. */
export const FIT_PLANNED_S = 600;
export const BIRD_PLANNED_S = 300;

/**
 * PoMS FIT Count weather guidance: dry, and at least 13 °C in sun or 15 °C when cloudy (ukpoms.org.uk;
 * verify against the current protocol). Outside it a count is still saved, and marked.
 */
export function fitWeatherOk(w: VisitWeather | null): boolean | null {
  if (!w || w.temperatureC === null || w.sky === null) return null;
  if (w.wind === 'strong') return false;
  return w.temperatureC >= (w.sky === 'sunny' ? 13 : 15);
}

/** Counted only when seen and confident; `UNCERTAIN` records are kept but never added to totals. */
const counted = (r: VisitRecord) => r.state === 'YES' && r.identityConfidence !== 'unsure';

export interface VisitTotals {
  /** Confident individuals per group. A group checked with nothing seen is 0, not missing. */
  byGroup: Record<string, number>;
  total: number;
  uncertain: number;
  /** Insects per 100 target flowers, when the flower count is known and non-zero. */
  per100Flowers: number | null;
}

export function visitTotals(v: Pick<NatureVisit, 'records' | 'patchFlowerCount'>): VisitTotals {
  const byGroup: Record<string, number> = {};
  let uncertain = 0;
  for (const r of v.records) {
    if (r.state === 'NOT_CHECKED') continue;
    byGroup[r.group] ??= 0;
    if (counted(r)) byGroup[r.group]! += r.count ?? 1;
    else if (r.state === 'UNCERTAIN' || r.identityConfidence === 'unsure') uncertain += r.count ?? 1;
  }
  const total = Object.values(byGroup).reduce((a, b) => a + b, 0);
  const flowers = v.patchFlowerCount;
  return {
    byGroup,
    total,
    uncertain,
    per100Flowers: flowers ? Math.round((total / flowers) * 1000) / 10 : null,
  };
}

/** A timed count is complete when it ran its full planned length. */
export const isComplete = (v: Pick<NatureVisit, 'plannedS' | 'durationS'>) =>
  v.plannedS === 0 || v.durationS >= v.plannedS;

const dayOfYear = (on: string) => {
  const [y, m, d] = on.split('-').map(Number) as [number, number, number];
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 1)) / 86_400_000);
};
const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

/** Why two visits cannot be compared (S8). */
export type IncompatibleReason =
  'protocol' | 'incomplete' | 'target' | 'season' | 'weather-missing' | 'weather-band' | 'flowers-missing';

/** Season window: within 21 days of each other in the year (any year). */
export const SEASON_WINDOW_DAYS = 21;
/** Weather band: temperatures within 5 °C and the same kind of sky (sun vs overcast). */
export const WEATHER_BAND_C = 5;

export function compatibility(a: NatureVisit, b: NatureVisit): IncompatibleReason[] {
  const out: IncompatibleReason[] = [];
  if (a.protocol !== b.protocol) out.push('protocol');
  if (!isComplete(a) || !isComplete(b)) out.push('incomplete');
  if (a.protocol === 'fit-count') {
    const ta = a.targetTaxonId ?? norm(a.targetName);
    const tb = b.targetTaxonId ?? norm(b.targetName);
    if (!ta || ta !== tb) out.push('target');
    if (!a.patchFlowerCount || !b.patchFlowerCount) out.push('flowers-missing');
  }
  const gap = Math.abs(dayOfYear(a.occurredOn) - dayOfYear(b.occurredOn));
  if (Math.min(gap, 365 - gap) > SEASON_WINDOW_DAYS) out.push('season');
  const wa = a.weather;
  const wb = b.weather;
  if (!wa || !wb || wa.temperatureC === null || wb.temperatureC === null || !wa.sky || !wb.sky)
    out.push('weather-missing');
  else if (
    Math.abs(wa.temperatureC - wb.temperatureC) > WEATHER_BAND_C ||
    (wa.sky === 'overcast') !== (wb.sky === 'overcast')
  )
    out.push('weather-band');
  return out;
}

export type Trend =
  | {
      valid: true;
      points: Array<{ visitId: string; on: string; total: number; per100Flowers: number | null }>;
    }
  | { valid: false; compatible: number; reasons: Partial<Record<IncompatibleReason, number>> };

/**
 * A trend needs at least three effort-compatible visits with the reference (the latest). Otherwise it
 * says why, so the app can show history without implying change (S8).
 */
export function trendFor(visits: readonly NatureVisit[], minPoints = 3): Trend {
  const live = visits.filter((v) => v.deletedAt === null).sort((a, b) => b.startedAt - a.startedAt);
  const ref = live[0];
  if (!ref) return { valid: false, compatible: 0, reasons: {} };
  const reasons: Partial<Record<IncompatibleReason, number>> = {};
  const ok = [ref];
  if (!isComplete(ref)) reasons.incomplete = 1;
  for (const v of live.slice(1)) {
    const why = compatibility(ref, v);
    if (why.length === 0) ok.push(v);
    for (const r of why) reasons[r] = (reasons[r] ?? 0) + 1;
  }
  if (!isComplete(ref) || ok.length < minPoints) return { valid: false, compatible: ok.length, reasons };
  return {
    valid: true,
    points: ok
      .sort((a, b) => a.startedAt - b.startedAt)
      .map((v) => {
        const t = visitTotals(v);
        return { visitId: v.id, on: v.occurredOn, total: t.total, per100Flowers: t.per100Flowers };
      }),
  };
}

/** Taxa or groups seen (confidently) across visits: distinct names, not individuals (S8). */
export function taxaObserved(visits: readonly NatureVisit[]): string[] {
  const seen = new Set<string>();
  for (const v of visits) {
    if (v.deletedAt !== null) continue;
    for (const r of v.records)
      if (counted(r) && (r.count ?? 1) > 0) seen.add(r.taxonName ? norm(r.taxonName) : r.group);
  }
  return [...seen].sort();
}

const PROTOCOL_NAME: Record<NatureVisit['protocol'], string> = {
  'fit-count': 'Flower-Insect Timed Count, adapted from the UK Pollinator Monitoring Scheme (PoMS)',
  'bird-count': '5-minute point count',
  sighting: 'Incidental sighting',
  phenology: 'Phenology check',
};

const STATUS: Record<CheckState, string> = {
  YES: 'present',
  NO: 'absent',
  UNCERTAIN: 'present',
  NOT_CHECKED: '',
};

interface DwcRow {
  v: NatureVisit;
  r: VisitRecord;
  i: number;
}

/**
 * Darwin Core occurrence rows. Coordinates are coarsened to 0.01° with a 1 km uncertainty; absences
 * (`NO`) are exported as `absent`; `NOT_CHECKED` rows are left out. Cells are formula-safe.
 */
export function darwinCoreCsv(
  visits: readonly NatureVisit[],
  place: { lat: number; lon: number } | null,
  groupName: (group: string) => string,
): string {
  const rows: DwcRow[] = visits
    .filter((v) => v.deletedAt === null)
    .flatMap((v) => v.records.map((r, i) => ({ v, r, i })))
    .filter(({ r }) => r.state !== 'NOT_CHECKED');
  // Numbers, not text: a negative longitude must not be mistaken for a formula.
  const lat = place ? Math.round(place.lat * 100) / 100 : null;
  const lon = place ? Math.round(place.lon * 100) / 100 : null;
  const cols: CsvColumn<DwcRow>[] = [
    { header: 'occurrenceID', value: ({ v, i }) => `${v.id}-${i + 1}` },
    { header: 'eventID', value: ({ v }) => v.id },
    { header: 'basisOfRecord', value: () => 'HumanObservation' },
    { header: 'eventDate', value: ({ v }) => new Date(v.startedAt).toISOString() },
    { header: 'samplingProtocol', value: ({ v }) => PROTOCOL_NAME[v.protocol] },
    {
      header: 'samplingEffort',
      value: ({ v }) =>
        v.plannedS ? `${Math.round(v.durationS / 60)} minutes; ${v.observerCount} observer(s)` : '',
    },
    { header: 'sampleSizeValue', value: ({ v }) => (v.protocol === 'fit-count' ? 0.25 : null) },
    { header: 'sampleSizeUnit', value: ({ v }) => (v.protocol === 'fit-count' ? 'square metre' : '') },
    { header: 'vernacularName', value: ({ r }) => groupName(r.group) },
    { header: 'scientificName', value: ({ r }) => r.taxonName ?? '' },
    {
      header: 'identificationQualifier',
      value: ({ r }) => (r.state === 'UNCERTAIN' || r.identityConfidence === 'unsure' ? 'uncertain' : ''),
    },
    { header: 'individualCount', value: ({ r }) => (r.state === 'NO' ? 0 : r.count) },
    { header: 'occurrenceStatus', value: ({ r }) => STATUS[r.state] },
    { header: 'behavior', value: ({ r }) => r.behaviour ?? '' },
    { header: 'decimalLatitude', value: () => lat },
    { header: 'decimalLongitude', value: () => lon },
    { header: 'coordinateUncertaintyInMeters', value: () => (place ? 1000 : null) },
    {
      header: 'eventRemarks',
      value: ({ v }) =>
        [
          v.targetName ? `target: ${v.targetName}` : '',
          v.patchFlowerCount !== null ? `flowers in patch: ${v.patchFlowerCount}` : '',
          v.weather?.temperatureC != null ? `${v.weather.temperatureC} °C` : '',
          v.weather?.sky ?? '',
          v.weather?.wind ? `wind ${v.weather.wind}` : '',
        ]
          .filter(Boolean)
          .join('; '),
    },
  ];
  return toCsv(rows, cols);
}
