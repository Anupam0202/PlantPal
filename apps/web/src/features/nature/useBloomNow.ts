import { rotateMonth, trait } from '@plantpal/domain';
import type { Garden, Specimen } from '@plantpal/schemas';
import { taxonById } from '../plan/engine';
import { monthIn } from '../plan/usePlanContext';
import { hemisphereOf } from './bloomData';

/** Active plants, those usually flowering this month (reference timing) first. */
export function plantsByBloomNow(garden: Garden, specimens: readonly Specimen[]) {
  const month = monthIn(garden.timezone) + 1;
  return specimens
    .filter((s) => s.deletedAt === null && (s.status === 'active' || s.status === 'dormant'))
    .map((s) => {
      const t = s.catalogTaxonId ? (taxonById(s.catalogTaxonId) ?? null) : null;
      const bloom = t ? trait(t, 'bloomMonths') : null;
      const now = bloom
        ? bloom.map((m) => rotateMonth(m, hemisphereOf(garden))).includes(month as never)
        : false;
      return { specimen: s, taxon: t, bloomingNow: now };
    })
    .sort(
      (a, b) =>
        Number(b.bloomingNow) - Number(a.bloomingNow) ||
        a.specimen.displayName.localeCompare(b.specimen.displayName),
    );
}
