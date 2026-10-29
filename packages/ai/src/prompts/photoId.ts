import { IdCandidates } from '@plantpal/schemas';
import type { PolicyContext } from '../policy';
import type { ImagePart, PromptModule } from '../prompt';
import { claimErrors, stringsOf } from '../validators';

export interface PhotoIdInput {
  policy: PolicyContext;
  image: ImagePart;
  /** Country or region only, to weigh likely species. */
  region: string | null;
  /** What the gardener thinks it is, if anything. */
  hint: string | null;
}

const BINOMIAL = /^[A-Z][a-z]+(?: [a-z-]+){1,3}(?: (?:subsp|var|f)\. [a-z-]+)?$/;

/** F5 photo identification candidates. Names are checked against GBIF before display (§18.5). */
export const photoIdV1: PromptModule<PhotoIdInput, IdCandidates> = {
  id: 'photo-id',
  version: 1,
  role: 'balanced',
  schema: IdCandidates,
  maxOutputTokens: 1024,
  temperature: 0.2,
  thinking: 'low',
  task: [
    'Task: suggest what plant this photo shows, as up to 5 candidates with scientific names (genus and species, no author).',
    'For each: likelihood LIKELY, POSSIBLE or UNLIKELY, visible features that support it, and common look-alikes.',
    'If the photo shows no plant or is too unclear, set imageUsable false, return no candidates and explain in abstainReason.',
    'Never say whether any part is edible, safe or medicinal.',
  ].join('\n'),
  policy: (i) => i.policy,
  sections: (i) => [
    {
      category: 'photos',
      title: 'Photo (resized, metadata removed)',
      required: true,
      image: i.image,
      text: '',
    },
    ...(i.region ? [{ category: 'location' as const, title: 'Region', text: i.region }] : []),
    ...(i.hint
      ? [
          {
            category: 'plants' as const,
            title: 'The gardener thinks it may be',
            untrusted: true,
            text: i.hint,
          },
        ]
      : []),
  ],
  validate(out) {
    const errors: string[] = [];
    if (!out.imageUsable && (out.candidates.length > 0 || !out.abstainReason))
      errors.push('When the image is unusable, return no candidates and give abstainReason.');
    if (out.candidates.length === 0 && !out.abstainReason)
      errors.push('With no candidates, give abstainReason.');
    for (const c of out.candidates)
      if (!BINOMIAL.test(c.scientificName.trim()))
        errors.push(`"${c.scientificName}" is not a scientific name (Genus species).`);
    if (stringsOf(out).some((t) => /\d\s?%/.test(t)))
      errors.push('Use likelihood classes, never percentages.');
    return [...errors, ...claimErrors(out)];
  },
};
