import { z } from 'zod';
import {
  EpochMs,
  Evidence,
  Id,
  LocalDate,
  LongText,
  OptionalAmount,
  RecordSource,
  ShortText,
} from './primitives';
import { INDOOR_LIGHT } from './catalog';

/** Fields shared by every versioned, user-editable entity. */
const versioned = {
  id: Id,
  workspaceId: Id,
  createdAt: EpochMs,
  updatedAt: EpochMs,
  version: z.number().int().positive(),
  deletedAt: EpochMs.nullable(),
};

/** Fields shared by append-only records (events, observations). They are never edited, only voided. */
const appendOnly = {
  id: Id,
  workspaceId: Id,
  gardenId: Id,
  opId: Id,
  createdAt: EpochMs,
  deletedAt: EpochMs.nullable(),
};

// ---------------------------------------------------------------- workspace

export const Workspace = z.object({
  id: Id,
  name: ShortText.min(1),
  /** `local` workspaces never leave the device; `synced` ones queue changes in the outbox. */
  mode: z.enum(['local', 'synced']),
  createdAt: EpochMs,
  updatedAt: EpochMs,
  version: z.number().int().positive(),
});
export type Workspace = z.infer<typeof Workspace>;

// ---------------------------------------------------------------- place

export const HEMISPHERES = ['north', 'south'] as const;

export const Place = z.object({
  label: ShortText.nullable(),
  /** Precise coordinates stay on the device; only coarse cells are ever shared. */
  lat: z.number().min(-90).max(90).nullable(),
  lon: z.number().min(-180).max(180).nullable(),
});
export type Place = z.infer<typeof Place>;

/** Where the garden is, for region-specific rules: ISO country (GRIIS lists) and botanical country (WCVP). */
export const GardenRegion = z.object({
  countryCode: z
    .string()
    .regex(/^[A-Z]{2}$/)
    .nullable(),
  admin1: ShortText.nullable(),
  /** WGSRPD level-3 botanical country code, once resolved. */
  l3: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .nullable(),
});
export type GardenRegion = z.infer<typeof GardenRegion>;

export const GOALS = [
  'food',
  'pollinators',
  'native',
  'cool-shade',
  'beauty',
  'low-water',
  'learn-kids',
] as const;
export type Goal = (typeof GOALS)[number];
export const WATER_ACCESS = ['tap', 'carry', 'rain'] as const;
export const FROST_ANSWERS = ['none', 'light', 'hard'] as const;

/** Answers from Seed onboarding (§7 W1) that the eligibility engine uses. Every field may be unanswered. */
export const GardenProfile = z.object({
  household: z.object({ cats: z.boolean(), dogs: z.boolean(), children: z.boolean() }).nullable(),
  /** Opt-in: show plants toxic to the household with a warning instead of hiding them. */
  showToxicWithWarning: z.boolean(),
  goals: z.array(z.enum(GOALS)).max(3),
  minutesPerWeek: z.number().int().min(0).max(10_000).nullable(),
  waterAccess: z.enum(WATER_ACCESS).nullable(),
  budget: z.enum(['low', 'medium', 'high']).nullable(),
  /** Manual climate answers, used when no location or climate data is available. */
  manualClimate: z
    .object({
      frost: z.enum(FROST_ANSWERS).nullable(),
      hotSummers: z.boolean().nullable(),
      monsoon: z.boolean().nullable(),
    })
    .nullable(),
});
export type GardenProfile = z.infer<typeof GardenProfile>;

export const Garden = z.object({
  ...versioned,
  name: ShortText.min(1),
  timezone: z.string().min(1).max(64),
  hemisphere: z.enum(HEMISPHERES).nullable(),
  place: Place.nullable(),
  region: GardenRegion.nullable().default(null),
  profile: GardenProfile.nullable().default(null),
  notes: LongText,
  source: RecordSource,
});
export type Garden = z.infer<typeof Garden>;

export const ZONE_KINDS = [
  'balcony',
  'rooftop',
  'windowsill',
  'indoor',
  'courtyard',
  'yard',
  'community-plot',
  'bed',
  'other',
] as const;
export type ZoneKind = (typeof ZONE_KINDS)[number];

