import {
  CareEvent as CareEventSchema,
  Draft as DraftSchema,
  Garden as GardenSchema,
  Harvest as HarvestSchema,
  HealthCase as HealthCaseSchema,
  LegacyAchievements as LegacyAchievementsSchema,
  Media as MediaSchema,
  Observation as ObservationSchema,
  SoilTest as SoilTestSchema,
  Specimen as SpecimenSchema,
  Zone as ZoneSchema,
  type CareEvent,
  type CareKind,
  type Draft,
  type Garden,
  type Harvest,
  type HealthCase,
  type LegacyAchievements,
  type Measurements,
  type Media,
  type Milestone,
  type Observation,
  type RecordSource,
  type SoilTest,
  type Specimen,
  type Zone,
  type ZoneKind,
} from '@plantpal/schemas';
import type { z } from 'zod';
import { deterministicId } from '../ids';
import { isValidTimeZone, localDateOf, parseLooseDate } from '../dates';
import { classifyUnit, convert, qty } from '../quantity';
import { compassToDegrees, type Compass8 } from '../geometry';

/** localStorage keys written by the earlier PlantPal app. */
export const LEGACY_KEYS = {
  plants: 'plantpal-garden-plants',
  journal: 'plantpal-garden-journal',
  profile: 'plantpal-garden-profile',
  scans: 'plantpal-scan-history',
  soil: 'plantpal-soil-profiles',
  zones: 'plantpal-microclimate-zones',
  harvests: 'plantpal-harvests',
  gardens: 'plantpal-multi-gardens',
  pins: 'plantpal-community-map',
  listings: 'plantpal-swap-listings',
  envProfile: 'plantpal-env-profile',
  theme: 'plantpal-theme',
  apiKey: 'plantpal-user-gemini-api-key',
} as const;

/** Keys that are never read into the plan, exported or backed up. */
export const NEVER_EXPORT_KEYS: readonly string[] = [LEGACY_KEYS.apiKey];

export const LEGACY_CATEGORIES = [
  'gardens',
  'zones',
  'plants',
  'journal',
  'harvests',
  'soil',
  'scans',
  'pins',
  'listings',
  'achievements',
] as const;
export type LegacyCategory = (typeof LEGACY_CATEGORIES)[number];

export type ProblemCode =
  | 'unreadable'
  | 'not-a-list'
  | 'invalid-item'
  | 'duplicate'
  | 'orphan-entry'
  | 'multi-garden'
  | 'invalid-date'
  | 'invalid-quantity'
  | 'unsupported-unit'
  | 'external-photo'
  | 'broken-photo'
  | 'ai-estimate'
  | 'ambiguous-plant'
  | 'unknown-type'
  | 'empty-name'
  | 'plaintext-key'
  | 'cache-skipped'
  | 'unknown-key';

export interface LegacyProblem {
  severity: 'info' | 'warning' | 'error';
  code: ProblemCode;
  key: string;
  legacyId: string | null;
  detail: string;
}

export interface LegacyRecords {
  gardens: Garden[];
  zones: Zone[];
  specimens: Specimen[];
  careEvents: CareEvent[];
  observations: Observation[];
  harvests: Harvest[];
  media: Media[];
  soilTests: SoilTest[];
  healthCases: HealthCase[];
  drafts: Draft[];
}

export interface LegacyMigrationPlan {
  detected: boolean;
  keys: string[];
  counts: Record<LegacyCategory, { found: number; migrated: number; skipped: number }>;
  problems: LegacyProblem[];
  hasPlaintextKey: boolean;
  records: LegacyRecords;
  /** Photos stored inline by the earlier app (data: URLs) that the app decodes, re-encodes and stores. */
  mediaToDecode: Array<{ mediaId: string; dataUrl: string }>;
  achievements: LegacyAchievements | null;
  theme: 'light' | 'dark' | null;
}

export interface LegacyPlanContext {
  workspaceId: string;
  /** Device time zone, used when the old data has none. */
  timeZone: string;
  now: number;
}

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim().length > 0 ? v.trim() : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

function pick(o: Obj, known: readonly string[]): Obj | undefined {
  const extra: Obj = {};
  for (const [k, v] of Object.entries(o)) if (!known.includes(k)) extra[k] = v;
  return Object.keys(extra).length > 0 ? extra : undefined;
}

const ZONE_KIND_BY_GARDEN_TYPE: Record<string, ZoneKind> = {
  outdoor: 'yard',
  balcony: 'balcony',
  rooftop: 'rooftop',
  indoor: 'indoor',
  community: 'community-plot',
};

const DIRECTION: Record<string, Compass8> = {
  north: 'N',
  northeast: 'NE',
  east: 'E',
  southeast: 'SE',
  south: 'S',
  southwest: 'SW',
  west: 'W',
  northwest: 'NW',
};

const CARE_BY_TYPE: Record<string, CareKind> = {
  watering: 'water',
  feeding: 'feed',
  pruned: 'prune',
  repotted: 'repot',
};

const MILESTONE_BY_TYPE: Record<string, Milestone> = {
  planted: 'planted',
  sprouted: 'sprouted',
  'first-flower': 'first-flower',
  'first-harvest': 'first-harvest',
};

