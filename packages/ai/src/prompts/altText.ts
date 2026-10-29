import { AltText } from '@plantpal/schemas';
import type { PolicyContext } from '../policy';
import type { ImagePart, PromptModule } from '../prompt';
import { claimErrors } from '../validators';

export interface AltTextInput {
  policy: PolicyContext;
  image: ImagePart;
  plantName: string | null;
}

/** F12 alt text for a photo. The user edits and confirms it before it is saved. */
export const altTextV1: PromptModule<AltTextInput, AltText> = {
  id: 'alt-text',
  version: 1,
  role: 'fast',
  schema: AltText,
  maxOutputTokens: 256,
  temperature: 0.2,
  thinking: 'minimal',
  task: [
    'Task: write alt text for this garden photo for someone using a screen reader.',
    'Describe what is visible (plant, leaves, flowers, pot, setting, notable colours) in one or two plain sentences, under 200 characters.',
    'Do not start with "Image of" or "Photo of". Do not identify the species with certainty or diagnose problems; describe what you see.',
    'Set plantVisible to false when no plant is visible.',
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
    ...(i.plantName
      ? [
          {
            category: 'plants' as const,
            title: 'The gardener calls this plant',
            untrusted: true,
            text: i.plantName,
          },
        ]
      : []),
  ],
  validate(out) {
    const errors: string[] = [];
    if (/^(image|photo|picture) of\b/i.test(out.altText.trim()))
      errors.push('altText must not start with "Image of".');
    return [...errors, ...claimErrors(out)];
  },
};
