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

export const Garden = z.object({
  ...versioned,
  name: ShortText.min(1),
  timezone: z.string().min(1).max(64),
  hemisphere: z.enum(HEMISPHERES).nullable(),
  place: Place.nullable(),
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

export const HealthCaseEntry = z.object({
  id: Id,
  kind: z.enum(['questionnaire', 'triage', 'note', 'photo', 'followup']),
  at: EpochMs,
  evidence: Evidence,
  payload: z.unknown(),
});

export const HealthCase = z.object({
  ...versioned,
  gardenId: Id,
  specimenId: Id.nullable(),
  title: ShortText,
  status: z.enum(['open', 'monitoring', 'closed']),
  openedAt: EpochMs,
  closedAt: EpochMs.nullable(),
  outcome: z.enum(['recovered', 'managed', 'lost', 'unknown']).nullable(),
  entries: z.array(HealthCaseEntry),
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
