import { bloomWheel, trait, type BloomInput, type BloomWheel, type Month } from '@plantpal/domain';
import type { Garden, NatureVisit, Specimen } from '@plantpal/schemas';
import { taxonById } from '../plan/engine';

/** The person's flowering checks, latest per plant and month (phenology "flower" YES or NO). */
export function observedFlowering(
  visits: readonly NatureVisit[],
  specimenId: string,
  now = Date.now(),
): BloomInput['observed'] {
  const out: BloomInput['observed'] = {};
  const yearAgo = now - 365 * 86_400_000;
  for (const v of [...visits].sort((a, b) => a.startedAt - b.startedAt)) {
    if (v.protocol !== 'phenology' || v.specimenId !== specimenId || v.startedAt < yearAgo) continue;
    const r = v.records.find((x) => x.group === 'flower');
    if (r && (r.state === 'YES' || r.state === 'NO'))
      out[Number(v.occurredOn.slice(5, 7)) as Month] = r.state;
  }
  return out;
}

/** The garden's hemisphere, or the one its latitude implies when it was never set. */
export function hemisphereOf(g: Pick<Garden, 'hemisphere' | 'place'>): 'north' | 'south' {
  return g.hemisphere ?? ((g.place?.lat ?? 1) < 0 ? 'south' : 'north');
}

/** Bloom wheel for a garden's living plants, catalogue timing overridden by the person's checks. */
export function gardenBloomWheel(
  garden: Pick<Garden, 'hemisphere' | 'place'>,
  specimens: readonly Specimen[],
  visits: readonly NatureVisit[],
): BloomWheel {
  const active = specimens.filter(
    (s) => s.deletedAt === null && (s.status === 'active' || s.status === 'dormant'),
  );
  return bloomWheel(
    active.map((s) => {
      const t = s.catalogTaxonId ? (taxonById(s.catalogTaxonId) ?? null) : null;
      return {
        id: s.id,
        name: s.displayName,
        bloomMonths: t ? trait(t, 'bloomMonths') : null,
        pollinatorValue: t ? trait(t, 'pollinatorValue') : null,
        observed: observedFlowering(visits, s.id),
      };
    }),
    hemisphereOf(garden),
  );
}