export const LIGHT_LEVELS = ['full-sun', 'part-sun', 'part-shade', 'shade'] as const;
export type LightLevel = (typeof LIGHT_LEVELS)[number];
export const WIND_LEVELS = ['sheltered', 'moderate', 'exposed'] as const;
export const DRAINAGE_LEVELS = ['pools', 'normal', 'fast'] as const;

/**
 * How the zone's direct sun was found (§6.2): `class` the user picked a light class, `facing` computed
 * from facing / cover / what is across, `quick` from clear-day times the user saw, `horizon` from a
 * traced or edited skyline, `measured` from the user's own meter readings.
 */
export const SUN_METHODS = ['class', 'facing', 'quick', 'horizon', 'measured'] as const;
export const OBSTRUCTIONS = ['none', 'low', 'medium', 'high'] as const;

export const ZoneSun = z.object({
  method: z.enum(SUN_METHODS),
  facingDeg: z.number().min(0).max(359.99).nullable(),
  /** Overhang cut-off angle when the zone is covered from above. */
  overhangDeg: z.number().min(5).max(85).nullable(),
  across: z.enum(OBSTRUCTIONS).nullable(),
  /** Obstruction elevation per 5° of azimuth (72 values), for `horizon`. */
  horizon: z.array(z.number().min(0).max(90)).length(72).nullable(),
  quick: z
    .object({ summerHours: z.number().min(0).max(24), winterHours: z.number().min(0).max(24) })
    .nullable(),
  /** Direct-sun hours on the 21st of each month, January first. 0 is a real value (L21). */
  monthlyHours: z.array(z.number().min(0).max(24)).length(12),
  year: z.number().int(),
  computedAt: EpochMs,
});
export type ZoneSun = z.infer<typeof ZoneSun>;

export const Zone = z.object({
  ...versioned,
  gardenId: Id,
  name: ShortText.min(1),
  kind: z.enum(ZONE_KINDS),
  /** `true` when rain cannot reach it (roof, overhang, indoors). */
  covered: z.boolean().nullable(),
  areaM2: OptionalAmount,
  /** Direction the zone faces, degrees clockwise from north. */
  orientationDeg: z.number().int().min(0).max(359).nullable(),
  light: z.enum(LIGHT_LEVELS).nullable(),
  sun: ZoneSun.nullable().default(null),
  /** Window light class for indoor zones (no lux or PPFD from photos, S4). */
  indoorLight: z.enum(INDOOR_LIGHT).nullable().default(null),
  /** Free height above the plants, for E3. */
  clearanceCm: OptionalAmount.default(null),
  /** Largest container that fits, litres. */
  maxContainerL: OptionalAmount.default(null),
  wind: z.enum(WIND_LEVELS).nullable(),
  drainage: z.enum(DRAINAGE_LEVELS).nullable(),
  notes: LongText,
  source: RecordSource,
});
export type Zone = z.infer<typeof Zone>;

export const CONTAINER_SHAPES = [
  'round',
  'square',
  'rectangular',
  'window-box',
  'grow-bag',
  'raised-bed',
  'hanging',
  'other',
] as const;
export type ContainerShape = (typeof CONTAINER_SHAPES)[number];
export const CONTAINER_MATERIALS = [
  'plastic',
  'terracotta',
  'ceramic',
  'metal',
  'wood',
  'fabric',
  'concrete',
  'other',
] as const;

export const SUBSTRATE_TYPES = ['potting-mix', 'peat-free', 'coir', 'garden-soil', 'gritty'] as const;

const Cm = z.number().finite().positive().max(10_000);
export const ContainerDims = z.object({
  diameterCm: Cm.optional(),
  lengthCm: Cm.optional(),
  widthCm: Cm.optional(),
  depthCm: Cm.optional(),
});
export type ContainerDims = z.infer<typeof ContainerDims>;

