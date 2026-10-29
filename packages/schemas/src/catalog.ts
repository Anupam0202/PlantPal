import { z } from 'zod';
import { Evidence } from './primitives';

/**
 * Catalogue facts (master prompt §17.4). Every trait assertion carries a unit (when numeric), an
 * evidence grade and a source; `tools/validate-catalog` fails the build otherwise.
 */
export const Source = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  title: z.string().min(3),
  publisher: z.string().min(2),
  url: z.string().url().nullable(),
  licence: z.string().min(2),
  retrievedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().optional(),
});
export type Source = z.infer<typeof Source>;

export const LEVELS = ['low', 'medium', 'high'] as const;
export const Level = z.enum(LEVELS);
export type Level = z.infer<typeof Level>;

export const LIFEFORMS = [
  'annual',
  'biennial',
  'perennial',
  'shrub',
  'tree',
  'climber',
  'grass',
  'bulb',
] as const;
export const USE_GROUPS = [
  'herb',
  'leafy',
  'fruiting',
  'root',
  'fruit',
  'flower',
  'foliage',
  'houseplant',
] as const;
export const SOW_SEASONS = ['cool', 'warm', 'any'] as const;
export const INDOOR_LIGHT = ['low', 'medium', 'bright-indirect', 'bright-direct'] as const;

export const NumRange = z
  .object({ min: z.number(), max: z.number() })
  .refine((r) => r.min <= r.max, 'min must not exceed max');
export type NumRange = z.infer<typeof NumRange>;

/** Trait definitions: value shape and the unit every numeric assertion must declare. */
export const TRAITS = {
  lifeform: { value: z.enum(LIFEFORMS), unit: null },
  useGroup: { value: z.enum(USE_GROUPS), unit: null },
  sunHours: { value: NumRange, unit: 'h/day direct sun' },
  indoorLight: { value: z.enum(INDOOR_LIGHT), unit: null },
  minTempC: { value: z.number().min(-60).max(30), unit: '°C' },
  heatTolerance: { value: Level, unit: null },
  heightCm: { value: NumRange, unit: 'cm' },
  spreadCm: { value: NumRange, unit: 'cm' },
  minContainerL: { value: z.number().positive().max(2000), unit: 'L' },
  waterNeed: { value: Level, unit: null },
  effort: { value: Level, unit: null },
  daysToMaturity: { value: NumRange, unit: 'days' },
  sowSeason: { value: z.enum(SOW_SEASONS), unit: null },
  pollinatorValue: { value: Level, unit: null },
  foodValue: { value: z.enum(['none', 'low', 'medium', 'high']), unit: null },
  ornamentalValue: { value: Level, unit: null },
} as const;
export type TraitKey = keyof typeof TRAITS;
export type TraitValue<K extends TraitKey> = z.infer<(typeof TRAITS)[K]['value']>;

export const TraitAssertion = z.object({
  trait: z.enum(Object.keys(TRAITS) as [TraitKey, ...TraitKey[]]),
  value: z.unknown(),
  unit: z.string().nullable(),
  evidence: Evidence,
  sourceId: z.string(),
  /** `needs_review` until a curator checks the value against the cited or a better source. */
  review: z.enum(['reviewed', 'needs_review']),
  note: z.string().optional(),
});
export type TraitAssertion = z.infer<typeof TraitAssertion>;

export const REGION_STATUS = ['NATIVE', 'INTRODUCED', 'INVASIVE_LISTED', 'CONFLICT', 'UNKNOWN'] as const;
export type RegionStatusValue = (typeof REGION_STATUS)[number];

/** Native or invasive status for one region: an ISO country (`IN`) or a WGSRPD level-3 code (`L3:NSW`). */
export const RegionStatus = z.object({
  region: z.string().regex(/^([A-Z]{2}|L3:[A-Z]{3})$/),
  status: z.enum(REGION_STATUS),
  evidence: Evidence,
  sourceId: z.string(),
  review: z.enum(['reviewed', 'needs_review']),
  note: z.string().optional(),
});
export type RegionStatus = z.infer<typeof RegionStatus>;

export const TOXICITY_GROUPS = ['cats', 'dogs', 'horses', 'people'] as const;
export type ToxicityGroup = (typeof TOXICITY_GROUPS)[number];

/**
 * One cited toxicity statement for one group. `NON_TOXIC_LISTED` means "on the source's non-toxic
 * list", which is not the same as "safe to eat" (any plant can upset a stomach).
 */
export const ToxicityAssertion = z.object({
  group: z.enum(TOXICITY_GROUPS),
  status: z.enum(['TOXIC', 'NON_TOXIC_LISTED']),
  evidence: Evidence,
  sourceId: z.string(),
  /** Page for this plant at the source, when there is one. */
  sourceUrl: z.string().url().optional(),
  review: z.enum(['reviewed', 'needs_review']),
  note: z.string().optional(),
});
export type ToxicityAssertion = z.infer<typeof ToxicityAssertion>;

export const Taxon = z.object({
  /** Stable slug, never derived from AI output (L30). */
  id: z.string().regex(/^[a-z0-9-]+$/),
  scientificName: z.string().min(3),
  family: z.string().min(3),
  /** GBIF backbone key once matched; null until verified (never guessed). */
  gbifKey: z.number().int().positive().nullable(),
  names: z.object({ en: z.string(), hi: z.string().optional(), es: z.string().optional() }),
  traits: z.array(TraitAssertion),
  regions: z.array(RegionStatus),
  /** Toxicity is only ever recorded from cited sources (S10). A group with no assertion is unknown. */
  toxicity: z.array(ToxicityAssertion),
});
export type Taxon = z.infer<typeof Taxon>;

export const CatalogPack = z.object({
  id: z.string(),
  version: z.string(),
  sources: z.array(Source),
  taxa: z.array(Taxon),
});
export type CatalogPack = z.infer<typeof CatalogPack>;
