import type { Source } from '@plantpal/schemas';

/** Sources cited by the seed pack. Every assertion points at one of these by id. */
export const SOURCES = {
  draft: {
    id: 'plantpal-draft',
    title: 'PlantPal draft trait values (curator review pending)',
    publisher: 'PlantPal',
    url: null,
    licence: 'CC0-1.0',
    retrievedOn: '2026-10-28',
    note:
      'Typical container-growing values drafted with AI assistance from general horticultural knowledge. ' +
      'Not yet checked against extension or botanical sources: every assertion is AI_DRAFT and needs_review.',
  },
  aspca: {
    id: 'aspca-apcc',
    title: 'Toxic and Non-Toxic Plants',
    publisher: 'ASPCA Animal Poison Control Center',
    url: 'https://www.aspca.org/pet-care/aspca-poison-control/toxic-and-non-toxic-plants',
    licence: 'Facts cited, not copied; see source terms',
    retrievedOn: '2026-10-28',
    note:
      'Statements transcribed from the ASPCA plant pages via search results (the site was not reachable directly). ' +
      'Covers dogs, cats and horses, not people. Each statement needs curator review against the live page.',
  },
  griisIndia: {
    id: 'griis-in',
    title: 'Global Register of Introduced and Invasive Species – India',
    publisher: 'IUCN SSC Invasive Species Specialist Group, via GBIF',
    url: 'https://doi.org/10.15468/uvnf8m',
    licence: 'See dataset terms on GBIF',
    retrievedOn: '2026-10-28',
    note: 'National checklist of introduced and invasive species. Record-level status needs curator verification.',
  },
  ausWons: {
    id: 'au-wons',
    title: 'Weeds of National Significance',
    publisher: 'Australian Government and state and territory governments',
    url: null,
    licence: 'See source terms',
    retrievedOn: '2026-10-28',
    note: 'National list of priority weeds. Verify the current list and add a link before review.',
  },
} as const satisfies Record<string, Source>;

export const SOURCE_LIST: Source[] = Object.values(SOURCES);
