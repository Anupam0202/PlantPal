import { z } from 'zod';
import type { SpeciesMatch } from '@plantpal/schemas';
import { ProviderError } from '../core/errors';
import { num, provenance } from '../core/provenance';

export const GBIF_MATCH_ENDPOINT = 'https://api.gbif.org/v1/species/match';

/** Plant-kingdom name match against the GBIF backbone. */
export function speciesMatchUrl(name: string): string {
  const q = new URLSearchParams({ name: name.trim(), kingdom: 'Plantae', strict: 'false' });
  return `${GBIF_MATCH_ENDPOINT}?${q.toString()}`;
}

const Raw = z.object({
  usageKey: z.number().optional(),
  acceptedUsageKey: z.number().optional(),
  scientificName: z.string().optional(),
  canonicalName: z.string().optional(),
  rank: z.string().optional(),
  status: z.string().optional(),
  matchType: z.string(),
  confidence: z.number().optional(),
  family: z.string().optional(),
  kingdom: z.string().optional(),
});

const SPECIES_RANKS = ['SPECIES', 'SUBSPECIES', 'VARIETY', 'FORM'];

export function parseSpeciesMatch(
  json: unknown,
  ctx: { query: string; retrievedAt: string; demo?: boolean },
): SpeciesMatch {
  const r = Raw.safeParse(json);
  if (!r.success) throw new ProviderError('BAD_RESPONSE', 'gbif', 'Unexpected GBIF match shape');
  const d = r.data;
  const confidence = num(d.confidence);
  const resolved =
    (d.matchType === 'EXACT' || d.matchType === 'FUZZY') &&
    SPECIES_RANKS.includes(d.rank ?? '') &&
    (d.kingdom === undefined || d.kingdom === 'Plantae') &&
    (confidence ?? 0) >= 80;
  return {
    provenance: provenance('gbif', {
      retrievedAt: ctx.retrievedAt,
      lat: null,
      lon: null,
      model: 'GBIF Backbone Taxonomy',
      demo: ctx.demo,
    }),
    query: ctx.query,
    resolved,
    usageKey: d.usageKey ?? null,
    acceptedKey: d.status === 'SYNONYM' ? (d.acceptedUsageKey ?? null) : (d.usageKey ?? null),
    scientificName: d.scientificName ?? null,
    canonicalName: d.canonicalName ?? null,
    rank: d.rank ?? null,
    status: d.status ?? null,
    matchType: d.matchType,
    confidence,
    family: d.family ?? null,
  };
}
