import { SpaceDetections } from '@plantpal/schemas';
import type { PolicyContext } from '../policy';
import type { ImagePart, PromptModule } from '../prompt';
import { claimErrors, stringsOf } from '../validators';

export interface SpaceDetectInput {
  policy: PolicyContext;
  image: ImagePart;
}

/** A length with a unit: the model marks things; it never measures them. */
const MEASURE = /\d\s*(?:mm|cm|m|metres?|meters?|in|inch(?:es)?|ft|feet|foot|')(?![a-z])/i;

/**
 * F9 Photo-to-Plan (experimental, behind Labs). Gemini marks pots, railings and walls with boxes;
 * the person sets the scale from one known size and checks every measurement (§6.7, §18).
 */
export const spaceDetectV1: PromptModule<SpaceDetectInput, SpaceDetections> = {
  id: 'space-detect',
  version: 1,
  role: 'balanced',
  schema: SpaceDetections,
  maxOutputTokens: 2048,
  temperature: 0.1,
  thinking: 'low',
  task: [
    'Task: mark the fixed things in this photo of a balcony, terrace, roof or yard that matter for a garden layout:',
    'pots, planters, raised beds, railings, walls, doors, windows, seating and water tanks. Up to 30 items.',
    'For each item give label (one of the allowed labels; "other" if none fits), box_2d as [ymin, xmin, ymax, xmax]',
    'scaled 0 to 1000 relative to the image, and a short note on what it is (for example "terracotta pot").',
    'Do not estimate real sizes or distances; the gardener sets the scale. Do not identify plants or people.',
    'If the photo does not show such a space, or is too dark or blurred, set imageUsable false, return no items and',
    'explain in abstainReason.',
  ].join('\n'),
  policy: (i) => i.policy,
  sections: (i) => [
    {
      category: 'photos',
      title: 'Photo of the space (resized, metadata removed)',
      required: true,
      image: i.image,
      text: '',
    },
  ],
  validate(out) {
    const errors: string[] = [];
    if (!out.imageUsable && (out.items.length > 0 || !out.abstainReason))
      errors.push('When the image is unusable, return no items and give abstainReason.');
    if (out.items.length === 0 && !out.abstainReason) errors.push('With no items, give abstainReason.');
    out.items.forEach((it, n) => {
      const [y0, x0, y1, x1] = it.box_2d as [number, number, number, number];
      if (!(y0 < y1 && x0 < x1))
        errors.push(`Item ${n + 1}: box_2d must be [ymin, xmin, ymax, xmax] with min < max.`);
    });
    if (stringsOf(out).some((t) => MEASURE.test(t)))
      errors.push('Do not state sizes or distances; only mark items.');
    return [...errors, ...claimErrors(out)];
  },
};
