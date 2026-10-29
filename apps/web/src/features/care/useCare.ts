import { taxonById } from '@plantpal/catalog';
import {
  CHECK_FRACTION,
  KC_CLASS,
  SUBSTRATE_AVAILABLE_FRACTION,
  canopyM2,
  careQueue,
  exposureFactor,
  gardenAlerts,
  potSurfaceM2,
  todayIn,
  trait,
  waterChecks,
  type CareQueue,
  type GardenAlert,
  type Occurrence,
  type PlantExposure,
  type WaterCheck,
  type WaterDay,
  type WaterSubject,
} from '@plantpal/domain';
import type { CareEvent, Container, Forecast, Garden, Specimen, TaskLog, Zone } from '@plantpal/schemas';
import { useMemo } from 'react';
import {
  useRecentCare,
  useSchedules,
  useSpecimens,
  useTaskLogs,
  useContainers,
  useZones,
} from '../../data/queries';
import { gardenCoords, useClimateProfile, useForecast, useNow } from '../../env/hooks';

const DAY = 86_400_000;
const INDOOR_KINDS = ['indoor', 'windowsill'];

export type CareTask =
  | { type: 'schedule'; key: string; occ: Occurrence; specimen: Specimen | null; dueAt: number }
  | { type: 'water'; key: string; check: WaterCheck; specimen: Specimen; dueAt: number };

export interface CareState {
  today: string;
  now: number;
  queue: CareQueue;
  dueNow: CareTask[];
  thisWeek: CareTask[];
  alerts: GardenAlert[];
  forecastStale: boolean;
  logs: TaskLog[];
}

const mean = (xs: readonly number[]) => (xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0) / xs.length);

/** The pot's water model from its container, zone and catalogue traits (estimates labelled in the UI). */
export function waterSubjectOf(
  s: Specimen,
  zone: Zone | undefined,
  container: Container | undefined,
  lastKnown: WaterSubject['lastKnown'],
): WaterSubject {
  const taxon = s.catalogTaxonId ? taxonById(s.catalogTaxonId) : undefined;
  const useGroup = taxon ? trait(taxon, 'useGroup') : null;
  const spread = taxon ? trait(taxon, 'spreadCm') : null;
  const minPot = taxon ? trait(taxon, 'minContainerL') : null;
  const pot = container ? potSurfaceM2(container.dimsCm) : null;
  const volumeL = container?.volumeL ?? minPot ?? 10;
  const indoor = zone ? INDOOR_KINDS.includes(zone.kind) && !zone.sun : false;
  const sunMean = zone?.sun ? mean(zone.sun.monthlyHours) : null;
  return {
    specimenId: s.id,
    zoneId: s.zoneId,
    lastKnown,
    container: {
      volumeL,
      availableFraction: container?.substrateType
        ? SUBSTRATE_AVAILABLE_FRACTION[container.substrateType]
        : 0.28,
      kc: useGroup ? KC_CLASS[useGroup] : 0.9,
      exposure: exposureFactor(sunMean, zone?.wind ?? null),
      canopyM2: canopyM2(
        spread ? (spread.min + spread.max) / 2 : null,
        pot ?? Math.pow(volumeL / 1000, 2 / 3),
      ),
      catchM2: pot ?? Math.pow(volumeL / 1000, 2 / 3),
      covered: indoor || zone?.covered === true,
      indoor,
      personalFactor: container?.waterFactor ?? 1,
    },
  };
}

/** Last moment the pot's moisture was known: a watering (full) or a soil check. */
export function lastKnownOf(
  specimenId: string,
  events: readonly CareEvent[],
  logs: readonly TaskLog[],
): WaterSubject['lastKnown'] {
  let best: { at: number; date: string; fraction: number } | null = null;
  for (const e of events) {
    if (e.specimenId !== specimenId || e.kind !== 'water' || e.deletedAt !== null) continue;
    if (!best || e.occurredAt > best.at) best = { at: e.occurredAt, date: e.occurredOn, fraction: 1 };
  }
  for (const l of logs) {
    if (l.specimenId !== specimenId || l.deletedAt !== null || l.action !== 'checked' || !l.check?.soil)
      continue;
    // A check followed by watering is superseded by the watering itself.
    if (!best || l.at > best.at)
      best = { at: l.at, date: l.occurredOn, fraction: CHECK_FRACTION[l.check.soil] };
  }
  return best ? { date: best.date, fraction: best.fraction } : null;
}

export function forecastDays(f: Forecast | undefined): WaterDay[] {
  if (!f) return [];
  return f.daily.date.map((date, i) => ({
    date,
    et0Mm: f.daily.et0SumMm[i] ?? null,
    rainMm: f.daily.precipitationSumMm[i] ?? null,
  }));
}

