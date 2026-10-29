import type { IdentityLevel, RegionStatus, RegionStatusValue, Taxon } from '@plantpal/schemas';
import { nativeStatusOf, regionStatuses, type EligibilityContext } from './eligibility';

export interface LensEntry {
  id: string;
  name: string;
  taxonId: string | null;
  status: RegionStatusValue;
  /** Every statement that applies to the garden's region, finest first: the conflict matrix. */
  matrix: RegionStatus[];
  /** Cultivars of natives may offer different wildlife value. */
  cultivarNote: boolean;
  /** Why the status is unknown, when it is. */
  unknownReason: 'not-linked' | 'no-region' | 'no-statement' | null;
}

/**
 * Native & Invasive Lens (§6.3): one status per plant for the garden's region, with the sources that
 * produced it. `UNKNOWN` means unknown; it is never shown as "not invasive" (S9).
 */
export function lensReport(
  plants: ReadonlyArray<{ id: string; name: string; taxon: Taxon | null; identityLevel: IdentityLevel }>,
  region: EligibilityContext['region'],
): { entries: LensEntry[]; counts: Record<RegionStatusValue, number> } {
  const entries = plants.map((p): LensEntry => {
    if (!p.taxon)
      return {
        id: p.id,
        name: p.name,
        taxonId: null,
        status: 'UNKNOWN',
        matrix: [],
        cultivarNote: false,
        unknownReason: 'not-linked',
      };
    if (!region.countryCode && !region.l3)
      return {
        id: p.id,
        name: p.name,
        taxonId: p.taxon.id,
        status: 'UNKNOWN',
        matrix: [],
        cultivarNote: false,
        unknownReason: 'no-region',
      };
    const matrix = regionStatuses(p.taxon, region);
    const status = nativeStatusOf(p.taxon, region);
    return {
      id: p.id,
      name: p.name,
      taxonId: p.taxon.id,
      status,
      matrix,
      cultivarNote: status === 'NATIVE' && p.identityLevel === 'cultivar',
      unknownReason: status === 'UNKNOWN' ? 'no-statement' : null,
    };
  });
  const counts = { NATIVE: 0, INTRODUCED: 0, INVASIVE_LISTED: 0, CONFLICT: 0, UNKNOWN: 0 };
  for (const e of entries) counts[e.status]++;
  return { entries, counts };
}