const SOIL_METHOD: Record<string, SoilTest['method']> = {
  'photo-ai': 'photo-estimate',
  'diy-jar': 'jar-texture',
  'diy-squeeze': 'squeeze',
  'diy-ph': 'home-kit-ph',
  'diy-drainage': 'drainage',
  professional: 'lab',
};

/**
 * Builds a migration plan from the earlier app's raw localStorage values. Pure and deterministic: the same input
 * always yields the same record ids, so applying a plan twice (or resuming an interrupted run)
 * never duplicates anything.
 */
export function planLegacyMigration(
  raw: Readonly<Record<string, string | null | undefined>>,
  ctx: LegacyPlanContext,
): LegacyMigrationPlan {
  const problems: LegacyProblem[] = [];
  const problem = (
    severity: LegacyProblem['severity'],
    code: ProblemCode,
    key: string,
    legacyId: string | null,
    detail: string,
  ) => problems.push({ severity, code, key, legacyId, detail });

  const keys = Object.keys(raw)
    .filter((k) => k.startsWith('plantpal-') && typeof raw[k] === 'string')
    .sort();
  const known = new Set<string>(Object.values(LEGACY_KEYS));
  for (const k of keys) {
    if (!known.has(k)) {
      problem('info', 'unknown-key', k, null, 'Kept in the backup file; PlantPal does not use it.');
    }
  }

  const counts = Object.fromEntries(
    LEGACY_CATEGORIES.map((c) => [c, { found: 0, migrated: 0, skipped: 0 }]),
  ) as LegacyMigrationPlan['counts'];

  const records: LegacyRecords = {
    gardens: [],
    zones: [],
    specimens: [],
    careEvents: [],
    observations: [],
    harvests: [],
    media: [],
    soilTests: [],
    healthCases: [],
    drafts: [],
  };
  const mediaToDecode: LegacyMigrationPlan['mediaToDecode'] = [];

  const readJson = (key: string): unknown => {
    const v = raw[key];
    if (typeof v !== 'string') return undefined;
    try {
      return JSON.parse(v) as unknown;
    } catch {
      problem(
        'error',
        'unreadable',
        key,
        null,
        'This saved data is damaged and cannot be read. It is kept in the backup file.',
      );
      return undefined;
    }
  };

  const readList = (key: string, category: LegacyCategory | null): Obj[] => {
    const v = readJson(key);
    if (v === undefined || v === null) return [];
    if (!Array.isArray(v)) {
      problem('error', 'not-a-list', key, null, 'Expected a list of records. It is kept in the backup file.');
      return [];
    }
    const out: Obj[] = [];
    v.forEach((item, i) => {
      if (category) counts[category].found++;
      if (isObj(item)) out.push(item);
      else
        problem(
          'warning',
          'invalid-item',
          key,
          String(i),
          'An entry that is not a record was skipped (kept in the backup).',
        );
    });
    return out;
  };

  /** De-duplicates by `id`, keeping the first occurrence. */
  const dedupe = (key: string, items: Obj[], idOf: (o: Obj, i: number) => string): Array<[Obj, string]> => {
    const seen = new Set<string>();
    const out: Array<[Obj, string]> = [];
    items.forEach((o, i) => {
      const id = idOf(o, i);
      if (seen.has(id)) {
        problem('warning', 'duplicate', key, id, 'A duplicate copy of this record was skipped.');
        return;
      }
      seen.add(id);
      out.push([o, id]);
    });
    return out;
  };

  const src = (key: string, legacyId: string | null, extra?: Obj): RecordSource => ({
    kind: 'legacy-v3',
    key,
    legacyId,
    ...(extra ? { extra } : {}),
  });

  const accept = <S extends z.ZodType>(
    schema: S,
    value: z.input<S>,
    key: string,
    legacyId: string | null,
  ): z.output<S> | null => {
    const r = schema.safeParse(value);
    if (r.success) return r.data;
    const issue = r.error.issues[0];
    problem(
      'error',
      'invalid-item',
      key,
      legacyId,
      `Could not convert this record (${issue ? `${issue.path.join('.')}: ${issue.message}` : 'invalid'}). It is kept in the backup file.`,
    );
    return null;
  };

  const { workspaceId, now } = ctx;
  const base = { workspaceId, createdAt: now, updatedAt: now, version: 1, deletedAt: null };

  // ---------------------------------------------------------------- environment cache → place

  const env = readJson(LEGACY_KEYS.envProfile);
  let envPlace: Garden['place'] = null;
  let timeZone = isValidTimeZone(ctx.timeZone) ? ctx.timeZone : 'UTC';
  if (isObj(env)) {
    const lat = num(env.latitude);
    const lon = num(env.longitude);
    if (lat !== null && lon !== null && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
      envPlace = { label: str(env.locationName) ? clip(str(env.locationName) ?? '', 200) : null, lat, lon };
    }
    const tz = str(env.timezone);
    if (tz && isValidTimeZone(tz)) timeZone = tz;
    problem(
      'info',
      'cache-skipped',
      LEGACY_KEYS.envProfile,
      null,
      'Saved weather and soil readings are old and will be fetched fresh. Your location was kept.',
    );
  }
  const hemisphereOf = (lat: number | null | undefined): Garden['hemisphere'] =>
    lat === null || lat === undefined ? null : lat < 0 ? 'south' : 'north';

  const dateOf = (v: unknown) => parseLooseDate(v, timeZone);

  // ---------------------------------------------------------------- plants (read first for linking)

  const legacyPlants = dedupe(
    LEGACY_KEYS.plants,
    readList(LEGACY_KEYS.plants, 'plants'),
    (o, i) => str(o.id) ?? `#${i}`,
  );
  const legacyGardens = dedupe(
    LEGACY_KEYS.gardens,
    readList(LEGACY_KEYS.gardens, 'gardens'),
    (o, i) => str(o.id) ?? `#${i}`,
  );
  const journal = dedupe(
    LEGACY_KEYS.journal,
    readList(LEGACY_KEYS.journal, 'journal'),
    (o, i) => str(o.id) ?? `#${i}`,
  );
  const zonesRaw = dedupe(
    LEGACY_KEYS.zones,
    readList(LEGACY_KEYS.zones, 'zones'),
    (o, i) => str(o.id) ?? `#${i}`,
  );
  const harvestsRaw = dedupe(
    LEGACY_KEYS.harvests,
    readList(LEGACY_KEYS.harvests, 'harvests'),
    (o, i) => str(o.id) ?? `#${i}`,
  );
  const soilRaw = dedupe(
    LEGACY_KEYS.soil,
    readList(LEGACY_KEYS.soil, 'soil'),
    (o, i) => str(o.id) ?? `#${i}`,
  );
  const scansRaw = dedupe(
    LEGACY_KEYS.scans,
    readList(LEGACY_KEYS.scans, 'scans'),
    (o, i) => `${str(o.analyzedAt) ?? `#${i}`}|${str(o.summary)?.slice(0, 40) ?? ''}`,
  );
  const pinsRaw = dedupe(
    LEGACY_KEYS.pins,
    readList(LEGACY_KEYS.pins, 'pins'),
    (o, i) => str(o.id) ?? `#${i}`,
  );
  const listingsRaw = dedupe(
    LEGACY_KEYS.listings,
    readList(LEGACY_KEYS.listings, 'listings'),
    (o, i) => str(o.id) ?? `#${i}`,
  );

  const hasAnyData =
    legacyPlants.length +
      legacyGardens.length +
      journal.length +
      zonesRaw.length +
      harvestsRaw.length +
      soilRaw.length +
      scansRaw.length +
      pinsRaw.length +
      listingsRaw.length >
      0 || typeof raw[LEGACY_KEYS.profile] === 'string';

  // Earliest known date anchors ids that have no date of their own (keeps ids deterministic).
  const anchorTime = (() => {
    let t = Number.POSITIVE_INFINITY;
    for (const [p] of legacyPlants) {
      const d = dateOf(p.dateAdded);
      if (d) t = Math.min(t, d.epochMs);
    }
    for (const [g] of legacyGardens) {
      const d = dateOf(g.createdAt);
      if (d) t = Math.min(t, d.epochMs);
    }
    return Number.isFinite(t) ? t : 0;
  })();

  // ---------------------------------------------------------------- gardens

  const plantGarden = new Map<string, { gardenId: string; zoneId: string }>();
  for (const [g, legacyId] of legacyGardens) {
    const created = dateOf(g.createdAt);
    const gardenId = deterministicId(created?.epochMs ?? anchorTime, `garden|${legacyId}`);
    const lat = num(g.latitude);
    const lon = num(g.longitude);
    const place =
      lat !== null && lon !== null && Math.abs(lat) <= 90 && Math.abs(lon) <= 180
        ? { label: str(g.location) ? clip(str(g.location) ?? '', 200) : null, lat, lon }
        : str(g.location)
          ? { label: clip(str(g.location) ?? '', 200), lat: null, lon: null }
          : envPlace;
    const garden = accept(
      GardenSchema,
      {
        ...base,
        id: gardenId,
        createdAt: created?.epochMs ?? now,
        name: clip(str(g.name) ?? 'Garden', 200),
        timezone: timeZone,
        hemisphere: hemisphereOf(place?.lat ?? envPlace?.lat),
        place,
        notes: typeof g.notes === 'string' ? g.notes : '',
        source: src(
          LEGACY_KEYS.gardens,
          legacyId,
          pick(g, ['id', 'name', 'location', 'latitude', 'longitude', 'createdAt', 'notes']),
        ),
      },
      LEGACY_KEYS.gardens,
      legacyId,
    );
    if (!garden) continue;
    records.gardens.push(garden);
    counts.gardens.migrated++;

    const type = str(g.type) ?? 'outdoor';
    const kind = ZONE_KIND_BY_GARDEN_TYPE[type] ?? 'other';
    const zoneId = deterministicId(garden.createdAt, `garden-zone|${legacyId}`);
    const zone = accept(
      ZoneSchema,
      {
        ...base,
        id: zoneId,
        gardenId,
        name: kind === 'yard' ? 'Yard' : kind.charAt(0).toUpperCase() + kind.slice(1).replace('-', ' '),
        kind,
        covered: kind === 'indoor' ? true : null,
        areaM2: null,
        orientationDeg: null,
        light: null,
        wind: null,
        drainage: null,
        notes: '',
        source: src(LEGACY_KEYS.gardens, legacyId, { type }),
      },
      LEGACY_KEYS.gardens,
      legacyId,
    );
    if (zone) records.zones.push(zone);

    const ids = Array.isArray(g.plantIds) ? g.plantIds.filter((x): x is string => typeof x === 'string') : [];
    for (const pid of ids) {
      if (plantGarden.has(pid)) {
        problem(
          'info',
          'multi-garden',
          LEGACY_KEYS.gardens,
          pid,
          `This plant was listed in more than one garden; it was placed in the first one.`,
        );
        continue;
      }
      plantGarden.set(pid, { gardenId, zoneId: zone ? zoneId : '' });
    }
  }

  const unassignedPlants = legacyPlants.filter(([, id]) => !plantGarden.has(id));
  const needDefault = hasAnyData && (records.gardens.length === 0 || unassignedPlants.length > 0);
  let defaultGardenId: string | null = null;
  if (needDefault) {
    const garden = accept(
      GardenSchema,
      {
        ...base,
        id: deterministicId(anchorTime, 'garden|default'),
        name: 'My garden',
        timezone: timeZone,
        hemisphere: hemisphereOf(envPlace?.lat),
        place: envPlace,
        notes: '',
        source: src('plantpal-garden-plants', null),
      },
      LEGACY_KEYS.plants,
      null,
    );
    if (garden) {
      records.gardens.push(garden);
      defaultGardenId = garden.id;
    }
  }
  const homeGardenId = defaultGardenId ?? records.gardens[0]?.id ?? null;

  // ---------------------------------------------------------------- micro-climate zones

  for (const [zr, legacyId] of zonesRaw) {
    if (!homeGardenId) break;
    const dir = DIRECTION[str(zr.direction) ?? ''];
    const wind = str(zr.wind);
    const drainage = str(zr.drainage);
    const notes = zr.nearStructure === true ? 'Near a wall or structure.' : '';
    const zone = accept(
      ZoneSchema,
      {
        ...base,
        id: deterministicId(anchorTime, `zone|${legacyId}`),
        gardenId: homeGardenId,
        name: clip(str(zr.name) ?? 'Zone', 200),
        kind: 'other',
        covered: null,
        areaM2: null,
        orientationDeg: dir ? compassToDegrees(dir) : null,
        light: zr.hasShade === true ? 'part-shade' : null,
        wind: wind === 'sheltered' || wind === 'moderate' || wind === 'exposed' ? wind : null,
        drainage:
          drainage === 'collects' ? 'pools' : drainage === 'normal' || drainage === 'fast' ? drainage : null,
        notes,
        source: src(
          LEGACY_KEYS.zones,
          legacyId,
          pick(zr, ['id', 'name', 'direction', 'wind', 'drainage', 'nearStructure', 'hasShade']),
        ),
      },
      LEGACY_KEYS.zones,
      legacyId,
    );
    if (zone) {
      records.zones.push(zone);
      counts.zones.migrated++;
    }
  }

  // ---------------------------------------------------------------- specimens

  const plantedOnByPlant = new Map<string, string>();
  for (const [e] of journal) {
    if (str(e.type) !== 'planted') continue;
    const pid = str(e.plantId);
    const d = dateOf(e.date);
    if (!pid || !d) continue;
    const prev = plantedOnByPlant.get(pid);
    if (!prev || d.localDate < prev) plantedOnByPlant.set(pid, d.localDate);
  }

  const specimenByLegacy = new Map<string, Specimen>();
  for (const [p, legacyId] of legacyPlants) {
    const placement = plantGarden.get(legacyId);
    const gardenId = placement?.gardenId ?? defaultGardenId;
    if (!gardenId) continue;
    const added = dateOf(p.dateAdded);
    if (p.dateAdded !== undefined && !added)
      problem(
        'info',
        'invalid-date',
        LEGACY_KEYS.plants,
        legacyId,
        'The date this plant was added could not be read.',
      );
    const name = str(p.commonName);
    if (!name)
      problem(
        'warning',
        'empty-name',
        LEGACY_KEYS.plants,
        legacyId,
        'A plant had no name; it was called "Unnamed plant".',
      );
    const sci = str(p.scientificName);
    const sciWords = sci ? sci.split(/\s+/).length : 0;
    const status = str(p.status);
    const location = str(p.location);
    const specimen = accept(
      SpecimenSchema,
      {
        ...base,
        id: deterministicId(added?.epochMs ?? anchorTime, `plant|${legacyId}`),
        createdAt: added?.epochMs ?? now,
        gardenId,
        zoneId: placement?.zoneId || null,
        containerId: null,
        displayName: clip(name ?? 'Unnamed plant', 120),
        scientificName: sci ? clip(sci, 200) : null,
        cultivar: null,
        taxonKey: null,
        identityLevel: sciWords >= 2 ? 'species' : sciWords === 1 ? 'genus' : 'unknown',
        origin: 'unknown',
        parentSpecimenId: null,
        plantedOn: plantedOnByPlant.get(legacyId) ?? null,
        status: status === 'dormant' ? 'dormant' : status === 'removed' ? 'archived' : 'active',
        statusReason: status === 'removed' ? 'Removed in the earlier PlantPal app' : null,
        holding: false,
        coverMediaId: null,
        notes: location ? `Location: ${location}` : '',
        source: src(
          LEGACY_KEYS.plants,
          legacyId,
          pick(p, ['id', 'commonName', 'scientificName', 'dateAdded', 'status', 'location']),
        ),
      },
      LEGACY_KEYS.plants,
      legacyId,
    );
    if (!specimen) continue;
    records.specimens.push(specimen);
    specimenByLegacy.set(legacyId, specimen);
    counts.plants.migrated++;
  }

  let holding: Specimen | null = null;
  const holdingSpecimen = (): Specimen | null => {
    if (holding || !homeGardenId) return holding;
    holding = accept(
      SpecimenSchema,
      {
        ...base,
        id: deterministicId(anchorTime, 'plant|unlinked-notes'),
        gardenId: homeGardenId,
        zoneId: null,
        containerId: null,
        displayName: 'Unlinked notes',
        scientificName: null,
        cultivar: null,
        taxonKey: null,
        identityLevel: 'unknown',
        origin: 'unknown',
        parentSpecimenId: null,
        plantedOn: null,
        status: 'archived',
        statusReason: 'Holds journal entries whose plant no longer exists',
        holding: true,
        coverMediaId: null,
        notes: '',
        source: src(LEGACY_KEYS.journal, null),
      },
      LEGACY_KEYS.journal,
      null,
    );
    if (holding) records.specimens.push(holding);
    return holding;
  };

  /** Case-insensitive exact name match among real specimens; ambiguous names stay unlinked. */
  const byName = (key: string, legacyId: string, name: string | null): Specimen | null => {
    if (!name) return null;
    const n = name.toLowerCase();
    const hits = records.specimens.filter((s) => !s.holding && s.displayName.toLowerCase() === n);
    if (hits.length > 1)
      problem(
        'info',
        'ambiguous-plant',
        key,
        legacyId,
        `More than one plant is called "${name}", so this was not linked to one of them.`,
      );
    return hits.length === 1 ? (hits[0] ?? null) : null;
  };

  // ---------------------------------------------------------------- media helper

  const mediaFor = (
    key: string,
    legacyId: string,
    url: unknown,
    gardenId: string,
    link: Media['link'],
    createdAt: number,
  ): string | null => {
    const u = typeof url === 'string' ? url.trim() : '';
    if (!u) return null;
    const id = deterministicId(createdAt, `media|${key}|${legacyId}`);
    const dataUrl = /^data:(image\/(?:png|jpe?g|webp|gif|avif));base64,/i.exec(u);
    let media: z.input<typeof MediaSchema>;
    const common = {
      id,
      workspaceId,
      gardenId,
      link,
      width: null,
      height: null,
      bytes: null,
      sha256: null,
      metadataStripped: false,
      alt: '',
      createdAt,
      deletedAt: null,
    };
    if (dataUrl) {
      media = {
        ...common,
        kind: 'stored',
        mime: (dataUrl[1] ?? '').toLowerCase(),
        externalUrl: null,
        flag: null,
        source: src(key, legacyId),
      };
      mediaToDecode.push({ mediaId: id, dataUrl: u });
    } else if (/^https?:\/\/\S+$/i.test(u) && u.length <= 2048) {
      media = {
        ...common,
        kind: 'external',
        mime: null,
        externalUrl: u,
        flag: 'external-unverified',
        source: src(key, legacyId),
      };
      problem(
        'info',
        'external-photo',
        key,
        legacyId,
        'A photo stored as a web link was kept as a link; it may no longer load.',
      );
    } else {
      media = {
        ...common,
        kind: 'external',
        mime: null,
        externalUrl: null,
        flag: 'broken',
        source: src(key, legacyId, { photoUrl: clip(u, 500) }),
      };
      problem(
        'warning',
        'broken-photo',
        key,
        legacyId,
        'A photo could not be recovered (its saved link is not usable). The note itself was kept.',
      );
    }
    const m = accept(MediaSchema, media, key, legacyId);
    if (!m) return null;
    records.media.push(m);
    return m.id;
  };

  // ---------------------------------------------------------------- journal

  for (const [e, legacyId] of journal) {
    const key = LEGACY_KEYS.journal;
    const pid = str(e.plantId);
    let specimen = pid ? specimenByLegacy.get(pid) : undefined;
    if (!specimen) {
      specimen = holdingSpecimen() ?? undefined;
      if (!specimen) continue;
      problem(
        'warning',
        'orphan-entry',
        key,
        legacyId,
        'This entry belonged to a plant that no longer exists; it was kept under "Unlinked notes".',
      );
    }
    const d = dateOf(e.date);
    if (!d)
      problem(
        'warning',
        'invalid-date',
        key,
        legacyId,
        'This entry had no readable date; it is marked "date unknown".',
      );
    const occurredAt = d?.epochMs ?? specimen.createdAt;
    const when = {
      occurredAt,
      occurredOn: d?.localDate ?? localDateOf(occurredAt, timeZone),
      dateUncertain: !d,
    };
    const type = str(e.type) ?? 'observation';
    const title = typeof e.title === 'string' ? clip(e.title.trim(), 200) : '';
    const notes = typeof e.notes === 'string' ? e.notes : '';
    const id = deterministicId(occurredAt, `journal|${legacyId}`);
    const opId = deterministicId(occurredAt, `journal-op|${legacyId}`);
    const care = CARE_BY_TYPE[type];
    const entity: 'careEvent' | 'observation' = care ? 'careEvent' : 'observation';
    const mediaId = mediaFor(key, legacyId, e.photoUrl, specimen.gardenId, { entity, id }, occurredAt);
    const mediaIds = mediaId ? [mediaId] : [];
    const known = ['id', 'plantId', 'date', 'type', 'title', 'notes', 'photoUrl'];

    if (care) {
      let amountMl: number | null = null;
      if (care === 'water' && e.waterAmountLiters !== undefined && e.waterAmountLiters !== null) {
        const l = num(e.waterAmountLiters);
        if (l !== null && l >= 0 && l <= 10_000)
          amountMl = Math.round(convert(qty('volume', l, 'l'), 'ml').value);
        else
          problem(
            'warning',
            'invalid-quantity',
            key,
            legacyId,
            'A watering amount could not be read; it is shown as "amount not recorded".',
          );
      }
      const ev = accept(
        CareEventSchema,
        {
          id,
          opId,
          workspaceId,
          gardenId: specimen.gardenId,
          specimenId: specimen.id,
          kind: care,
          amountMl,
          waterSource: null,
          occurrenceKey: null,
          notes: [title, notes].filter((s) => s.length > 0).join('\n'),
          mediaIds,
          createdAt: now,
          deletedAt: null,
          ...when,
          source: src(
            key,
            legacyId,
            pick(e, [...known, ...(amountMl !== null ? ['waterAmountLiters'] : [])]),
          ),
        },
        key,
        legacyId,
      );
      if (ev) {
        records.careEvents.push(ev);
        counts.journal.migrated++;
      }
      continue;
    }

    const milestone = MILESTONE_BY_TYPE[type] ?? null;
    const kind: Observation['kind'] =
      milestone !== null
        ? 'milestone'
        : type === 'measurement'
          ? 'measurement'
          : type === 'pest-issue'
            ? 'pest'
            : 'note';
    if (!milestone && !['measurement', 'pest-issue', 'observation'].includes(type)) {
      problem(
        'info',
        'unknown-type',
        key,
        legacyId,
        `Unknown entry type "${clip(type, 40)}" was kept as a note.`,
      );
    }
    const values: Measurements = {};
    if (isObj(e.measurements)) {
      const m = e.measurements;
      const dec = (k: 'heightCm' | 'spreadCm') => {
        const v = num(m[k]);
        if (v !== null && v >= 0) values[k] = v;
        else if (m[k] !== undefined && m[k] !== null)
          problem(
            'info',
            'invalid-quantity',
            key,
            legacyId,
            `A measurement (${k}) could not be read and was left out.`,
          );
      };
      const int = (k: 'leafCount' | 'flowerCount' | 'fruitCount') => {
        const v = num(m[k]);
        if (v !== null && v >= 0 && Number.isInteger(v)) values[k] = v;
        else if (m[k] !== undefined && m[k] !== null)
          problem(
            'info',
            'invalid-quantity',
            key,
            legacyId,
            `A count (${k}) could not be read and was left out.`,
          );
      };
      dec('heightCm');
      dec('spreadCm');
      int('leafCount');
      int('flowerCount');
      int('fruitCount');
    }
    let weather: Observation['weather'] = null;
    if (isObj(e.weatherSnapshot)) {
      const w = e.weatherSnapshot;
      const h = num(w.humidity);
      weather = {
        temperatureC: num(w.temperature),
        humidityPct: h !== null && h >= 0 && h <= 100 ? h : null,
        description: str(w.description) ? clip(str(w.description) ?? '', 200) : null,
        evidence: 'UNKNOWN',
      };
    }
    const ob = accept(
      ObservationSchema,
      {
        id,
        opId,
        workspaceId,
        gardenId: specimen.gardenId,
        specimenId: specimen.id,
        kind,
        milestone,
        title,
        notes,
        values,
        weather,
        mediaIds,
        createdAt: now,
        deletedAt: null,
        ...when,
        source: src(key, legacyId, pick(e, [...known, 'measurements', 'weatherSnapshot'])),
      },
      key,
      legacyId,
    );
    if (ob) {
      records.observations.push(ob);
      counts.journal.migrated++;
    }
  }

  // ---------------------------------------------------------------- harvests

  for (const [h, legacyId] of harvestsRaw) {
    const key = LEGACY_KEYS.harvests;
    if (!homeGardenId) break;
    const plantName = clip(str(h.plantName) ?? 'Unnamed plant', 200);
    const specimen = byName(key, legacyId, str(h.plantName));
    const d = dateOf(h.harvestedAt);
    if (!d)
      problem(
        'warning',
        'invalid-date',
        key,
        legacyId,
        'This harvest had no readable date; it is marked "date unknown".',
      );
    const at = d?.epochMs ?? anchorTime;
    const quantity = num(h.quantity);
    const unitText = typeof h.unit === 'string' ? h.unit.trim().slice(0, 40) : '';
    let massG: number | null = null;
    let count: number | null = null;
    let countLabel: string | null = null;
    if (quantity === null || quantity < 0) {
      problem(
        'warning',
        'invalid-quantity',
        key,
        legacyId,
        'The harvest amount could not be read; it is shown as "amount not recorded".',
      );
    } else {
      const unit = classifyUnit(unitText);
      if (unit.dim === 'mass')
        massG = Math.round(convert(qty('mass', quantity, unit.unit), 'g').value * 100) / 100;
      else if (unit.dim === 'volume')
        problem(
          'info',
          'unsupported-unit',
          key,
          legacyId,
          `Kept as recorded (${quantity} ${unitText}); volumes are not converted to weight.`,
        );
      else if (Number.isInteger(quantity)) {
        count = quantity;
        countLabel = unit.label || null;
      } else
        problem(
          'info',
          'unsupported-unit',
          key,
          legacyId,
          `Kept as recorded (${quantity} ${unitText}); counts must be whole numbers.`,
        );
    }
    const hv = accept(
      HarvestSchema,
      {
        id: deterministicId(at, `harvest|${legacyId}`),
        opId: deterministicId(at, `harvest-op|${legacyId}`),
        workspaceId,
        gardenId: specimen?.gardenId ?? homeGardenId,
        specimenId: specimen?.id ?? null,
        plantName,
        harvestedOn: d?.localDate ?? localDateOf(at || now, timeZone),
        dateUncertain: !d,
        massG,
        count,
        countLabel,
        original: { quantity, unit: unitText },
        quality: null,
        destination: null,
        notes: typeof h.notes === 'string' ? h.notes : '',
        createdAt: now,
        deletedAt: null,
        source: src(key, legacyId, pick(h, ['id', 'plantName', 'harvestedAt', 'quantity', 'unit', 'notes'])),
      },
      key,
      legacyId,
    );
    if (hv) {
      records.harvests.push(hv);
      counts.harvests.migrated++;
    }
  }

  // ---------------------------------------------------------------- soil

  for (const [s, legacyId] of soilRaw) {
    const key = LEGACY_KEYS.soil;
    if (!homeGardenId) break;
    const method = SOIL_METHOD[str(s.method) ?? ''] ?? 'other';
    const d = dateOf(s.createdAt);
    const at = d?.epochMs ?? anchorTime;
    const isPhoto = method === 'photo-estimate';
    let ph = num(s.ph);
    if (ph !== null && (ph < 0 || ph > 14)) {
      problem('warning', 'invalid-quantity', key, legacyId, 'A pH value outside 0–14 was left out.');
      ph = null;
    }
    if (isPhoto)
      problem(
        'info',
        'ai-estimate',
        key,
        legacyId,
        'This soil result was estimated by AI from a photo. Photos cannot measure pH or nutrients, so it is labelled as an AI draft.',
      );
    const tex = isObj(s.texture) ? s.texture : null;
    const sand = num(tex?.sand);
    const silt = num(tex?.silt);
    const clay = num(tex?.clay);
    const texture =
      !isPhoto &&
      sand !== null &&
      silt !== null &&
      clay !== null &&
      [sand, silt, clay].every((v) => v >= 0 && v <= 100)
        ? { sandPct: sand, siltPct: silt, clayPct: clay }
        : null;
    const observations: Record<string, string> = {};
    if (!isPhoto) {
      for (const k of ['soilType', 'organicMatter', 'moisture', 'drainage'] as const) {
        const v = str(s[k]);
        if (v) observations[k] = clip(v, 500);
      }
      if (isObj(s.nutrients)) {
        for (const k of ['nitrogen', 'phosphorus', 'potassium'] as const) {
          const v = str(s.nutrients[k]);
          if (v) observations[k] = clip(v, 500);
        }
      }
    }
    const ai = [str(s.aiAnalysis), str(s.improvementPlan)]
      .filter((x): x is string => x !== null)
      .join('\n\n');
    const st = accept(
      SoilTestSchema,
      {
        ...base,
        id: deterministicId(at, `soil|${legacyId}`),
        createdAt: d?.epochMs ?? now,
        gardenId: homeGardenId,
        zoneId: null,
        containerId: null,
        method,
        testedOn: d?.localDate ?? localDateOf(at || now, timeZone),
        ph,
        phEvidence:
          ph === null
            ? null
            : isPhoto
              ? 'AI_DRAFT'
              : method === 'home-kit-ph' || method === 'lab'
                ? 'MEASURED'
                : 'UNKNOWN',
        texture,
        observations,
        notes: typeof s.notes === 'string' ? s.notes : '',
        aiText: ai.length > 0 ? ai : null,
        source: src(
          key,
          legacyId,
          isPhoto
            ? pick(s, ['id', 'createdAt', 'method', 'ph', 'notes', 'aiAnalysis', 'improvementPlan'])
            : pick(s, [
                'id',
                'createdAt',
                'method',
                'ph',
                'texture',
                'soilType',
                'organicMatter',
                'moisture',
                'drainage',
                'nutrients',
                'notes',
                'aiAnalysis',
                'improvementPlan',
              ]),
        ),
      },
      key,
      legacyId,
    );
    if (st) {
      records.soilTests.push(st);
      counts.soil.migrated++;
    }
  }

  // ---------------------------------------------------------------- photo health checks

  for (const [r, legacyId] of scansRaw) {
    const key = LEGACY_KEYS.scans;
    if (!homeGardenId) break;
    const d = dateOf(r.analyzedAt);
    const at = d?.epochMs ?? anchorTime;
    const plantName = str(r.plantName);
    const specimen = byName(key, legacyId, plantName);
    const hc = accept(
      HealthCaseSchema,
      {
        ...base,
        id: deterministicId(at, `scan|${legacyId}`),
        createdAt: d?.epochMs ?? now,
        gardenId: specimen?.gardenId ?? homeGardenId,
        specimenId: specimen?.id ?? null,
        title: clip(`${plantName ?? 'Plant'} — photo check`, 200),
        status: 'closed',
        openedAt: at,
        closedAt: at,
        outcome: 'unknown',
        entries: [
          {
            id: deterministicId(at, `scan-entry|${legacyId}`),
            kind: 'triage',
            at,
            evidence: 'AI_DRAFT',
            payload: r,
          },
        ],
        source: src(key, legacyId),
      },
      key,
      legacyId,
    );
    if (hc) {
      records.healthCases.push(hc);
      counts.scans.migrated++;
    }
  }

  // ---------------------------------------------------------------- community drafts

  const draftFrom = (
    list: Array<[Obj, string]>,
    key: string,
    kind: Draft['kind'],
    category: 'pins' | 'listings',
  ) => {
    for (const [o, legacyId] of list) {
      const d = dateOf(o.timestamp);
      const at = d?.epochMs ?? anchorTime;
      const dr = accept(
        DraftSchema,
        {
          id: deterministicId(at, `${category}|${legacyId}`),
          workspaceId,
          kind,
          payload: o,
          createdAt: d?.epochMs ?? now,
          deletedAt: null,
          source: src(key, legacyId),
        },
        key,
        legacyId,
      );
      if (dr) {
        records.drafts.push(dr);
        counts[category].migrated++;
      }
    }
  };
  draftFrom(pinsRaw, LEGACY_KEYS.pins, 'community-pin', 'pins');
  draftFrom(listingsRaw, LEGACY_KEYS.listings, 'exchange-listing', 'listings');

  // ---------------------------------------------------------------- achievements and theme

  let achievements: LegacyAchievements | null = null;
  const profile = readJson(LEGACY_KEYS.profile);
  if (profile !== undefined) counts.achievements.found = 1;
  if (isObj(profile)) {
    const badges = Array.isArray(profile.earnedBadges)
      ? profile.earnedBadges.filter(isObj).map((b) => ({
          badgeId: clip(str(b.badgeId) ?? 'unknown', 80),
          tier: clip(str(b.tier) ?? 'unknown', 20),
          earnedOn: dateOf(b.earnedDate)?.localDate ?? null,
        }))
      : [];
    achievements = accept(
      LegacyAchievementsSchema,
      {
        xp: num(profile.xp),
        level: num(profile.level),
        streakDays: num(profile.streakDays),
        joinedOn: dateOf(profile.joinedDate)?.localDate ?? null,
        badges,
      },
      LEGACY_KEYS.profile,
      null,
    );
    if (achievements) counts.achievements.migrated = 1;
  } else if (profile !== undefined) {
    problem(
      'warning',
      'invalid-item',
      LEGACY_KEYS.profile,
      null,
      'Your old progress record could not be read. It is kept in the backup file.',
    );
  }

  const themeRaw = raw[LEGACY_KEYS.theme];
  const theme = themeRaw === 'dark' || themeRaw === 'light' ? themeRaw : null;

  const hasPlaintextKey =
    typeof raw[LEGACY_KEYS.apiKey] === 'string' && (raw[LEGACY_KEYS.apiKey] ?? '').length > 0;
  if (hasPlaintextKey) {
    problem(
      'warning',
      'plaintext-key',
      LEGACY_KEYS.apiKey,
      null,
      'An old Gemini API key is saved unprotected in this browser. It is never migrated, exported or backed up. Remove it here and add it again later in Settings › AI, where it is encrypted.',
    );
  }

  for (const c of LEGACY_CATEGORIES) counts[c].skipped = Math.max(0, counts[c].found - counts[c].migrated);

  return {
    detected: hasAnyData,
    keys,
    counts,
    problems,
    hasPlaintextKey,
    records,
    mediaToDecode,
    achievements,
    theme,
  };
}

/**
 * The backup written before migrating: every legacy key except the plaintext API key, as-is.
 */
export function buildLegacyBackup(
  raw: Readonly<Record<string, string | null | undefined>>,
  exportedAt: string,
): { format: 'plantpal-v3-backup'; exportedAt: string; keys: Record<string, string> } {
  const keys: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!k.startsWith('plantpal-') || typeof v !== 'string') continue;
    if (NEVER_EXPORT_KEYS.includes(k)) continue;
    keys[k] = v;
  }
  return { format: 'plantpal-v3-backup', exportedAt, keys };
}

/** Reads a backup file produced by `buildLegacyBackup` back into raw key/value form. */
export function parseLegacyBackup(text: string): Record<string, string> | null {
  try {
    const v = JSON.parse(text) as unknown;
    if (!isObj(v) || v.format !== 'plantpal-v3-backup' || !isObj(v.keys)) return null;
    const out: Record<string, string> = {};
    for (const [k, val] of Object.entries(v.keys)) {
      if (k.startsWith('plantpal-') && typeof val === 'string' && !NEVER_EXPORT_KEYS.includes(k))
        out[k] = val;
    }
    return out;
  } catch {
    return null;
  }
}
