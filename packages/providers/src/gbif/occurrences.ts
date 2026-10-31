import { z } from 'zod';
import { ProviderError } from '../core/errors';

export const GBIF_OCCURRENCE_ENDPOINT = 'https://api.gbif.org/v1/occurrence/search';

/** GBIF backbone kingdom keys. */
export const KINGDOMS = { plants: 6, animals: 1, fungi: 5 } as const;
/** Licences safe to display and count: CC0 and CC BY (CC BY-NC is excluded by default). */
export const OPEN_LICENCES = ['CC0_1_0', 'CC_BY_4_0'] as const;
const FACET_LIMIT = 200;

export interface NearbySummary {
  /** Occurrence **records** within the radius — not individuals and not species. */
  records: number;
  /** Distinct species among those records (a lower bound when `taxaCapped`). */
  taxa: number;
  taxaCapped: boolean;
  topTaxa: Array<{ speciesKey: number; records: number }>;
  radiusKm: number;
  kingdom: keyof typeof KINGDOMS;
  licences: readonly string[];
  /** GBIF occurrences say nothing about native or invasive status; that comes from WCVP/GRIIS. */
  nativeStatus: 'not-from-occurrences';
}

/**
 * Occurrence search within a true radius (`geoDistance`), not a lat/lon rectangle (L10), with records,
 * distinct taxa and licences kept apart.
 */
export function nearbyUrl(
  lat: number,
  lon: number,
  radiusKm: number,
  kingdom: keyof typeof KINGDOMS,
): string {
  const q = new URLSearchParams({
    geoDistance: `${lat},${lon},${radiusKm}km`,
    kingdomKey: String(KINGDOMS[kingdom]),
    hasCoordinate: 'true',
    hasGeospatialIssue: 'false',
    occurrenceStatus: 'PRESENT',
    limit: '0',
    facet: 'speciesKey',
    facetLimit: String(FACET_LIMIT),
  });
  for (const l of OPEN_LICENCES) q.append('license', l);
  return `${GBIF_OCCURRENCE_ENDPOINT}?${q.toString()}`;
}

const Raw = z.object({
  count: z.number().int().nonnegative(),
  facets: z
    .array(
      z.object({ field: z.string(), counts: z.array(z.object({ name: z.string(), count: z.number() })) }),
    )
    .optional(),
});

export function parseNearby(
  json: unknown,
  ctx: { radiusKm: number; kingdom: keyof typeof KINGDOMS },
): NearbySummary {
  const r = Raw.safeParse(json);
  if (!r.success) throw new ProviderError('BAD_RESPONSE', 'gbif', 'Unexpected GBIF shape');
  const facet = r.data.facets?.find((f) => f.field === 'SPECIES_KEY');
  const counts = (facet?.counts ?? []).flatMap((c) => {
    const key = Number(c.name);
    return Number.isInteger(key) ? [{ speciesKey: key, records: c.count }] : [];
  });
  return {
    records: r.data.count,
    taxa: counts.length,
    taxaCapped: counts.length >= FACET_LIMIT,
    topTaxa: counts.slice(0, 20),
    radiusKm: ctx.radiusKm,
    kingdom: ctx.kingdom,
    licences: OPEN_LICENCES,
    nativeStatus: 'not-from-occurrences',
  };
}
