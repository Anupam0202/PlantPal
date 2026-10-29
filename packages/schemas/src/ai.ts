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

/** F4 Health triage (Appendix A.2). Likelihood classes only; abstains when the photo is unusable. */
export const HEALTH_CATEGORIES = ['abiotic', 'pest', 'disease', 'unknown'] as const;
export const HealthTriage = z.object({
  imageUsable: z.boolean(),
  plantPresent: z.boolean(),
  identityGuess: z.object({ name: z.string().max(120), likelihood: Likelihood }).nullable(),
  candidates: z
    .array(
      z.object({
        category: z.enum(HEALTH_CATEGORIES),
        name: z.string().min(1).max(120),
        likelihood: Likelihood,
        evidenceFor: z.array(z.string().max(200)).max(4),
        evidenceAgainst: z.array(z.string().max(200)).max(4),
        checksToConfirm: z.array(z.string().max(200)).max(4),
      }),
    )
    .max(6),
  /** Non-chemical only (validator). */
  immediateSafeSteps: z.array(z.string().max(200)).max(5),
  escalate: z.object({ needed: z.boolean(), reason: z.string().max(200) }),
  followUpDays: z.array(z.number().int().min(1).max(30)).max(3),
  abstainReason: z.string().max(200).nullable(),
});
export type HealthTriage = z.infer<typeof HealthTriage>;

/** F5 photo identification candidates. Names are resolved through GBIF before display; never edibility. */
export const IdCandidates = z.object({
  imageUsable: z.boolean(),
  candidates: z
    .array(
      z.object({
        scientificName: z.string().min(3).max(120),
        commonName: z.string().max(120).nullable(),
        likelihood: Likelihood,
        /** Visible features that support it. */
        features: z.array(z.string().max(160)).max(4),
        lookAlikes: z.array(z.string().max(120)).max(3),
      }),
    )
    .max(5),
  abstainReason: z.string().max(200).nullable(),
});
export type IdCandidates = z.infer<typeof IdCandidates>;

/** F3 species intake draft (Appendix A.2). Every trait needs a citation from the grounding sources. */
export const SPECIES_DRAFT_TRAITS = [
  'minTempC',
  'maxHeightM',
  'maxSpreadM',
  'directSunHoursMin',
  'directSunHoursMax',
  'waterNeed',
  'containerMinL',
  'bloomMonths',
  'lifecycle',
  'pollinatorValue',
  'hostFor',
  'toxicity',
] as const;
export type SpeciesDraftTrait = (typeof SPECIES_DRAFT_TRAITS)[number];

export const SpeciesDraft = z.object({
  traits: z
    .array(
      z.object({
        trait: z.enum(SPECIES_DRAFT_TRAITS),
        value: z.union([z.number(), z.string().max(200), z.array(z.number().int().min(1).max(12)).max(12)]),
        unit: z.string().max(20).nullable(),
        /** Region, stage or cultivar scope. */
        appliesTo: z.string().max(120).nullable(),
        citations: z.array(Citation).min(1).max(4),
      }),
    )
    .max(20),
  cannotDetermine: z.array(z.string().max(120)).max(12),
});
export type SpeciesDraft = z.infer<typeof SpeciesDraft>;
