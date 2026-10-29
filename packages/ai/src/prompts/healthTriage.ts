import { HealthTriage } from '@plantpal/schemas';
import type { PolicyContext } from '../policy';
import type { ContextSection, ImagePart, PromptModule } from '../prompt';
import { claimErrors, stringsOf } from '../validators';

export interface HealthTriageInput {
  policy: PolicyContext;
  /** Resized photos with metadata removed (whole plant, affected leaf, stem base, soil). */
  photos: Array<{ label: string; image: ImagePart }>;
  plant: string | null;
  /** The questionnaire as plain lines. */
  answers: string[];
  /** PlantPal's rule-based candidates, as hints the model may disagree with. */
  ruleCandidates: string[];
  notes: string | null;
  weather: string | null;
  careLog: string | null;
  space: string | null;
}

const CHEMICAL =
  /\b(?:insecticides?|fungicides?|pesticides?|herbicides?|miticides?|systemic|copper|sulph?ur|bleach|peroxide|bicarbonate|baking soda)\b/i;

/** F4 health triage (§6.8): candidates with likelihood classes, never a diagnosis. */
export const healthTriageV1: PromptModule<HealthTriageInput, HealthTriage> = {
  id: 'health-triage',
  version: 1,
  role: 'balanced',
  schema: HealthTriage,
  maxOutputTokens: 2048,
  temperature: 0.2,
  thinking: 'default',
  task: [
    'Task: triage a possible plant health problem from the photos and the gardener’s answers.',
    'If the photos are not of a plant, or too unclear to judge, set imageUsable or plantPresent to false, return no candidates and explain in abstainReason.',
    'Candidates: up to 6, grouped as abiotic (water, sun, heat, cold, nutrients, transplant, root-bound), pest or disease. Disease is always a candidate, never a conclusion.',
    'For each: likelihood LIKELY, POSSIBLE or UNLIKELY (never percentages), evidence for and against from the photos and answers, and checks that would tell the candidates apart.',
    'immediateSafeSteps: non-chemical first steps only. Never name products, mixtures or doses; at most say to follow the product label and local rules.',
    'escalate.needed when it is spreading fast, affects many plants or the stem base, or when you cannot narrow it down.',
    'followUpDays: when to look again (for example 3 and 7).',
  ].join('\n'),
  policy: (i) => i.policy,
  sections(i) {
    const s: ContextSection[] = [];
    i.photos.forEach((p, n) =>
      s.push({
        category: 'photos',
        title: `Photo ${n + 1}: ${p.label}`,
        required: true,
        image: p.image,
        text: '',
      }),
    );
    s.push({ category: 'plants', title: 'Answers', required: true, text: i.answers.join('\n') });
    if (i.plant) s.push({ category: 'plants', title: 'Plant', untrusted: true, text: i.plant });
    if (i.ruleCandidates.length)
      s.push({
        category: 'plants',
        title: 'PlantPal rule-based candidates (hints)',
        text: i.ruleCandidates.join('\n'),
      });
    if (i.notes) s.push({ category: 'journal', title: 'Gardener’s notes', untrusted: true, text: i.notes });
    if (i.careLog)
      s.push({ category: 'journal', title: 'Care in the last 14 days', untrusted: true, text: i.careLog });
    if (i.weather) s.push({ category: 'climate', title: 'Weather', text: i.weather });
    if (i.space) s.push({ category: 'space', title: 'Where it grows', untrusted: true, text: i.space });
    return s;
  },
  validate(out) {
    const errors: string[] = [];
    if ((!out.imageUsable || !out.plantPresent) && (out.candidates.length > 0 || !out.abstainReason))
      errors.push(
        'When the image is unusable or shows no plant, return no candidates and give abstainReason.',
      );
    if (out.candidates.length === 0 && !out.abstainReason)
      errors.push('With no candidates, give abstainReason.');
    if (stringsOf(out).some((t) => /\d\s?%/.test(t)))
      errors.push('Use likelihood classes (LIKELY, POSSIBLE, UNLIKELY), never percentages.');
    for (const step of out.immediateSafeSteps)
      if (CHEMICAL.test(step))
        errors.push(`immediateSafeSteps must be non-chemical: "${step.slice(0, 60)}".`);
    return [...errors, ...claimErrors(out)];
  },
};