export const Container = z.object({
  ...versioned,
  gardenId: Id,
  zoneId: Id,
  name: ShortText.min(1),
  shape: z.enum(CONTAINER_SHAPES),
  dimsCm: ContainerDims,
  /** Litres. Entered by the user or computed from the dimensions. */
  volumeL: OptionalAmount,
  material: z.enum(CONTAINER_MATERIALS).nullable(),
  drainageHoles: z.boolean().nullable(),
  substrate: ShortText,
  /** Substrate class for the water balance; null means unknown (wider estimates, check more often). */
  substrateType: z.enum(SUBSTRATE_TYPES).nullable().default(null),
  /** Personal water factor learned from soil checks (§6.4), bounded to [0.5, 2]. */
  waterFactor: z.number().min(0.5).max(2).default(1),
  notes: LongText,
  source: RecordSource,
});
export type Container = z.infer<typeof Container>;

// ---------------------------------------------------------------- growing

export const SPECIMEN_STATUSES = ['planned', 'active', 'dormant', 'archived', 'dead', 'given_away'] as const;
export type SpecimenStatus = (typeof SPECIMEN_STATUSES)[number];
export const IDENTITY_LEVELS = ['cultivar', 'species', 'genus', 'unknown'] as const;
export type IdentityLevel = (typeof IDENTITY_LEVELS)[number];
export const ORIGINS = [
  'seed',
  'cutting',
  'division',
  'nursery',
  'gift',
  'swap',
  'found',
  'unknown',
] as const;
export type Origin = (typeof ORIGINS)[number];

export const Specimen = z.object({
  ...versioned,
  gardenId: Id,
  zoneId: Id.nullable(),
  containerId: Id.nullable(),
  displayName: ShortText.min(1).max(120),
  scientificName: ShortText.nullable(),
  cultivar: ShortText.nullable(),
  /** GBIF backbone key once the name is matched (M4). */
  taxonKey: z.string().max(40).nullable(),
  /** PlantPal catalogue taxon this plant was planned from, if any. */
  catalogTaxonId: z.string().max(80).nullable().default(null),
  identityLevel: z.enum(IDENTITY_LEVELS),
  origin: z.enum(ORIGINS),
  parentSpecimenId: Id.nullable(),
  plantedOn: LocalDate.nullable(),
  status: z.enum(SPECIMEN_STATUSES),
  statusReason: ShortText.nullable(),
  /** A holding record (e.g. "Unlinked notes" from a migration), not a real plant. */
  holding: z.boolean(),
  coverMediaId: Id.nullable(),
  notes: LongText,
  source: RecordSource,
});
export type Specimen = z.infer<typeof Specimen>;

// ---------------------------------------------------------------- care and journal

export const CARE_KINDS = [
  'water',
  'feed',
  'prune',
  'repot',
  'mulch',
  'pest-check',
  'treatment',
  'support',
  'other',
] as const;
export type CareKind = (typeof CARE_KINDS)[number];
export const WATER_SOURCES = ['tap', 'rain', 'grey', 'other'] as const;
export type WaterSource = (typeof WATER_SOURCES)[number];

const When = {
  occurredAt: EpochMs,
  occurredOn: LocalDate,
  /** The original record had no usable date; `occurredAt` is a placeholder and the UI says so. */
  dateUncertain: z.boolean(),
};

export const CareEvent = z.object({
  ...appendOnly,
  ...When,
  specimenId: Id.nullable(),
  kind: z.enum(CARE_KINDS),
  /** Whole millilitres. `null` means the amount was not recorded. */
  amountMl: z.number().int().nonnegative().nullable(),
  waterSource: z.enum(WATER_SOURCES).nullable(),
  /** Set when the event resolves a scheduled task (M5); duplicates are detected by this key. */
  occurrenceKey: z.string().max(120).nullable(),
  notes: LongText,
  mediaIds: z.array(Id).max(20),
  source: RecordSource,
});
export type CareEvent = z.infer<typeof CareEvent>;

