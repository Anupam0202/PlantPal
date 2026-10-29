import { PlanExplanation } from '@plantpal/schemas';
import type { PolicyContext } from '../policy';
import type { ContextSection, PromptModule } from '../prompt';
import { claimErrors } from '../validators';

export interface PlanCandidateFact {
  taxonKey: string;
  commonName: string;
  scientificName: string;
  status: 'ELIGIBLE' | 'NEEDS_INPUT';
  /** Deterministic reasons from the eligibility engine, in plain words. */
  reasons: string[];
  warnings: string[];
}

export interface PlanExplainInput {
  policy: PolicyContext;
  /** Coarse place: city or region and country. Never coordinates. */
  place: string | null;
  climate: string | null;
  spaces: string[];
  household: string | null;
  goals: string[];
  candidates: PlanCandidateFact[];
}

/** F1 Plan Explainer & Expander. */
export const planExplainV1: PromptModule<PlanExplainInput, PlanExplanation> = {
  id: 'plan-explain',
  version: 1,
  role: 'balanced',
  schema: PlanExplanation,
  maxOutputTokens: 2048,
  temperature: 0.3,
  thinking: 'default',
  task: [
    'Task: explain why the candidate plants below fit this garden, using only the facts given.',
    'For each candidate you mention, use its exact taxonKey. Do not add plants to perPlant that are not in the candidate list.',
    'whyItFits: short reasons tied to the facts (light hours, climate, space, goals). watchOuts: warnings and what to check.',
    'firstSteps: practical, non-chemical first steps for the first fortnight.',
    'extraSuggestions: at most 5 other plants worth checking, by scientific name; the app re-checks each against its rules and may drop them.',
    'unknowns: facts that are missing and would change the advice. Keep each line under 160 characters.',
  ].join('\n'),
  policy: (i) => i.policy,
  sections(i) {
    const s: ContextSection[] = [];
    s.push({
      category: 'plants',
      title: 'Candidate plants (from PlantPal rules)',
      required: true,
      text: JSON.stringify(
        i.candidates.map((c) => ({
          taxonKey: c.taxonKey,
          name: c.commonName,
          scientificName: c.scientificName,
          status: c.status,
          reasons: c.reasons,
          warnings: c.warnings,
        })),
        null,
        1,
      ),
    });
    if (i.climate) s.push({ category: 'climate', title: 'Climate summary', text: i.climate });
    if (i.place) s.push({ category: 'location', title: 'Area', text: i.place, untrusted: true });
    if (i.spaces.length > 0)
      s.push({ category: 'space', title: 'Growing spaces', text: i.spaces.join('\n'), untrusted: true });
    if (i.household || i.goals.length > 0)
      s.push({
        category: 'space',
        title: 'Household and goals',
        text: [i.household, i.goals.length ? `Goals: ${i.goals.join(', ')}` : null]
          .filter(Boolean)
          .join('\n'),
      });
    return s;
  },
  validate(out, i) {
    const keys = new Set(i.candidates.map((c) => c.taxonKey));
    const errors: string[] = [];
    const seen = new Set<string>();
    for (const p of out.perPlant) {
      if (!keys.has(p.taxonKey))
        errors.push(`perPlant taxonKey "${p.taxonKey}" is not in the candidate list.`);
      if (seen.has(p.taxonKey)) errors.push(`perPlant taxonKey "${p.taxonKey}" appears twice.`);
      seen.add(p.taxonKey);
    }
    return [...errors, ...claimErrors(out)];
  },
};
