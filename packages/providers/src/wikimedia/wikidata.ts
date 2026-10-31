import { z } from 'zod';
import type { SpeciesNames } from '@plantpal/schemas';
import { ProviderError } from '../core/errors';
import { provenance } from '../core/provenance';

export const WIKIDATA_API = 'https://www.wikidata.org/w/api.php';

/** Finds the item with this GBIF taxon id (property P846). */
export function wikidataSearchUrl(gbifKey: number): string {
  const q = new URLSearchParams({
    action: 'query',
    format: 'json',
    origin: '*',
    list: 'search',
    srsearch: `haswbstatement:P846=${gbifKey}`,
    srlimit: '1',
  });
  return `${WIKIDATA_API}?${q.toString()}`;
}

export function wikidataLabelsUrl(qid: string): string {
  const q = new URLSearchParams({
    action: 'wbgetentities',
    format: 'json',
    origin: '*',
    ids: qid,
    props: 'labels|aliases',
    languages: 'en|hi|es',
  });
  return `${WIKIDATA_API}?${q.toString()}`;
}

const SearchRaw = z.object({ query: z.object({ search: z.array(z.object({ title: z.string() })) }) });

export function parseWikidataSearch(json: unknown): string | null {
  const r = SearchRaw.safeParse(json);
  if (!r.success) throw new ProviderError('BAD_RESPONSE', 'wikidata', 'Unexpected Wikidata search shape');
  const title = r.data.query.search[0]?.title ?? null;
  return title && /^Q\d+$/.test(title) ? title : null;
}

const Label = z.object({ value: z.string() });
const LabelsRaw = z.object({
  entities: z.record(
    z.string(),
    z.object({
      labels: z.record(z.string(), Label).optional(),
      aliases: z.record(z.string(), z.array(Label)).optional(),
    }),
  ),
});

export function parseWikidataLabels(
  json: unknown,
  ctx: { qid: string | null; scientificName: string; retrievedAt: string; demo?: boolean },
): SpeciesNames {
  const names = { en: [] as string[], hi: [] as string[], es: [] as string[] };
  if (json !== null) {
    const r = LabelsRaw.safeParse(json);
    if (!r.success) throw new ProviderError('BAD_RESPONSE', 'wikidata', 'Unexpected Wikidata entity shape');
    const e = ctx.qid ? r.data.entities[ctx.qid] : undefined;
    for (const lang of ['en', 'hi', 'es'] as const) {
      const all = [e?.labels?.[lang]?.value, ...(e?.aliases?.[lang] ?? []).map((a) => a.value)]
        .filter((v): v is string => Boolean(v))
        // A label that only repeats the scientific name is not a common name.
        .filter((v) => v.toLowerCase() !== ctx.scientificName.toLowerCase());
      names[lang] = [...new Set(all)].slice(0, 5);
    }
  }
  return {
    provenance: provenance('wikidata', {
      retrievedAt: ctx.retrievedAt,
      lat: null,
      lon: null,
      demo: ctx.demo,
    }),
    wikidataId: ctx.qid,
    names,
  };
}