export const OBSERVATION_KINDS = [
  'note',
  'milestone',
  'measurement',
  'pest',
  'disease',
  'wildlife',
  'photo',
] as const;
export type ObservationKind = (typeof OBSERVATION_KINDS)[number];
export const MILESTONES = [
  'sown',
  'planted',
  'sprouted',
  'first-flower',
  'first-fruit',
  'first-harvest',
  'repotted',
  'other',
] as const;
export type Milestone = (typeof MILESTONES)[number];

export const Measurements = z.object({
  heightCm: z.number().finite().nonnegative().optional(),
  spreadCm: z.number().finite().nonnegative().optional(),
  leafCount: z.number().int().nonnegative().optional(),
  flowerCount: z.number().int().nonnegative().optional(),
  fruitCount: z.number().int().nonnegative().optional(),
});
export type Measurements = z.infer<typeof Measurements>;

export const WeatherNote = z.object({
  temperatureC: z.number().finite().nullable(),
  humidityPct: z.number().finite().min(0).max(100).nullable(),
  description: ShortText.nullable(),
  evidence: Evidence,
});

export const Observation = z.object({
  ...appendOnly,
  ...When,
  specimenId: Id.nullable(),
  kind: z.enum(OBSERVATION_KINDS),
  milestone: z.enum(MILESTONES).nullable(),
  title: ShortText,
  notes: LongText,
  values: Measurements,
  weather: WeatherNote.nullable(),
  mediaIds: z.array(Id).max(20),
  source: RecordSource,
});
export type Observation = z.infer<typeof Observation>;

export const HARVEST_QUALITIES = ['excellent', 'good', 'fair', 'poor'] as const;
export const HARVEST_DESTINATIONS = ['eaten', 'stored', 'shared', 'composted', 'other'] as const;

export const Harvest = z.object({
  ...appendOnly,
  specimenId: Id.nullable(),
  /** Free-text label, kept when the harvest is not linked to a specimen. */
  plantName: ShortText,
  harvestedOn: LocalDate,
  dateUncertain: z.boolean(),
  /** Grams. Only mass units ever land here (S1). */
  massG: OptionalAmount,
  count: z.number().int().nonnegative().nullable(),
  countLabel: z.string().trim().max(40).nullable(),
  /** The quantity exactly as the user recorded it. */
  original: z.object({ quantity: z.number().finite().nullable(), unit: z.string().max(40) }).nullable(),
  quality: z.enum(HARVEST_QUALITIES).nullable(),
  destination: z.enum(HARVEST_DESTINATIONS).nullable(),
  notes: LongText,
  source: RecordSource,
});
export type Harvest = z.infer<typeof Harvest>;

// ---------------------------------------------------------------- care schedules and task history

export const TASK_KINDS = [
  'check-water',
  'water',
  'feed',
  'prune',
  'pest-check',
  'harvest',
  'custom',
] as const;
export type TaskKindValue = (typeof TASK_KINDS)[number];

export const RecurrenceRule = z.object({
  freq: z.enum(['daily', 'weekly', 'monthly']),
  interval: z.number().int().min(1).max(365),
  byWeekday: z.array(z.number().int().min(1).max(7)).max(7).optional(),
  startOn: LocalDate,
  until: LocalDate.nullable().optional(),
  at: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .nullable()
    .optional(),
});

/** A care rule for one plant or space. Editing the rule bumps `version` and `effectiveFrom` (§6.6). */
export const CareSchedule = z.object({
  ...versioned,
  gardenId: Id,
  specimenId: Id.nullable(),
  zoneId: Id.nullable(),
  kind: z.enum(TASK_KINDS),
  /** User wording for custom tasks; default kinds are named by the app in the user's language. */
  title: ShortText,
  rule: RecurrenceRule,
  effectiveFrom: LocalDate,
  pausedUntil: LocalDate.nullable(),
  /** `engine`: created from traits; `user`: added or edited by the user. */
  origin: z.enum(['engine', 'user']),
  source: RecordSource,
});
export type CareSchedule = z.infer<typeof CareSchedule>;

