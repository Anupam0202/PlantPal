import { z } from 'zod';

/**
 * Structured AI outputs (master prompt Appendix A.2). JSON Schema for `responseJsonSchema` is generated
 * from these with `z.toJSONSchema`; every response is parsed with them and then semantically validated.
 */

export const Likelihood = z.enum(['LIKELY', 'POSSIBLE', 'UNLIKELY']);
export type Likelihood = z.infer<typeof Likelihood>;

export const Citation = z.object({ url: z.string().url(), title: z.string().max(200) });
export type Citation = z.infer<typeof Citation>;

/** F1 Plan Explainer & Expander. */
export const PlanExplanation = z.object({
  summary: z.string().max(600),
  perPlant: z
    .array(
      z.object({
        /** Must be one of the candidates sent (semantic validator). */
        taxonKey: z.string().max(80),
        whyItFits: z.array(z.string().max(160)).max(4),
        watchOuts: z.array(z.string().max(160)).max(3),
        firstSteps: z.array(z.string().max(160)).max(3),
      }),
    )
    .max(12),
  /** Re-run through the eligibility engine before display; unmatched names are dropped. */
  extraSuggestions: z
    .array(z.object({ scientificName: z.string().max(120), reason: z.string().max(200) }))
    .max(5),
  unknowns: z.array(z.string().max(200)).max(5),
});
export type PlanExplanation = z.infer<typeof PlanExplanation>;

/** F2 Quick Capture parser: proposals only; nothing is written until the user confirms. */
export const CaptureProposal = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('careEvent'),
    specimenId: z.string().nullable(),
    kind: z.enum(['water', 'feed', 'prune', 'repot', 'mulch', 'other']),
    amount: z.object({ value: z.number().nonnegative(), unit: z.enum(['ml', 'l']) }).nullable(),
    when: z.enum(['now', 'earlierToday']),
    sourceSpan: z.string().max(200),
  }),
  z.object({
    type: z.literal('observation'),
    specimenId: z.string().nullable(),
    kind: z.enum(['symptom', 'phenophase', 'visitor', 'note']),
    text: z.string().max(400),
    count: z.number().int().nonnegative().nullable(),
    sourceSpan: z.string().max(200),
  }),
  z.object({
    type: z.literal('task'),
    specimenId: z.string().nullable(),
    title: z.string().max(120),
    dueOn: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable(),
    sourceSpan: z.string().max(200),
  }),
  z.object({
    type: z.literal('harvest'),
    specimenId: z.string().nullable(),
    massG: z.number().nonnegative().nullable(),
    count: z.number().int().nonnegative().nullable(),
    countLabel: z.string().max(30).nullable(),
    sourceSpan: z.string().max(200),
  }),
]);
export type CaptureProposal = z.infer<typeof CaptureProposal>;

export const CaptureProposals = z.object({
  proposals: z.array(CaptureProposal).max(10),
  unparsed: z.string().max(400),
});
export type CaptureProposals = z.infer<typeof CaptureProposals>;

/** F12 alt text for a photo; the user confirms before it is saved. */
export const AltText = z.object({
  altText: z.string().min(1).max(200),
  plantVisible: z.boolean(),
});
export type AltText = z.infer<typeof AltText>;

/** F12 plain-language explanation of a term or passage. */
export const PlainExplanation = z.object({
  plain: z.string().max(600),
  terms: z.array(z.object({ term: z.string().max(60), meaning: z.string().max(200) })).max(6),
  unknowns: z.array(z.string().max(200)).max(3),
});
export type PlainExplanation = z.infer<typeof PlainExplanation>;

/** Errors the AI layer can raise, each with its own copy and recovery in the UI (§18.4). */
export const AI_ERROR_CODES = [
  'KEY_MISSING',
  'KEY_INVALID',
  'PERMISSION_DENIED',
  'REGION_UNSUPPORTED',
  'RATE_LIMITED',
  'DAILY_QUOTA',
  'BILLING_REQUIRED',
  'MODEL_UNAVAILABLE',
  'SAFETY_BLOCKED',
  'RECITATION',
  'OUTPUT_TRUNCATED',
  'SCHEMA_INVALID',
  'NO_FINAL_OUTPUT',
  'NETWORK',
  'TIMEOUT',
  'CANCELLED',
  'CONSENT_REQUIRED',
  'AI_DISABLED',
] as const;
export type AiErrorCode = (typeof AI_ERROR_CODES)[number];

export const MODEL_ROLES = ['fast', 'balanced', 'deep', 'live', 'embed', 'image'] as const;
export type ModelRole = (typeof MODEL_ROLES)[number];

/** A model as listed by the API, normalised. */
export const ModelInfo = z.object({
  name: z.string(),
  displayName: z.string(),
  version: z.string().nullable(),
  inputTokenLimit: z.number().nullable(),
  outputTokenLimit: z.number().nullable(),
  methods: z.array(z.string()),
});
export type ModelInfo = z.infer<typeof ModelInfo>;

/** Per-category consent for what may be sent to the user's AI provider (§18.10). */
export const AI_DATA_CATEGORIES = ['plants', 'space', 'climate', 'journal', 'photos', 'location'] as const;
export type AiDataCategory = (typeof AI_DATA_CATEGORIES)[number];
