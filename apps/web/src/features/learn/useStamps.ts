import { fieldStamps, nativeStatusOf, todayIn, type Stamp } from '@plantpal/domain';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, getMeta } from '../../data/db';
import { gardenBloomWheel } from '../nature/bloomData';
import { taxonById } from '../plan/engine';

export const LESSONS_KEY = 'lessonsDone';

const alive = <T extends { deletedAt: number | null }>(r: T) => r.deletedAt === null;

/** Field stamps for this device's records, recalculated on every change (Appendix D). */
export function useStamps(): Stamp[] | undefined {
  return useLiveQuery(async () => {
    const [gardens, zones, specimens, care, logs, visits, harvests, lots, activeId, lessons] =
      await Promise.all([
        db.gardens.toArray(),
        db.zones.toArray(),
        db.specimens.toArray(),
        db.careEvents.toArray(),
        db.taskLogs.toArray(),
        db.natureVisits.toArray(),
        db.harvests.toArray(),
        db.seedLots.toArray(),
        getMeta<string | null>('activeGardenId'),
        getMeta<string[]>(LESSONS_KEY),
      ]);
    const liveGardens = gardens.filter(alive);
    const garden = liveGardens.find((g) => g.id === activeId) ?? liveGardens[0] ?? null;
    const plants = specimens.filter(alive);
    const tz = garden?.timezone ?? 'UTC';
    const inGarden = garden ? plants.filter((s) => s.gardenId === garden.id) : [];
    const wheel = garden ? gardenBloomWheel(garden, inGarden, visits.filter(alive)) : null;
    const native = garden
      ? inGarden.filter((s) => {
          if (s.status !== 'active' || !s.catalogTaxonId) return false;
          const t = taxonById(s.catalogTaxonId);
          return t
            ? nativeStatusOf(t, {
                countryCode: garden.region?.countryCode ?? null,
                l3: garden.region?.l3 ?? null,
              }) === 'NATIVE'
            : false;
        }).length
      : 0;
    const liveVisits = visits.filter(alive);
    return fieldStamps({
      today: todayIn(tz),
      plantedOn: plants.map((s) => s.plantedOn),
      sunMethods: zones.filter(alive).map((z) => z.sun?.method ?? null),
      careDays: [
        ...care.filter(alive).map((c) => c.occurredOn),
        ...logs
          .filter((l) => l.deletedAt === null && (l.action === 'done' || l.action === 'checked'))
          .map((l) => l.occurredOn),
      ],
      rainLitresByDay: care
        .filter((c) => alive(c) && c.kind === 'water' && c.waterSource === 'rain' && c.amountMl !== null)
        .map((c) => ({ on: c.occurredOn, litres: (c.amountMl ?? 0) / 1000 })),
      bloomMonths: wheel ? Object.values(wheel.months).filter((m) => m.state === 'FORAGE').length : null,
      nativeActive: native,
      timedCounts: liveVisits
        .filter((v) => v.protocol === 'fit-count')
        .map((v) => ({ durationSec: v.durationS, plannedSec: v.plannedS })),
      phenologyDays: liveVisits.filter((v) => v.protocol === 'phenology').map((v) => v.occurredOn),
      harvests: harvests.filter(alive).map((h) => ({ massG: h.massG })),
      seedLots: lots
        .filter(alive)
        .map((l) => ({ fromOwnPlant: l.specimenId !== null, tests: l.germinationTests.length })),
      lessonsDone: (lessons ?? []).length,
    });
  }, []);
}