export const SOIL_CHECKS = ['dry', 'moist', 'wet'] as const;
export const LEAF_CHECKS = ['fine', 'droopy', 'yellowing', 'spots'] as const;
export const SKIP_REASONS = ['rained', 'moist', 'away', 'other'] as const;

/**
 * What happened to one task occurrence (append-only). A "done" or "checked" is final; "checked, still
 * moist" counts as completed care (appropriate inaction). Ids for "done" are derived from the
 * occurrence key, so a double tap or offline replay cannot complete a task twice.
 */
export const TaskLog = z.object({
  ...appendOnly,
  occurrenceKey: z.string().max(160),
  scheduleId: Id.nullable(),
  specimenId: Id.nullable(),
  kind: z.enum(TASK_KINDS),
  action: z.enum(['done', 'checked', 'skipped', 'snoozed']),
  at: EpochMs,
  occurredOn: LocalDate,
  snoozeUntil: EpochMs.nullable(),
  reason: z.enum(SKIP_REASONS).nullable(),
  check: z
    .object({
      soil: z.enum(SOIL_CHECKS).nullable(),
      leaves: z.enum(LEAF_CHECKS).nullable(),
      pests: z.boolean().nullable(),
    })
    .nullable(),
  careEventId: Id.nullable(),
});
export type TaskLog = z.infer<typeof TaskLog>;

// ---------------------------------------------------------------- plans

export const PLAN_ITEM_STATUSES = ['ELIGIBLE', 'NEEDS_INPUT', 'EXCLUDED'] as const;

export const Plan = z.object({
  ...versioned,
  gardenId: Id,
  name: ShortText.min(1),
  status: z.enum(['draft', 'saved']),
  catalogVersion: z.string().max(40),
  engineVersion: z.string().max(40),
  /** Fingerprint of the inputs, so the plan can tell when the space or climate has changed since. */
  inputsHash: z.string().max(64),
  source: RecordSource,
});
export type Plan = z.infer<typeof Plan>;

export const PlanFinding = z.object({
  rule: z.string().max(4),
  outcome: z.string().max(20),
  code: z.string().max(60),
  params: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
  sourceId: z.string().max(60).optional(),
});

/** A candidate as the engine judged it when the plan was made (§17.3 snapshot). */
export const PlanItem = z.object({
  ...versioned,
  gardenId: Id,
  planId: Id,
  zoneId: Id.nullable(),
  taxonId: z.string().max(80),
  status: z.enum(PLAN_ITEM_STATUSES),
  chosen: z.boolean(),
  score: z.number().min(0).max(100).nullable(),
  findings: z.array(PlanFinding).max(40),
  flags: z.array(z.string().max(40)).max(10),
  specimenId: Id.nullable(),
  source: RecordSource,
});
export type PlanItem = z.infer<typeof PlanItem>;

// ---------------------------------------------------------------- media

export const MEDIA_LINK_ENTITIES = [
  'garden',
  'zone',
  'specimen',
  'careEvent',
  'observation',
  'harvest',
  'healthCase',
] as const;

export const Media = z.object({
  id: Id,
  workspaceId: Id,
  gardenId: Id.nullable(),
  link: z.object({ entity: z.enum(MEDIA_LINK_ENTITIES), id: Id }).nullable(),
  /** `stored`: a processed image on this device. `external`: a link kept from older data. */
  kind: z.enum(['stored', 'external']),
  mime: z.string().max(60).nullable(),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  bytes: z.number().int().nonnegative().nullable(),
  sha256: z
    .string()
    .regex(/^[0-9a-f]{64}$/)
    .nullable(),
  /** True once the image was re-encoded, which drops EXIF and GPS metadata. */
  metadataStripped: z.boolean(),
  externalUrl: z.string().max(2048).nullable(),
  flag: z.enum(['external-unverified', 'broken']).nullable(),
  alt: ShortText,
  createdAt: EpochMs,
  deletedAt: EpochMs.nullable(),
  source: RecordSource,
});
export type Media = z.infer<typeof Media>;

// ---------------------------------------------------------------- soil and health

