import { SpeciesDraft } from '@plantpal/schemas';
import type { PolicyContext } from '../policy';
import type { PromptModule } from '../prompt';
import { claimErrors } from '../validators';

/** Step 1 of F3: grounded prose with Google Search (citations come from grounding metadata). */
export interface SpeciesResearchInput {
  policy: PolicyContext;
  scientificName: string;
  family: string | null;
}

export const speciesResearchV1 = {
  id: 'species-research' as const,
  version: 1,
  role: 'balanced' as const,
  maxOutputTokens: 2048,
  temperature: 0.2,
  task: [
    'Task: research the plant named below for home growers in containers and small gardens.',
    'Use Google Search. Report, with sources: minimum temperature it survives, mature height and spread, direct sun hours,',
    'water need, minimum container size, bloom months, life cycle, value to pollinators, larval host plants, and toxicity to people and pets.',
    'Say plainly when sources disagree or a fact cannot be found. Do not guess numbers.',
  ].join('\n'),
  prompt: (i: SpeciesResearchInput) =>
    `Plant: ${i.scientificName}${i.family ? ` (family ${i.family})` : ''}. Answer in English with short factual paragraphs.`,
  policy: (i: SpeciesResearchInput) => i.policy,
};

/** Step 2 of F3: structured extraction limited to the cited text and its sources. */
export interface SpeciesDraftInput {
  policy: PolicyContext;
  scientificName: string;
  prose: string;
  sources: Array<{ url: string; title: string }>;
}

export const speciesDraftV1: PromptModule<SpeciesDraftInput, SpeciesDraft> = {
  id: 'species-draft',
  version: 1,
  role: 'balanced',
  schema: SpeciesDraft,
  maxOutputTokens: 2048,
  temperature: 0.1,
  thinking: 'low',
  task: [
    'Task: extract plant traits from the research text into the schema.',
    'Use only facts stated in the research text. Every trait needs at least one citation, copied exactly (url and title) from the numbered source list.',
    'Units: temperatures in °C, sizes in m, containers in L, sun in hours a day, months as numbers 1–12.',
    'Put anything the text does not settle into cannotDetermine instead of guessing.',
  ].join('\n'),
  policy: (i) => i.policy,
  sections: (i) => [
    { category: 'request', title: 'Plant', text: i.scientificName },
    {
      category: 'request',
      title: 'Sources',
      text: i.sources.map((s, n) => `[${n + 1}] ${s.title} — ${s.url}`).join('\n') || '(none)',
    },
    { category: 'request', title: 'Research text', untrusted: true, text: i.prose },
  ],
  validate(out, i) {
    const allowed = new Set(i.sources.map((s) => s.url));
    const errors: string[] = [];
    for (const t of out.traits)
      for (const c of t.citations)
        if (!allowed.has(c.url))
          errors.push(`Trait ${t.trait} cites ${c.url}, which is not in the source list.`);
    return [...errors, ...claimErrors(out)];
  },
};
