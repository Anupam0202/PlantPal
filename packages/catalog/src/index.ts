import type { Taxon } from '@plantpal/schemas';
import { SEED_PACK } from './seed';

export { SEED_PACK } from './seed';
export { SOURCES, SOURCE_LIST } from './sources';
export { REQUIRED_TRAITS, assertValidCatalog, traitOf, validateCatalog } from './validate';
export type { CatalogIssue } from './validate';

const byId = new Map(SEED_PACK.taxa.map((t) => [t.id, t]));

export function taxonById(id: string): Taxon | undefined {
  return byId.get(id);
}

export function sourceById(id: string) {
  return SEED_PACK.sources.find((s) => s.id === id);
}