export const SOIL_METHODS = [
  'home-kit-ph',
  'jar-texture',
  'squeeze',
  'drainage',
  'lab',
  'photo-estimate',
  'other',
] as const;

export const SoilTest = z.object({
  ...versioned,
  gardenId: Id,
  zoneId: Id.nullable(),
  containerId: Id.nullable(),
  method: z.enum(SOIL_METHODS),
  testedOn: LocalDate,
  ph: z.number().min(0).max(14).nullable(),
  /** Grade for the pH value. A photo can never measure pH (S6), so photo estimates are AI_DRAFT. */
  phEvidence: Evidence.nullable(),
  texture: z
    .object({
      sandPct: z.number().min(0).max(100),
      siltPct: z.number().min(0).max(100),
      clayPct: z.number().min(0).max(100),
    })
    .nullable(),
  observations: z.record(z.string(), z.string().max(500)),
  notes: LongText,
  /** AI-written text kept from older versions, always shown as an AI draft. */
  aiText: LongText.nullable(),
  source: RecordSource,
});
export type SoilTest = z.infer<typeof SoilTest>;

/**
 * One step on a case timeline (§6.8). Entries are only ever appended; `payload` is validated per kind
 * by the app (questionnaire, triage, outcome).
 */
export const HealthCaseEntry = z.object({
  id: Id,
  kind: z.enum(['questionnaire', 'triage', 'note', 'photo', 'followup', 'outcome']),
  at: EpochMs,
  evidence: Evidence,
  /** `rules` for the deterministic tree, `ai` for Gemini triage, `user` for people. */
  by: z.enum(['user', 'rules', 'ai']).default('user'),
  mediaIds: z.array(Id).max(8).default([]),
  text: LongText.default(''),
  payload: z.unknown(),
});
export type HealthCaseEntry = z.infer<typeof HealthCaseEntry>;

export const HealthCase = z.object({
  ...versioned,
  gardenId: Id,
  specimenId: Id.nullable(),
  title: ShortText,
  status: z.enum(['open', 'monitoring', 'closed']),
  openedAt: EpochMs,
  closedAt: EpochMs.nullable(),
  /** Kept private and used only for the person's own evaluation (§6.8). */
  outcome: z.enum(['resolved', 'improving', 'worse', 'unknown']).nullable(),
  entries: z.array(HealthCaseEntry),
  /** One-off care schedules created for the +3 and +7 day checks. */
  followUpScheduleIds: z.array(Id).max(3).default([]),
  source: RecordSource,
});
export type HealthCase = z.infer<typeof HealthCase>;

// ---------------------------------------------------------------- drafts

/** Private drafts that will become community content only if the user publishes them later. */
export const Draft = z.object({
  id: Id,
  workspaceId: Id,
  kind: z.enum(['community-pin', 'exchange-listing']),
  payload: z.record(z.string(), z.unknown()),
  createdAt: EpochMs,
  deletedAt: EpochMs.nullable(),
  source: RecordSource,
});
export type Draft = z.infer<typeof Draft>;

/** Read-only snapshot of v3 gamification, shown as "Legacy achievements". Never recomputed. */
export const LegacyAchievements = z.object({
  xp: z.number().nullable(),
  level: z.number().nullable(),
  streakDays: z.number().nullable(),
  joinedOn: z.string().nullable(),
  badges: z.array(z.object({ badgeId: z.string(), tier: z.string(), earnedOn: z.string().nullable() })),
});
export type LegacyAchievements = z.infer<typeof LegacyAchievements>;

// ---------------------------------------------------------------- health cases (§6.8)

export const HEALTH_ONSETS = ['sudden', 'gradual', 'unsure'] as const;
export const HEALTH_SIGNS = [
  'yellow-lower',
  'yellow-new',
  'brown-edges',
  'brown-spots',
  'pale-bleached',
  'wilting',
  'drooping-wet-soil',
  'leaf-drop',
  'holes',
  'sticky-or-webbing',
  'white-powder',
  'stunted',
  'mushy-stem',
] as const;
export type HealthSign = (typeof HEALTH_SIGNS)[number];
export const HEALTH_WHERE = ['old-leaves', 'new-growth', 'whole-plant', 'one-side'] as const;
export const HEALTH_SPREAD = ['one-plant', 'several-plants', 'spreading-fast', 'unsure'] as const;
export const HEALTH_CHANGES = [
  'repotted',
  'watered-more',
  'watered-less',
  'heatwave',
  'cold-night',
  'fed',
  'moved',
  'pests-seen',
] as const;
export type HealthChange = (typeof HEALTH_CHANGES)[number];

