import type { CatalogPack, Taxon, TraitKey, TraitValue } from '@plantpal/schemas';
import { CatalogPack as CatalogPackSchema, TRAITS } from '@plantpal/schemas';

export interface CatalogIssue {
  taxonId: string | null;
  path: string;
  message: string;
}

/** Traits every taxon must state (§17.4). Indoor light and days to maturity are optional. */
export const REQUIRED_TRAITS: readonly TraitKey[] = [
  'lifeform',
  'useGroup',
  'sunHours',
  'minTempC',
  'heatTolerance',
  'heightCm',
  'spreadCm',
  'minContainerL',
  'waterNeed',
  'effort',
  'sowSeason',
  'pollinatorValue',
  'foodValue',
  'ornamentalValue',
];

/**
 * Checks a catalogue pack: schema, one value per trait with the right shape and unit, a known
 * source on every assertion, no duplicate ids or names, and toxicity only from non-AI sources (S10).
 * Returns every problem rather than stopping at the first.
 */
export function validateCatalog(input: unknown): CatalogIssue[] {
  const issues: CatalogIssue[] = [];
  const parsed = CatalogPackSchema.safeParse(input);
  if (!parsed.success) {
    for (const i of parsed.error.issues)
      issues.push({ taxonId: null, path: i.path.join('.'), message: i.message });
    return issues;
  }
  const pack = parsed.data;
  const sources = new Set(pack.sources.map((s) => s.id));
  if (sources.size !== pack.sources.length)
    issues.push({ taxonId: null, path: 'sources', message: 'duplicate source id' });
  const ids = new Set<string>();
  const names = new Set<string>();

  for (const t of pack.taxa) {
    const add = (path: string, message: string) => issues.push({ taxonId: t.id, path, message });
    if (ids.has(t.id)) add('id', 'duplicate taxon id');
    ids.add(t.id);
    const key = t.scientificName.toLowerCase();
    if (names.has(key)) add('scientificName', 'duplicate scientific name');
    names.add(key);

    const seen = new Set<TraitKey>();
    t.traits.forEach((a, i) => {
      const def = TRAITS[a.trait];
      if (seen.has(a.trait)) add(`traits.${i}`, `trait ${a.trait} stated twice`);
      seen.add(a.trait);
      if (a.unit !== def.unit) add(`traits.${i}.unit`, `${a.trait} needs unit ${String(def.unit)}`);
      const v = def.value.safeParse(a.value);
      if (!v.success) add(`traits.${i}.value`, `${a.trait}: ${v.error.issues[0]?.message ?? 'invalid'}`);
      if (!sources.has(a.sourceId)) add(`traits.${i}.sourceId`, `unknown source ${a.sourceId}`);
      if (a.evidence === 'UNKNOWN') add(`traits.${i}.evidence`, 'evidence grade is required');
    });
    for (const k of REQUIRED_TRAITS) if (!seen.has(k)) add('traits', `missing trait ${k}`);

    t.regions.forEach((r, i) => {
      if (!sources.has(r.sourceId)) add(`regions.${i}.sourceId`, `unknown source ${r.sourceId}`);
      if (r.status === 'INVASIVE_LISTED' && r.evidence === 'AI_DRAFT')
        add(`regions.${i}`, 'invasive listings need a cited list, not a draft');
    });
    const regionKeys = new Set<string>();
    t.regions.forEach((r, i) => {
      const k = `${r.region}|${r.sourceId}`;
      if (regionKeys.has(k)) add(`regions.${i}`, 'duplicate region for the same source');
      regionKeys.add(k);
    });

    t.toxicity.forEach((x, i) => {
      if (!sources.has(x.sourceId)) add(`toxicity.${i}.sourceId`, `unknown source ${x.sourceId}`);
      // S10: toxicity and edibility never come from AI.
      if (x.evidence === 'AI_DRAFT' || x.evidence === 'UNKNOWN' || x.evidence === 'COMMUNITY')
        add(`toxicity.${i}.evidence`, 'toxicity needs a cited expert or official source');
    });

    const sun = traitOf(t, 'sunHours');
    if (sun && (sun.min < 0 || sun.max > 24)) add('traits.sunHours', 'sun hours must be within 0–24');
  }
  return issues;
}

/** The asserted value of one trait, or `null` when the catalogue does not state it (unknown ≠ zero). */
export function traitOf<K extends TraitKey>(taxon: Taxon, key: K): TraitValue<K> | null {
  const a = taxon.traits.find((x) => x.trait === key);
  return a ? (a.value as TraitValue<K>) : null;
}

export function assertValidCatalog(pack: CatalogPack): CatalogPack {
  const issues = validateCatalog(pack);
  if (issues.length > 0) {
    const head = issues
      .slice(0, 10)
      .map((i) => `${i.taxonId ?? '(pack)'} ${i.path}: ${i.message}`)
      .join('\n');
    throw new Error(`Catalogue ${pack.id} has ${issues.length} problem(s):\n${head}`);
  }
  return pack;
}
