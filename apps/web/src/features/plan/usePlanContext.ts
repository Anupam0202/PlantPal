import type { EligibilityContext } from '@plantpal/domain';
import type { Garden, GardenProfile, Zone } from '@plantpal/schemas';
import { useMemo } from 'react';
import { useClimateProfile } from '../../env/hooks';
import { climateFactsOf, contextOf } from './engine';

export type ClimateState = 'none' | 'loading' | 'measured' | 'failed';

/** Month (0–11) of today in the garden's time zone. */
export function monthIn(timeZone: string, now = Date.now()): number {
  try {
    return Number(new Intl.DateTimeFormat('en-GB', { month: 'numeric', timeZone }).format(now)) - 1;
  } catch {
    return new Date(now).getUTCMonth();
  }
}

/**
 * Eligibility inputs for one zone of a garden. Climate comes from the local profile when it loads,
 * otherwise from the manual answers; the state says which, so the UI can be honest about it.
 */
export function usePlanContext(
  garden: Pick<Garden, 'place' | 'region' | 'timezone'> & { profile: GardenProfile | null },
  zone: Pick<
    Zone,
    'kind' | 'covered' | 'areaM2' | 'sun' | 'indoorLight' | 'clearanceCm' | 'maxContainerL'
  > | null,
): { ctx: EligibilityContext | null; climate: ClimateState } {
  const lat = garden.place?.lat ?? null;
  const lon = garden.place?.lon ?? null;
  const coords = lat !== null && lon !== null ? { lat, lon } : null;
  const profileQuery = useClimateProfile(coords);
  const measured = profileQuery.data && profileQuery.data.extremeMinC !== null ? profileQuery.data : null;
  const climate: ClimateState = !coords
    ? 'none'
    : measured
      ? 'measured'
      : profileQuery.isError || (profileQuery.data && !measured)
        ? 'failed'
        : 'loading';
  const ctx = useMemo(
    () =>
      zone
        ? contextOf({
            lat,
            region: garden.region,
            profile: garden.profile,
            zone,
            climate: climateFactsOf(measured, garden.profile?.manualClimate),
            month: monthIn(garden.timezone),
          })
        : null,
    [zone, lat, garden.region, garden.profile, garden.timezone, measured],
  );
  return { ctx, climate };
}