export const HealthQuestionnaire = z.object({
  onset: z.enum(HEALTH_ONSETS),
  signs: z.array(z.enum(HEALTH_SIGNS)).max(HEALTH_SIGNS.length),
  where: z.enum(HEALTH_WHERE).nullable(),
  spread: z.enum(HEALTH_SPREAD),
  changes: z.array(z.enum(HEALTH_CHANGES)).max(HEALTH_CHANGES.length),
  /** Finger test at 2 cm, now. */
  soil: z.enum(SOIL_CHECKS).nullable(),
  notes: z.string().max(500),
});
export type HealthQuestionnaire = z.infer<typeof HealthQuestionnaire>;

export const HEALTH_STATUSES = ['open', 'monitoring', 'closed'] as const;
export const HEALTH_OUTCOMES = ['resolved', 'improving', 'worse', 'unknown'] as const;
export type HealthOutcome = (typeof HEALTH_OUTCOMES)[number];
export const CASE_ENTRY_KINDS = ['questionnaire', 'triage', 'note', 'photo', 'followup', 'outcome'] as const;
export type CaseEntryKind = (typeof CASE_ENTRY_KINDS)[number];

// ---------------------------------------------------------------- species drafts (§18.5 F3)

export const DRAFT_REVIEW = ['AI_DRAFT', 'accepted', 'rejected'] as const;

/**
 * A species that is not in the catalogue yet, drafted with cited sources and kept on this device for
 * review. Toxicity and edibility traits are never accepted from AI (S10) and never drive decisions.
 */
export const SpeciesDraftRecord = z.object({
  ...versioned,
  scientificName: ShortText.min(3),
  gbifKey: z.number().int().positive().nullable(),
  family: ShortText.nullable(),
  commonName: ShortText.nullable(),
  traits: z
    .array(
      z.object({
        trait: z.string().max(40),
        value: z.union([z.number(), z.string().max(200), z.array(z.number().int()).max(12)]),
        unit: z.string().max(20).nullable(),
        appliesTo: z.string().max(120).nullable(),
        citations: z.array(z.object({ url: z.string().url(), title: z.string().max(200) })).max(4),
        review: z.enum(DRAFT_REVIEW),
      }),
    )
    .max(20),
  cannotDetermine: z.array(z.string().max(120)).max(12),
  model: z.string().max(80).nullable(),
  promptVersion: z.number().int().nullable(),
});
export type SpeciesDraftRecord = z.infer<typeof SpeciesDraftRecord>;

// ---------------------------------------------------------------- nature log (§6.10)

export const NATURE_PROTOCOLS = ['fit-count', 'bird-count', 'sighting', 'phenology'] as const;
export type NatureProtocol = (typeof NATURE_PROTOCOLS)[number];

/** Insect groups of the UK Pollinator Monitoring Scheme FIT Count, in its order. */
export const FIT_GROUPS = [
  'bumblebees',
  'honeybees',
  'solitary-bees',
  'wasps',
  'hoverflies',
  'other-flies',
  'butterflies-moths',
  'beetles',
  'small-insects',
  'other-insects',
] as const;
export type FitGroup = (typeof FIT_GROUPS)[number];

/**
 * Four states, never collapsed (S2): `NO` means "looked and it was not there"; `NOT_CHECKED` means
 * nobody looked. `UNCERTAIN` keeps doubtful identifications out of totals without losing them.
 */
export const CHECK_STATES = ['YES', 'NO', 'UNCERTAIN', 'NOT_CHECKED'] as const;
export type CheckState = (typeof CHECK_STATES)[number];

