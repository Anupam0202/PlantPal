import { PlainExplanation } from '@plantpal/schemas';
import type { PolicyContext } from '../policy';
import type { PromptModule } from '../prompt';
import { claimErrors, isGrounded } from '../validators';

export interface PlainExplainInput {
  policy: PolicyContext;
  /** What the passage is about, e.g. "Climate Fit for this garden". */
  topic: string;
  passage: string;
  readingLevel: 'simple' | 'standard';
}

/** F12 plain-language explainer for a passage the app already shows. */
export const plainExplainV1: PromptModule<PlainExplainInput, PlainExplanation> = {
  id: 'plain-explain',
  version: 1,
  role: 'fast',
  schema: PlainExplanation,
  maxOutputTokens: 1024,
  temperature: 0.3,
  thinking: 'minimal',
  task: [
    'Task: explain the passage in plain words for a home gardener. Do not add facts or numbers that are not in the passage.',
    'terms: up to 6 technical words from the passage with a one-line meaning. unknowns: what the passage cannot tell them.',
  ].join('\n'),
  policy: (i) => i.policy,
  sections: (i) => [
    {
      category: 'request',
      title: 'Reading level',
      text:
        i.readingLevel === 'simple'
          ? 'Very simple words, short sentences (about age 10).'
          : 'Plain adult language.',
    },
    { category: 'climate', title: i.topic, required: true, text: i.passage },
  ],
  validate(out, i) {
    const errors: string[] = [];
    for (const t of out.terms)
      if (!isGrounded(t.term, i.passage)) errors.push(`term "${t.term}" is not in the passage.`);
    return [...errors, ...claimErrors(out)];
  },
};