export function useCare(garden: Garden): CareState | null {
  const now = useNow(60_000);
  const since = useMemo(() => Math.floor(now / DAY) * DAY - 30 * DAY, [now]);
  const schedules = useSchedules(garden.id);
  const logs = useTaskLogs(garden.id, since);
  const events = useRecentCare(garden.id, since);
  const specimens = useSpecimens(garden.id);
  const zones = useZones(garden.id);
  const containers = useContainers(garden.id);
  const coords = gardenCoords(garden);
  const forecast = useForecast(coords);
  const climate = useClimateProfile(coords);

  return useMemo(() => {
    if (!schedules || !logs || !events || !specimens || !zones || !containers) return null;
    const today = todayIn(garden.timezone, now);
    const live = logs.map((l) => ({ ...l, voidedAt: l.deletedAt }));
    const lastActivityAt = Math.max(
      0,
      ...logs.filter((l) => l.deletedAt === null).map((l) => l.at),
      ...events.map((e) => e.occurredAt),
    );
    const queue = careQueue({
      schedules: schedules.map((s) => ({ ...s, rule: s.rule })),
      logs: live,
      today,
      timeZone: garden.timezone,
      now,
      lastActivityAt: lastActivityAt > 0 ? lastActivityAt : null,
    });
    const active = specimens.filter((s) => s.status === 'active' && !s.holding);
    const byId = new Map(specimens.map((s) => [s.id, s]));
    const subjects = active.map((s) =>
      waterSubjectOf(
        s,
        zones.find((z) => z.id === s.zoneId),
        containers.find((c) => c.id === s.containerId),
        lastKnownOf(s.id, events, logs),
      ),
    );
    const resolved = new Map<string, TaskLog>();
    for (const l of logs) if (l.deletedAt === null) resolved.set(l.occurrenceKey, l);
    const checks = waterChecks(subjects, forecastDays(forecast.data), today).filter((c) => {
      const l = resolved.get(c.key);
      if (!l) return true;
      if (l.action === 'snoozed') return (l.snoozeUntil ?? 0) <= now;
      return false;
    });
    const weekEnd = todayIn(garden.timezone, now + 7 * DAY);
    const waterTasks: CareTask[] = checks.flatMap((check) => {
      const specimen = byId.get(check.specimenId);
      return specimen
        ? [
            {
              type: 'water' as const,
              key: check.key,
              check,
              specimen,
              dueAt: Date.parse(`${check.checkBy}T12:00:00Z`),
            },
          ]
        : [];
    });
    const asTask = (occ: Occurrence): CareTask => ({
      type: 'schedule',
      key: occ.key,
      occ,
      specimen: occ.specimenId ? (byId.get(occ.specimenId) ?? null) : null,
      dueAt: occ.dueAt,
    });
    const dueNow = [
      ...queue.overdue.map(asTask),
      ...waterTasks.filter((w) => w.type === 'water' && w.check.checkBy <= today),
      ...queue.dueToday.map(asTask),
    ];
    const thisWeek = [
      ...waterTasks.filter(
        (w) => w.type === 'water' && w.check.checkBy > today && w.check.checkBy <= weekEnd,
      ),
      ...queue.thisWeek.map(asTask),
    ].sort((a, b) => a.dueAt - b.dueAt);

    const plants: PlantExposure[] = active.map((s) => {
      const taxon = s.catalogTaxonId ? taxonById(s.catalogTaxonId) : undefined;
      const zone = zones.find((z) => z.id === s.zoneId);
      return {
        specimenId: s.id,
        name: s.displayName,
        minTempC: taxon ? trait(taxon, 'minTempC') : null,
        heatTolerance: taxon ? trait(taxon, 'heatTolerance') : null,
        indoor: zone ? INDOOR_KINDS.includes(zone.kind) && !zone.sun : false,
        containers: zone ? !['yard', 'community-plot', 'bed'].includes(zone.kind) : true,
        sunHours: zone?.sun ? mean(zone.sun.monthlyHours) : null,
      };
    });
    const f = forecast.data;
    const forecastStale = f?.provenance.stale ?? false;
    const alerts = f
      ? gardenAlerts({
          forecast: f.daily.date.map((date, i) => ({
            date,
            tmaxC: f.daily.temperatureMaxC[i] ?? null,
            tminC: f.daily.temperatureMinC[i] ?? null,
          })),
          stale: forecastStale,
          today,
          tmaxP90ByMonth: climate.data?.tmaxP90ByMonth ?? null,
          plants,
        })
      : [];
    return { today, now, queue, dueNow, thisWeek, alerts, forecastStale, logs };
  }, [
    schedules,
    logs,
    events,
    specimens,
    zones,
    containers,
    forecast.data,
    climate.data,
    garden.timezone,
    now,
  ]);
}