export const PHENOPHASES = ['bud', 'flower', 'fruit', 'leaf-out'] as const;
export type Phenophase = (typeof PHENOPHASES)[number];

export const BEHAVIOURS = ['visiting-flower', 'larva', 'nesting', 'feeding', 'resting', 'other'] as const;
export const SIGHTING_GROUPS = [
  'bee',
  'butterfly-moth',
  'hoverfly',
  'other-insect',
  'bird',
  'spider',
  'reptile-amphibian',
  'mammal',
  'other',
] as const;
export const SKY_STATES = ['sunny', 'partly-cloudy', 'overcast'] as const;
export const WIND_STATES = ['calm', 'light', 'moderate', 'strong'] as const;

export const VisitRecord = z.object({
  /** A FIT group, a sighting group, `bird` for bird counts, or a phenophase key for phenology. */
  group: z.string().min(1).max(40),
  taxonName: ShortText.nullable(),
  /** Individuals counted. `null` when the protocol records a state instead of a count. */
  count: z.number().int().nonnegative().nullable(),
  state: z.enum(CHECK_STATES),
  identityConfidence: z.enum(['confident', 'unsure']).nullable(),
  behaviour: z.enum(BEHAVIOURS).nullable(),
});
export type VisitRecord = z.infer<typeof VisitRecord>;

export const VisitWeather = z.object({
  temperatureC: z.number().finite().min(-50).max(60).nullable(),
  sky: z.enum(SKY_STATES).nullable(),
  wind: z.enum(WIND_STATES).nullable(),
  /** `MEASURED` when the person entered it, `MODELLED` when filled from the forecast. */
  evidence: Evidence,
});
export type VisitWeather = z.infer<typeof VisitWeather>;

/** One nature visit: a timed count, a sighting or a phenology check. Never edited, only voided. */
export const NatureVisit = z.object({
  ...appendOnly,
  protocol: z.enum(NATURE_PROTOCOLS),
  startedAt: EpochMs,
  occurredOn: LocalDate,
  /** Planned protocol length (600 s for FIT, 300 s for birds), or 0 for sightings and checks. */
  plannedS: z.number().int().nonnegative().max(7200),
  /** Time actually spent counting. A count stopped early is kept but never compared with full ones. */
  durationS: z.number().int().nonnegative().max(7200),
  zoneId: Id.nullable(),
  specimenId: Id.nullable(),
  /** Target flower for FIT counts: a catalogue taxon, a plant in the garden, or a typed name. */
  targetTaxonId: z.string().max(80).nullable(),
  targetName: ShortText,
  /** Flowers (or flower heads) of the target in the 50 × 50 cm patch. */
  patchFlowerCount: z.number().int().nonnegative().max(10_000).nullable(),
  weather: VisitWeather.nullable(),
  observerCount: z.number().int().min(1).max(50),
  records: z.array(VisitRecord).max(200),
  notes: LongText,
  mediaIds: z.array(Id).max(20),
});
export type NatureVisit = z.infer<typeof NatureVisit>;

// ---------------------------------------------------------------- pantry (§6.13)

export const PANTRY_STATES = ['fresh', 'stored', 'preserved', 'given', 'composted', 'wasted'] as const;
export type PantryState = (typeof PANTRY_STATES)[number];

/** Produce on hand, from a harvest or added by hand. Quantities stay per dimension (S1). */
export const PantryItem = z.object({
  ...versioned,
  gardenId: Id,
  harvestId: Id.nullable(),
  specimenId: Id.nullable(),
  name: ShortText.min(1),
  state: z.enum(PANTRY_STATES),
  massG: OptionalAmount,
  count: z.number().int().nonnegative().nullable(),
  countLabel: z.string().trim().max(40).nullable(),
  /** Set by the person; PlantPal never guesses food safety (S16). */
  bestBefore: LocalDate.nullable(),
  notes: LongText,
  history: z.array(z.object({ state: z.enum(PANTRY_STATES), at: EpochMs })).max(50),
});
export type PantryItem = z.infer<typeof PantryItem>;
