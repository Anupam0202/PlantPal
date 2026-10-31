import { z } from 'zod';
import type { NearbyGroup, NearbySpecies, Provenance } from '@plantpal/schemas';
import { ProviderError } from '../core/errors';

export const INAT_SPECIES_COUNTS = 'https://api.inaturalist.org/v1/observations/species_counts';

/** iNaturalist iconic taxa per group. Insects include pollinators and everything else. */
export const ICONIC: Record<NearbyGroup, string> = { insects: 'Insecta', birds: 'Aves', plants: 'Plantae' };

/**
 * Species with research-grade, verifiable observations within a true radius of a coarsened point.
 * Only the rounded point and the radius leave the device.
 */
export function speciesCountsUrl(lat: number, lon: number, radiusKm: number, group: NearbyGroup): string {
  const q = new URLSearchParams({
    lat: String(lat),
    lng: String(lon),
    radius: String(radiusKm),
    iconic_taxa: ICONIC[group],
    quality_grade: 'research',
    verifiable: 'true',
    per_page: '30',
  });
  return `${INAT_SPECIES_COUNTS}?${q.toString()}`;
}

const Raw = z.object({
  total_results: z.number().int().nonnegative(),
  results: z.array(
    z.object({
      count: z.number().int().nonnegative(),
      taxon: z.object({
        id: z.number().int(),
        name: z.string(),
        rank: z.string().optional(),
        preferred_common_name: z.string().nullable().optional(),
      }),
    }),
  ),
});

export function parseSpeciesCounts(
  json: unknown,
  ctx: { group: NearbyGroup; radiusKm: number; provenance: Provenance },
): NearbySpecies {
  const r = Raw.safeParse(json);
  if (!r.success) throw new ProviderError('BAD_RESPONSE', 'inaturalist', 'Unexpected iNaturalist shape');
  return {
    provenance: ctx.provenance,
    group: ctx.group,
    radiusKm: ctx.radiusKm,
    totalTaxa: r.data.total_results,
    species: r.data.results
      .filter((x) => !x.taxon.rank || ['species', 'subspecies', 'variety', 'hybrid'].includes(x.taxon.rank))
      .map((x) => ({
        taxonId: x.taxon.id,
        name: x.taxon.name,
        commonName: x.taxon.preferred_common_name?.trim() || null,
        observations: x.count,
      })),
  };
}
