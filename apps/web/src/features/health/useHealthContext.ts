import type { HealthContext } from '@plantpal/domain';
import type { Garden, Specimen } from '@plantpal/schemas';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../data/db';
import { useContainers, useZones } from '../../data/queries';
import { gardenCoords, useForecast } from '../../env/hooks';
import { monthIn } from '../plan/usePlanContext';

const GROUND = ['yard', 'community-plot', 'bed'];

/**
 * The plant's situation for triage (§6.8 step 3): sun, container, the next 3 days of weather and
 * recent care. Rules use the numbers; the AI receives the same facts as short lines.
 */
export function useHealthContext(garden: Garden | null | undefined, specimen: Specimen | null | undefined) {
  const zones = useZones(garden?.id);
  const containers = useContainers(garden?.id);
  const forecast = useForecast(gardenCoords(garden)).data;
  const care = useLiveQuery(async () => {
    if (!specimen) return [];
    // Read inside the query (not during render) so the window moves with each refresh.
    const since = Date.now() - 14 * 86_400_000;
    return (await db.careEvents.where('specimenId').equals(specimen.id).toArray()).filter(
      (e) => e.deletedAt === null && e.occurredAt >= since,
    );
  }, [specimen?.id]);
  const zone = zones?.find((z) => z.id === specimen?.zoneId) ?? null;
  const container = containers?.find((c) => c.id === specimen?.containerId) ?? null;
  const month = monthIn(garden?.timezone ?? 'UTC');
  const sunHours = zone?.sun ? (zone.sun.monthlyHours[month] ?? null) : null;
  const nums = (a: Array<number | null> | undefined) =>
    (a ?? []).slice(0, 3).filter((v): v is number => v !== null);
  const highs = nums(forecast?.daily.temperatureMaxC);
  const lows = nums(forecast?.daily.temperatureMinC);
  const maxTempC = highs.length ? Math.max(...highs) : null;
  const minTempC = lows.length ? Math.min(...lows) : null;
  const waterings = care ? care.filter((e) => e.kind === 'water').length : null;
  const feeds = care ? care.filter((e) => e.kind === 'feed').length : null;

  const ctx: HealthContext = {
    sunHours,
    container: container !== null || (zone !== null && !GROUND.includes(zone.kind)),
    maxTempC,
    minTempC,
    wateringsLast14: waterings,
    covered: zone?.covered ?? null,
  };
  const lines = {
    weather:
      maxTempC !== null && minTempC !== null
        ? `Next 3 days: up to ${Math.round(maxTempC)} °C, down to ${Math.round(minTempC)} °C.`
        : null,
    careLog:
      waterings === null
        ? null
        : `Watered ${waterings} times and fed ${feeds ?? 0} times in the last 14 days.`,
    space: zone
      ? [
          `${zone.name} (${zone.kind})`,
          sunHours !== null
            ? `about ${Math.round(sunHours * 10) / 10} h direct sun this month`
            : 'sun not measured',
          zone.covered ? 'covered above' : null,
          container ? `container ${container.volumeL ?? '?'} L` : null,
        ]
          .filter(Boolean)
          .join(', ')
      : null,
  };
  return { ctx, lines };
}
