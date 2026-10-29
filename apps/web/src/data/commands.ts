import type { Table } from 'dexie';
import {
  CareEvent as CareEventSchema,
  CareSchedule as CareScheduleSchema,
  Container as ContainerSchema,
  Garden as GardenSchema,
  Harvest as HarvestSchema,
  Media as MediaSchema,
  Observation as ObservationSchema,
  Plan as PlanSchema,
  PlanItem as PlanItemSchema,
  Specimen as SpecimenSchema,
  TaskLog as TaskLogSchema,
  Workspace as WorkspaceSchema,
  Zone as ZoneSchema,
  type CareEvent,
  type CareKind,
  type CareSchedule,
  type Container,
  type Garden,
  type Harvest,
  type Media,
  type Observation,
  type Plan,
  type PlanItem,
  type Specimen,
  type SpecimenStatus,
  type TaskLog,
  type WaterSource,
  type Workspace,
  type Zone,
} from '@plantpal/schemas';
import {
  containerVolumeL,
  deterministicId,
  instantForLocalDate,
  localDateOf,
  newId,
  recalibrate,
  todayIn,
  type ScheduleDraft,
} from '@plantpal/domain';
import { CLIENT_SCHEMA, db, getMeta, setMeta } from './db';
import { RecordNotFoundError, VersionConflictError } from './errors';
import { withQuotaRecovery } from './storage';
import { processImage, type ProcessedImage } from './media';

const META_WORKSPACE = 'activeWorkspaceId';
const META_GARDEN = 'activeGardenId';

// ---------------------------------------------------------------- plumbing

/** Runs a read-write transaction over `tables` plus the outbox, retrying once after a quota error. */
function writeTx<T>(tables: Table[], fn: () => Promise<T>): Promise<T> {
  return withQuotaRecovery(() => db.transaction('rw', [...tables, db.outbox, db.workspaces, db.meta], fn));
}

/** Queues a change for sync. Local-only workspaces never queue anything. */
async function enqueue(
  workspaceId: string,
  type: string,
  entityId: string,
  payload: unknown,
  baseVersion: number | null,
  now: number,
  opId: string = newId(now),
): Promise<void> {
  const ws = await db.workspaces.get(workspaceId);
  if (ws?.mode !== 'synced') return;
  await db.outbox.add({
    opId,
    workspaceId,
    type,
    entityId,
    payload,
    baseVersion,
    createdAt: now,
    clientSchema: CLIENT_SCHEMA,
    state: 'pending',
  });
}

type Versioned = {
  id: string;
  version: number;
  updatedAt: number;
  deletedAt: number | null;
  workspaceId: string;
};

function assertUpdatable<T extends Versioned>(
  current: T | undefined,
  entity: string,
  id: string,
  baseVersion: number,
): T {
  if (!current || current.deletedAt !== null) throw new RecordNotFoundError(entity, id);
  if (current.version !== baseVersion) throw new VersionConflictError(entity, id, current);
  return current;
}

// ---------------------------------------------------------------- workspace and active garden

/** The local workspace, created on first use. */
export async function ensureWorkspace(now = Date.now()): Promise<Workspace> {
  const id = await getMeta<string>(META_WORKSPACE);
  if (id) {
    const ws = await db.workspaces.get(id);
    if (ws) return ws;
  }
  return db.transaction('rw', db.workspaces, db.meta, async () => {
    const again = await getMeta<string>(META_WORKSPACE);
    const existing = again ? await db.workspaces.get(again) : undefined;
    if (existing) return existing;
    const ws = WorkspaceSchema.parse({
      id: newId(now),
      name: 'My gardens',
      mode: 'local',
      createdAt: now,
      updatedAt: now,
      version: 1,
    });
    await db.workspaces.add(ws);
    await setMeta(META_WORKSPACE, ws.id);
    return ws;
  });
}

export async function setActiveGarden(gardenId: string): Promise<void> {
  await setMeta(META_GARDEN, gardenId);
}

// ---------------------------------------------------------------- gardens

export type GardenInput = Pick<Garden, 'name' | 'timezone' | 'hemisphere' | 'place' | 'notes'> &
  Partial<Pick<Garden, 'region' | 'profile'>>;

export async function createGarden(input: GardenInput, now = Date.now()): Promise<Garden> {
  const ws = await ensureWorkspace(now);
  return writeTx([db.gardens], async () => {
    const garden = GardenSchema.parse({
      id: newId(now),
      workspaceId: ws.id,
      createdAt: now,
      updatedAt: now,
      version: 1,
      deletedAt: null,
      source: null,
      ...input,
    });
    await db.gardens.add(garden);
    await setMeta(META_GARDEN, garden.id);
    await enqueue(ws.id, 'garden.create', garden.id, garden, null, now);
    return garden;
  });
}

export async function updateGarden(
  id: string,
  baseVersion: number,
  patch: Partial<GardenInput>,
  now = Date.now(),
): Promise<Garden> {
  return writeTx([db.gardens], async () => {
    const cur = assertUpdatable(await db.gardens.get(id), 'garden', id, baseVersion);
    const next = GardenSchema.parse({ ...cur, ...patch, version: cur.version + 1, updatedAt: now });
    await db.gardens.put(next);
    await enqueue(cur.workspaceId, 'garden.update', id, patch, baseVersion, now);
    return next;
  });
}

export async function deleteGarden(id: string, baseVersion: number, now = Date.now()): Promise<void> {
  await writeTx([db.gardens], async () => {
    const cur = assertUpdatable(await db.gardens.get(id), 'garden', id, baseVersion);
    await db.gardens.put({ ...cur, deletedAt: now, updatedAt: now, version: cur.version + 1 });
    await enqueue(cur.workspaceId, 'garden.delete', id, null, baseVersion, now);
    if ((await getMeta<string>(META_GARDEN)) === id) {
      const other = (await db.gardens.where('workspaceId').equals(cur.workspaceId).toArray()).find(
        (g) => g.deletedAt === null && g.id !== id,
      );
      await setMeta(META_GARDEN, other?.id ?? null);
    }
  });
}

// ---------------------------------------------------------------- zones and containers

export type ZoneInput = Pick<
  Zone,
  'name' | 'kind' | 'covered' | 'areaM2' | 'orientationDeg' | 'light' | 'wind' | 'drainage' | 'notes'
> &
  Partial<Pick<Zone, 'sun' | 'indoorLight' | 'clearanceCm' | 'maxContainerL'>>;

export async function createZone(gardenId: string, input: ZoneInput, now = Date.now()): Promise<Zone> {
  return writeTx([db.zones, db.gardens], async () => {
    const garden = await db.gardens.get(gardenId);
    if (!garden || garden.deletedAt !== null) throw new RecordNotFoundError('garden', gardenId);
    const zone = ZoneSchema.parse({
      id: newId(now),
      workspaceId: garden.workspaceId,
      gardenId,
      createdAt: now,
      updatedAt: now,
      version: 1,
      deletedAt: null,
      source: null,
      ...input,
    });
    await db.zones.add(zone);
    await enqueue(garden.workspaceId, 'zone.create', zone.id, zone, null, now);
    return zone;
  });
}

export async function updateZone(
  id: string,
  baseVersion: number,
  patch: Partial<ZoneInput>,
  now = Date.now(),
): Promise<Zone> {
  return writeTx([db.zones], async () => {
    const cur = assertUpdatable(await db.zones.get(id), 'zone', id, baseVersion);
    const next = ZoneSchema.parse({ ...cur, ...patch, version: cur.version + 1, updatedAt: now });
    await db.zones.put(next);
    await enqueue(cur.workspaceId, 'zone.update', id, patch, baseVersion, now);
    return next;
  });
}

/** Deletes a zone and its containers; their plants stay in the garden without a zone. */
export async function deleteZone(id: string, baseVersion: number, now = Date.now()): Promise<void> {
  await writeTx([db.zones, db.containers, db.specimens], async () => {
    const cur = assertUpdatable(await db.zones.get(id), 'zone', id, baseVersion);
    await db.zones.put({ ...cur, deletedAt: now, updatedAt: now, version: cur.version + 1 });
    await enqueue(cur.workspaceId, 'zone.delete', id, null, baseVersion, now);
    for (const c of await db.containers.where('zoneId').equals(id).toArray()) {
      if (c.deletedAt !== null) continue;
      await db.containers.put({ ...c, deletedAt: now, updatedAt: now, version: c.version + 1 });
      await enqueue(c.workspaceId, 'container.delete', c.id, null, c.version, now);
    }
    for (const s of await db.specimens.where('zoneId').equals(id).toArray()) {
      const next = { ...s, zoneId: null, containerId: null, updatedAt: now, version: s.version + 1 };
      await db.specimens.put(next);
      await enqueue(
        s.workspaceId,
        'specimen.update',
        s.id,
        { zoneId: null, containerId: null },
        s.version,
        now,
      );
    }
  });
}

export type ContainerInput = Pick<
  Container,
  'name' | 'shape' | 'dimsCm' | 'volumeL' | 'material' | 'drainageHoles' | 'substrate' | 'notes'
>;

export async function createContainer(
  zoneId: string,
  input: ContainerInput,
  now = Date.now(),
): Promise<Container> {
  return writeTx([db.containers, db.zones], async () => {
    const zone = await db.zones.get(zoneId);
    if (!zone || zone.deletedAt !== null) throw new RecordNotFoundError('zone', zoneId);
    const container = ContainerSchema.parse({
      id: newId(now),
      workspaceId: zone.workspaceId,
      gardenId: zone.gardenId,
      zoneId,
      createdAt: now,
      updatedAt: now,
      version: 1,
      deletedAt: null,
      source: null,
      ...input,
      volumeL: input.volumeL ?? containerVolumeL(input.shape, input.dimsCm),
    });
    await db.containers.add(container);
    await enqueue(zone.workspaceId, 'container.create', container.id, container, null, now);
    return container;
  });
}

export async function updateContainer(
  id: string,
  baseVersion: number,
  patch: Partial<ContainerInput>,
  now = Date.now(),
): Promise<Container> {
  return writeTx([db.containers], async () => {
    const cur = assertUpdatable(await db.containers.get(id), 'container', id, baseVersion);
    const merged = { ...cur, ...patch };
    const next = ContainerSchema.parse({
      ...merged,
      volumeL:
        patch.volumeL !== undefined
          ? patch.volumeL
          : (containerVolumeL(merged.shape, merged.dimsCm) ?? cur.volumeL),
      version: cur.version + 1,
      updatedAt: now,
    });
    await db.containers.put(next);
    await enqueue(cur.workspaceId, 'container.update', id, patch, baseVersion, now);
    return next;
  });
}

export async function deleteContainer(id: string, baseVersion: number, now = Date.now()): Promise<void> {
  await writeTx([db.containers, db.specimens], async () => {
    const cur = assertUpdatable(await db.containers.get(id), 'container', id, baseVersion);
    await db.containers.put({ ...cur, deletedAt: now, updatedAt: now, version: cur.version + 1 });
    await enqueue(cur.workspaceId, 'container.delete', id, null, baseVersion, now);
    for (const s of await db.specimens.where('containerId').equals(id).toArray()) {
      await db.specimens.put({ ...s, containerId: null, updatedAt: now, version: s.version + 1 });
      await enqueue(s.workspaceId, 'specimen.update', s.id, { containerId: null }, s.version, now);
    }
  });
}

// ---------------------------------------------------------------- specimens

export type SpecimenInput = Pick<
  Specimen,
  | 'displayName'
  | 'scientificName'
  | 'cultivar'
  | 'identityLevel'
  | 'origin'
  | 'zoneId'
  | 'containerId'
  | 'parentSpecimenId'
  | 'plantedOn'
  | 'status'
  | 'notes'
> &
  Partial<Pick<Specimen, 'catalogTaxonId'>>;

/** Checks that zone, container and parent belong to the same garden (authorisation on every write). */
async function checkPlacement(gardenId: string, p: Partial<SpecimenInput>): Promise<void> {
  if (p.zoneId) {
    const z = await db.zones.get(p.zoneId);
    if (!z || z.deletedAt !== null || z.gardenId !== gardenId)
      throw new RecordNotFoundError('zone', p.zoneId);
  }
  if (p.containerId) {
    const c = await db.containers.get(p.containerId);
    if (!c || c.deletedAt !== null || c.gardenId !== gardenId)
      throw new RecordNotFoundError('container', p.containerId);
    if (p.zoneId && c.zoneId !== p.zoneId) throw new RecordNotFoundError('container', p.containerId);
  }
  if (p.parentSpecimenId) {
    const parent = await db.specimens.get(p.parentSpecimenId);
    if (!parent || parent.deletedAt !== null) throw new RecordNotFoundError('specimen', p.parentSpecimenId);
  }
}

export async function createSpecimen(
  gardenId: string,
  input: SpecimenInput,
  now = Date.now(),
): Promise<Specimen> {
  return writeTx([db.specimens, db.gardens, db.zones, db.containers], async () => {
    const garden = await db.gardens.get(gardenId);
    if (!garden || garden.deletedAt !== null) throw new RecordNotFoundError('garden', gardenId);
    await checkPlacement(gardenId, input);
    const specimen = SpecimenSchema.parse({
      id: newId(now),
      workspaceId: garden.workspaceId,
      gardenId,
      createdAt: now,
      updatedAt: now,
      version: 1,
      deletedAt: null,
      taxonKey: null,
      statusReason: null,
      holding: false,
      coverMediaId: null,
      source: null,
      ...input,
    });
    await db.specimens.add(specimen);
    await enqueue(garden.workspaceId, 'specimen.create', specimen.id, specimen, null, now);
    return specimen;
  });
}

export async function updateSpecimen(
  id: string,
  baseVersion: number,
  patch: Partial<SpecimenInput & Pick<Specimen, 'coverMediaId' | 'statusReason'>>,
  now = Date.now(),
): Promise<Specimen> {
  return writeTx([db.specimens, db.zones, db.containers], async () => {
    const cur = assertUpdatable(await db.specimens.get(id), 'specimen', id, baseVersion);
    const merged = { ...cur, ...patch };
    await checkPlacement(cur.gardenId, {
      zoneId: merged.zoneId,
      containerId: merged.containerId,
      parentSpecimenId: merged.parentSpecimenId,
    });
    if (merged.parentSpecimenId === id) throw new RecordNotFoundError('specimen', id);
    const next = SpecimenSchema.parse({ ...merged, version: cur.version + 1, updatedAt: now });
    await db.specimens.put(next);
    await enqueue(cur.workspaceId, 'specimen.update', id, patch, baseVersion, now);
    return next;
  });
}

export function setSpecimenStatus(
  id: string,
  baseVersion: number,
  status: SpecimenStatus,
  reason: string | null = null,
  now = Date.now(),
) {
  return updateSpecimen(id, baseVersion, { status, statusReason: reason }, now);
}

// ---------------------------------------------------------------- care, observations, harvests

async function whenFor(gardenId: string, occurredOn: string | undefined, now: number) {
  const garden = await db.gardens.get(gardenId);
  if (!garden || garden.deletedAt !== null) throw new RecordNotFoundError('garden', gardenId);
  const today = todayIn(garden.timezone, now);
  const day = occurredOn ?? today;
  const occurredAt = day === today ? now : instantForLocalDate(day, garden.timezone, now);
  return { garden, occurredAt, occurredOn: localDateOf(occurredAt, garden.timezone) };
}

async function checkSpecimenInGarden(gardenId: string, specimenId: string | null) {
  if (!specimenId) return;
  const s = await db.specimens.get(specimenId);
  if (!s || s.deletedAt !== null || s.gardenId !== gardenId)
    throw new RecordNotFoundError('specimen', specimenId);
}

export interface CareInput {
  gardenId: string;
  specimenIds: string[];
  kind: CareKind;
  amountMl: number | null;
  waterSource: WaterSource | null;
  notes: string;
  occurredOn?: string;
  mediaIds?: string[];
}

/** Logs one care event per specimen (or one garden-level event when none is chosen). Append-only. */
export async function logCare(input: CareInput, now = Date.now()): Promise<CareEvent[]> {
  return writeTx([db.careEvents, db.gardens, db.specimens], async () => {
    const { garden, occurredAt, occurredOn } = await whenFor(input.gardenId, input.occurredOn, now);
    const targets = input.specimenIds.length > 0 ? input.specimenIds : [null];
    const out: CareEvent[] = [];
    for (const specimenId of targets) {
      await checkSpecimenInGarden(garden.id, specimenId);
      const ev = CareEventSchema.parse({
        id: newId(now),
        opId: newId(now),
        workspaceId: garden.workspaceId,
        gardenId: garden.id,
        specimenId,
        kind: input.kind,
        amountMl: input.kind === 'water' ? input.amountMl : null,
        waterSource: input.kind === 'water' ? input.waterSource : null,
        occurrenceKey: null,
        notes: input.notes,
        mediaIds: input.mediaIds ?? [],
        occurredAt,
        occurredOn,
        dateUncertain: false,
        createdAt: now,
        deletedAt: null,
        source: null,
      });
      await db.careEvents.add(ev);
      await enqueue(garden.workspaceId, 'careEvent.create', ev.id, ev, null, now, ev.opId);
      out.push(ev);
    }
    return out;
  });
}

export interface ObservationInput {
  gardenId: string;
  specimenId: string | null;
  kind: Observation['kind'];
  milestone: Observation['milestone'];
  title: string;
  notes: string;
  values?: Observation['values'];
  occurredOn?: string;
  mediaIds?: string[];
}

export async function addObservation(input: ObservationInput, now = Date.now()): Promise<Observation> {
  return writeTx([db.observations, db.gardens, db.specimens], async () => {
    const { garden, occurredAt, occurredOn } = await whenFor(input.gardenId, input.occurredOn, now);
    await checkSpecimenInGarden(garden.id, input.specimenId);
    const ob = ObservationSchema.parse({
      id: newId(now),
      opId: newId(now),
      workspaceId: garden.workspaceId,
      gardenId: garden.id,
      specimenId: input.specimenId,
      kind: input.kind,
      milestone: input.kind === 'milestone' ? input.milestone : null,
      title: input.title,
      notes: input.notes,
      values: input.values ?? {},
      weather: null,
      mediaIds: input.mediaIds ?? [],
      occurredAt,
      occurredOn,
      dateUncertain: false,
      createdAt: now,
      deletedAt: null,
      source: null,
    });
    await db.observations.add(ob);
    await enqueue(garden.workspaceId, 'observation.create', ob.id, ob, null, now, ob.opId);
    return ob;
  });
}

export interface HarvestInput {
  gardenId: string;
  specimenId: string | null;
  plantName: string;
  massG: number | null;
  count: number | null;
  countLabel: string | null;
  notes: string;
  occurredOn?: string;
  destination?: Harvest['destination'];
}

export async function logHarvest(input: HarvestInput, now = Date.now()): Promise<Harvest> {
  return writeTx([db.harvests, db.gardens, db.specimens], async () => {
    const { garden, occurredOn } = await whenFor(input.gardenId, input.occurredOn, now);
    await checkSpecimenInGarden(garden.id, input.specimenId);
    const h = HarvestSchema.parse({
      id: newId(now),
      opId: newId(now),
      workspaceId: garden.workspaceId,
      gardenId: garden.id,
      specimenId: input.specimenId,
      plantName: input.plantName,
      harvestedOn: occurredOn,
      dateUncertain: false,
      massG: input.massG,
      count: input.count,
      countLabel: input.count !== null ? input.countLabel : null,
      original: null,
      quality: null,
      destination: input.destination ?? null,
      notes: input.notes,
      createdAt: now,
      deletedAt: null,
      source: null,
    });
    await db.harvests.add(h);
    await enqueue(garden.workspaceId, 'harvest.create', h.id, h, null, now, h.opId);
    return h;
  });
}

type AppendOnlyTable = 'careEvents' | 'observations' | 'harvests';

/** Voids an append-only record (soft delete). Used by Undo and by "remove entry". */
export async function voidEntry(table: AppendOnlyTable, id: string, now = Date.now()): Promise<void> {
  const t = db[table] as unknown as Table<
    { id: string; deletedAt: number | null; workspaceId: string },
    string
  >;
  await writeTx([t], async () => {
    const cur = await t.get(id);
    if (!cur) throw new RecordNotFoundError(table, id);
    if (cur.deletedAt !== null) return;
    await t.put({ ...cur, deletedAt: now });
    const entity =
      table === 'careEvents' ? 'careEvent' : table === 'observations' ? 'observation' : 'harvest';
    await enqueue(cur.workspaceId, `${entity}.void`, id, null, null, now);
  });
}

/** Restores a voided append-only record (Undo of a removal). */
export async function restoreEntry(table: AppendOnlyTable, id: string): Promise<void> {
  const t = db[table] as unknown as Table<{ id: string; deletedAt: number | null }, string>;
  await writeTx([t], async () => {
    const cur = await t.get(id);
    if (cur && cur.deletedAt !== null) await t.put({ ...cur, deletedAt: null });
  });
}

// ---------------------------------------------------------------- media

/**
 * Processes an image on the device (orient, resize, re-encode → EXIF/GPS removed, SHA-256) and stores it.
 * Returns the media record; link it to entries through their `mediaIds`.
 */
export async function storeImage(
  file: Blob,
  opts: { gardenId: string | null; link: Media['link']; alt?: string },
  now = Date.now(),
  process: (b: Blob) => Promise<ProcessedImage> = processImage,
): Promise<Media> {
  const ws = await ensureWorkspace(now);
  const img = await process(file);
  return writeTx([db.media, db.mediaBlobs], async () => {
    const media = MediaSchema.parse({
      id: newId(now),
      workspaceId: ws.id,
      gardenId: opts.gardenId,
      link: opts.link,
      kind: 'stored',
      mime: img.full.type,
      width: img.width,
      height: img.height,
      bytes: img.full.size,
      sha256: img.sha256,
      metadataStripped: true,
      externalUrl: null,
      flag: null,
      alt: opts.alt ?? '',
      createdAt: now,
      deletedAt: null,
      source: null,
    });
    await db.media.add(media);
    await db.mediaBlobs.put({ id: media.id, full: img.full, thumb: img.thumb });
    return media;
  });
}

/** Links already-stored media to the entry they illustrate. */
export async function linkMedia(mediaIds: string[], link: NonNullable<Media['link']>): Promise<void> {
  if (mediaIds.length === 0) return;
  await writeTx([db.media], async () => {
    for (const id of mediaIds) {
      const m = await db.media.get(id);
      if (m) await db.media.put({ ...m, link });
    }
  });
}

/** Saves the alt text a person wrote or confirmed (never saved straight from AI output). */
export async function setMediaAlt(id: string, alt: string): Promise<Media> {
  return writeTx([db.media], async () => {
    const m = await db.media.get(id);
    if (!m || m.deletedAt !== null) throw new RecordNotFoundError('media', id);
    const next = MediaSchema.parse({ ...m, alt: alt.trim().slice(0, 200) });
    await db.media.put(next);
    return next;
  });
}

export async function deleteMedia(id: string, now = Date.now()): Promise<void> {
  await writeTx([db.media, db.mediaBlobs], async () => {
    const m = await db.media.get(id);
    if (!m) return;
    await db.media.put({ ...m, deletedAt: now });
    await db.mediaBlobs.delete(id);
  });
}

// ---------------------------------------------------------------- plans

export type PlanItemInput = Pick<
  PlanItem,
  'taxonId' | 'status' | 'chosen' | 'score' | 'findings' | 'flags'
> & {
  /** Index into the zones being created, or an existing zone id. */
  zone: number | string | null;
  /** Names for the planned specimen when chosen. */
  displayName: string;
  scientificName: string;
};

export interface PlanMeta {
  name: string;
  catalogVersion: string;
  engineVersion: string;
  inputsHash: string;
}

async function writePlan(
  garden: Garden,
  zoneIds: string[],
  meta: PlanMeta,
  items: PlanItemInput[],
  now: number,
): Promise<{ plan: Plan; specimens: Specimen[] }> {
  const plan = PlanSchema.parse({
    id: newId(now),
    workspaceId: garden.workspaceId,
    gardenId: garden.id,
    createdAt: now,
    updatedAt: now,
    version: 1,
    deletedAt: null,
    status: 'saved',
    source: null,
    ...meta,
  });
  await db.plans.add(plan);
  await enqueue(garden.workspaceId, 'plan.create', plan.id, plan, null, now);
  const specimens: Specimen[] = [];
  for (const item of items) {
    const zoneId =
      typeof item.zone === 'number'
        ? (zoneIds[item.zone] ?? null)
        : typeof item.zone === 'string'
          ? item.zone
          : null;
    if (zoneId) {
      const z = await db.zones.get(zoneId);
      if (!z || z.deletedAt !== null || z.gardenId !== garden.id)
        throw new RecordNotFoundError('zone', zoneId);
    }
    let specimenId: string | null = null;
    if (item.chosen) {
      // Only eligible plants become planned specimens; a score never rescues an excluded one.
      if (item.status !== 'ELIGIBLE') throw new RecordNotFoundError('eligible plan item', item.taxonId);
      const specimen = SpecimenSchema.parse({
        id: newId(now),
        workspaceId: garden.workspaceId,
        gardenId: garden.id,
        createdAt: now,
        updatedAt: now,
        version: 1,
        deletedAt: null,
        displayName: item.displayName,
        scientificName: item.scientificName,
        cultivar: null,
        taxonKey: null,
        catalogTaxonId: item.taxonId,
        identityLevel: 'species',
        origin: 'unknown',
        zoneId,
        containerId: null,
        parentSpecimenId: null,
        plantedOn: null,
        status: 'planned',
        statusReason: null,
        holding: false,
        coverMediaId: null,
        notes: '',
        source: null,
      });
      await db.specimens.add(specimen);
      await enqueue(garden.workspaceId, 'specimen.create', specimen.id, specimen, null, now);
      specimens.push(specimen);
      specimenId = specimen.id;
    }
    const row = PlanItemSchema.parse({
      id: newId(now),
      workspaceId: garden.workspaceId,
      gardenId: garden.id,
      planId: plan.id,
      zoneId,
      createdAt: now,
      updatedAt: now,
      version: 1,
      deletedAt: null,
      taxonId: item.taxonId,
      status: item.status,
      chosen: item.chosen,
      score: item.score,
      findings: item.findings,
      flags: item.flags,
      specimenId,
      source: null,
    });
    await db.planItems.add(row);
    await enqueue(garden.workspaceId, 'planItem.create', row.id, row, null, now);
  }
  return { plan, specimens };
}

const PLAN_TABLES = () => [db.gardens, db.zones, db.plans, db.planItems, db.specimens];

/**
 * Saves the Seed onboarding result in one transaction (§7 W1 step 9): the garden, its zones, the plan
 * snapshot and a planned specimen for every chosen plant. Nothing is written if any part fails.
 */
export async function saveSeedPlan(
  input: { garden: GardenInput; zones: ZoneInput[]; plan: PlanMeta; items: PlanItemInput[] },
  now = Date.now(),
): Promise<{ garden: Garden; zones: Zone[]; plan: Plan; specimens: Specimen[] }> {
  const ws = await ensureWorkspace(now);
  return writeTx(PLAN_TABLES(), async () => {
    const garden = GardenSchema.parse({
      id: newId(now),
      workspaceId: ws.id,
      createdAt: now,
      updatedAt: now,
      version: 1,
      deletedAt: null,
      source: null,
      ...input.garden,
    });
    await db.gardens.add(garden);
    await enqueue(ws.id, 'garden.create', garden.id, garden, null, now);
    const zones: Zone[] = [];
    for (const z of input.zones) {
      const zone = ZoneSchema.parse({
        id: newId(now),
        workspaceId: ws.id,
        gardenId: garden.id,
        createdAt: now,
        updatedAt: now,
        version: 1,
        deletedAt: null,
        source: null,
        ...z,
      });
      await db.zones.add(zone);
      await enqueue(ws.id, 'zone.create', zone.id, zone, null, now);
      zones.push(zone);
    }
    const { plan, specimens } = await writePlan(
      garden,
      zones.map((z) => z.id),
      input.plan,
      input.items,
      now,
    );
    await setMeta(META_GARDEN, garden.id);
    return { garden, zones, plan, specimens };
  });
}

/** Saves a plan for an existing garden (the Plan page). Items reference existing zone ids. */
export async function savePlan(
  gardenId: string,
  meta: PlanMeta,
  items: PlanItemInput[],
  now = Date.now(),
): Promise<{ plan: Plan; specimens: Specimen[] }> {
  return writeTx(PLAN_TABLES(), async () => {
    const garden = await db.gardens.get(gardenId);
    if (!garden || garden.deletedAt !== null) throw new RecordNotFoundError('garden', gardenId);
    return writePlan(garden, [], meta, items, now);
  });
}

export async function deletePlan(id: string, baseVersion: number, now = Date.now()): Promise<void> {
  await writeTx([db.plans], async () => {
    const cur = assertUpdatable(await db.plans.get(id), 'plan', id, baseVersion);
    await db.plans.put({ ...cur, deletedAt: now, updatedAt: now, version: cur.version + 1 });
    await enqueue(cur.workspaceId, 'plan.delete', id, null, baseVersion, now);
  });
}

// ---------------------------------------------------------------- care schedules and tasks

export type ScheduleInput = Pick<CareSchedule, 'specimenId' | 'zoneId' | 'kind' | 'title' | 'rule'> & {
  origin?: CareSchedule['origin'];
};

async function addSchedule(
  garden: Garden,
  input: ScheduleInput,
  today: string,
  now: number,
): Promise<CareSchedule> {
  const s = CareScheduleSchema.parse({
    id: newId(now),
    workspaceId: garden.workspaceId,
    gardenId: garden.id,
    createdAt: now,
    updatedAt: now,
    version: 1,
    deletedAt: null,
    effectiveFrom: today,
    pausedUntil: null,
    origin: input.origin ?? 'user',
    source: null,
    ...input,
  });
  await db.careSchedules.add(s);
  await enqueue(garden.workspaceId, 'careSchedule.create', s.id, s, null, now);
  return s;
}

export async function createSchedule(
  gardenId: string,
  input: ScheduleInput,
  now = Date.now(),
): Promise<CareSchedule> {
  return writeTx([db.careSchedules, db.gardens, db.specimens], async () => {
    const garden = await db.gardens.get(gardenId);
    if (!garden || garden.deletedAt !== null) throw new RecordNotFoundError('garden', gardenId);
    await checkSpecimenInGarden(garden.id, input.specimenId);
    return addSchedule(garden, input, todayIn(garden.timezone, now), now);
  });
}

/** Changes the whole series from today: a new version, so past occurrences keep their identity. */
export async function updateSchedule(
  id: string,
  baseVersion: number,
  patch: Partial<Pick<CareSchedule, 'rule' | 'title' | 'pausedUntil'>>,
  now = Date.now(),
): Promise<CareSchedule> {
  return writeTx([db.careSchedules, db.gardens], async () => {
    const cur = assertUpdatable(await db.careSchedules.get(id), 'careSchedule', id, baseVersion);
    const garden = await db.gardens.get(cur.gardenId);
    const today = todayIn(garden?.timezone ?? 'UTC', now);
    const ruleChanged = patch.rule !== undefined;
    const next = CareScheduleSchema.parse({
      ...cur,
      ...patch,
      origin: ruleChanged ? 'user' : cur.origin,
      effectiveFrom: ruleChanged ? today : cur.effectiveFrom,
      version: cur.version + 1,
      updatedAt: now,
    });
    await db.careSchedules.put(next);
    await enqueue(cur.workspaceId, 'careSchedule.update', id, patch, baseVersion, now);
    return next;
  });
}

export async function deleteSchedule(id: string, baseVersion: number, now = Date.now()): Promise<void> {
  await writeTx([db.careSchedules], async () => {
    const cur = assertUpdatable(await db.careSchedules.get(id), 'careSchedule', id, baseVersion);
    await db.careSchedules.put({ ...cur, deletedAt: now, updatedAt: now, version: cur.version + 1 });
    await enqueue(cur.workspaceId, 'careSchedule.delete', id, null, baseVersion, now);
  });
}

/** A planned plant goes in: it becomes active with its planting date and gets its default schedules. */
export async function markPlanted(
  specimenId: string,
  baseVersion: number,
  plantedOn: string,
  schedules: readonly ScheduleDraft[],
  now = Date.now(),
): Promise<Specimen> {
  return writeTx([db.specimens, db.careSchedules, db.gardens], async () => {
    const cur = assertUpdatable(await db.specimens.get(specimenId), 'specimen', specimenId, baseVersion);
    const garden = await db.gardens.get(cur.gardenId);
    if (!garden || garden.deletedAt !== null) throw new RecordNotFoundError('garden', cur.gardenId);
    const next = SpecimenSchema.parse({
      ...cur,
      status: 'active',
      plantedOn,
      version: cur.version + 1,
      updatedAt: now,
    });
    await db.specimens.put(next);
    await enqueue(
      cur.workspaceId,
      'specimen.update',
      cur.id,
      { status: 'active', plantedOn },
      baseVersion,
      now,
    );
    const today = todayIn(garden.timezone, now);
    for (const d of schedules) {
      const { byWeekday, ...rule } = d.rule;
      await addSchedule(
        garden,
        {
          specimenId: cur.id,
          zoneId: cur.zoneId,
          kind: d.kind,
          title: '',
          rule: { ...rule, ...(byWeekday ? { byWeekday: [...byWeekday] } : {}) },
          origin: 'engine',
        },
        today,
        now,
      );
    }
    return next;
  });
}

export interface TaskInput {
  gardenId: string;
  occurrenceKey: string;
  scheduleId: string | null;
  specimenId: string | null;
  kind: TaskLog['kind'];
  action: TaskLog['action'];
  /** When the occurrence was due; seeds the idempotent id. */
  dueAt: number;
  reason?: TaskLog['reason'];
  snoozeUntil?: number | null;
  check?: TaskLog['check'];
  /** For "done" on watering tasks: the amount actually given (not an estimate). */
  water?: { amountMl: number | null; source: WaterSource | null };
  /** For soil checks: what the engine predicted, so the pot's water factor can learn (§6.4). */
  predicted?: 'dry' | 'moist' | null;
}

const CARE_KIND_OF: Partial<Record<TaskLog['kind'], CareKind>> = {
  water: 'water',
  'check-water': 'water',
  feed: 'feed',
  prune: 'prune',
  'pest-check': 'pest-check',
};

/**
 * Records what happened to a task occurrence. "Done" and "checked" are idempotent per occurrence:
 * a double tap or an offline replay returns the existing record instead of logging care twice.
 */
export async function logTask(input: TaskInput, now = Date.now()): Promise<TaskLog> {
  return writeTx([db.taskLogs, db.careEvents, db.gardens, db.specimens, db.containers], async () => {
    const garden = await db.gardens.get(input.gardenId);
    if (!garden || garden.deletedAt !== null) throw new RecordNotFoundError('garden', input.gardenId);
    await checkSpecimenInGarden(garden.id, input.specimenId);
    const final = input.action === 'done' || input.action === 'checked';
    const id = final
      ? deterministicId(input.dueAt, `task:${input.action}:${input.occurrenceKey}`)
      : newId(now);
    if (final) {
      const existing = await db.taskLogs.get(id);
      if (existing && existing.deletedAt === null) return existing;
    }
    const occurredOn = todayIn(garden.timezone, now);
    let careEventId: string | null = null;
    const careKind = CARE_KIND_OF[input.kind];
    if (input.action === 'done' && careKind) {
      const isWater = careKind === 'water';
      const ev = CareEventSchema.parse({
        id: newId(now),
        opId: newId(now),
        workspaceId: garden.workspaceId,
        gardenId: garden.id,
        specimenId: input.specimenId,
        kind: careKind,
        amountMl: isWater ? (input.water?.amountMl ?? null) : null,
        waterSource: isWater ? (input.water?.source ?? null) : null,
        occurrenceKey: input.occurrenceKey,
        notes: '',
        mediaIds: [],
        occurredAt: now,
        occurredOn,
        dateUncertain: false,
        createdAt: now,
        deletedAt: null,
        source: null,
      });
      await db.careEvents.add(ev);
      await enqueue(garden.workspaceId, 'careEvent.create', ev.id, ev, null, now, ev.opId);
      careEventId = ev.id;
    }
    const log = TaskLogSchema.parse({
      id,
      opId: newId(now),
      workspaceId: garden.workspaceId,
      gardenId: garden.id,
      occurrenceKey: input.occurrenceKey,
      scheduleId: input.scheduleId,
      specimenId: input.specimenId,
      kind: input.kind,
      action: input.action,
      at: now,
      occurredOn,
      snoozeUntil: input.action === 'snoozed' ? (input.snoozeUntil ?? null) : null,
      reason: input.action === 'skipped' ? (input.reason ?? 'other') : null,
      check: input.check ?? null,
      careEventId,
      createdAt: now,
      deletedAt: null,
    });
    await db.taskLogs.add(log);
    await enqueue(garden.workspaceId, 'taskLog.create', log.id, log, null, now, log.opId);

    // Learn from the check: a pot that was wetter or drier than predicted adjusts its water factor.
    const soil = input.check?.soil ?? null;
    if (input.action === 'checked' && soil && input.predicted && input.specimenId) {
      const sp = await db.specimens.get(input.specimenId);
      const container = sp?.containerId ? await db.containers.get(sp.containerId) : undefined;
      if (container && container.deletedAt === null) {
        const factor = recalibrate(container.waterFactor ?? 1, input.predicted, soil);
        if (factor !== container.waterFactor) {
          const next = ContainerSchema.parse({
            ...container,
            waterFactor: factor,
            version: container.version + 1,
            updatedAt: now,
          });
          await db.containers.put(next);
          await enqueue(
            container.workspaceId,
            'container.update',
            container.id,
            { waterFactor: factor },
            container.version,
            now,
          );
        }
      }
    }
    return log;
  });
}

/** Undo for a task action: voids the log and any care event it created (append-only, never deleted). */
export async function voidTask(id: string, now = Date.now()): Promise<void> {
  await writeTx([db.taskLogs, db.careEvents], async () => {
    const log = await db.taskLogs.get(id);
    if (!log || log.deletedAt !== null) return;
    await db.taskLogs.put({ ...log, deletedAt: now });
    await enqueue(log.workspaceId, 'taskLog.void', id, null, null, now);
    if (log.careEventId) {
      const ev = await db.careEvents.get(log.careEventId);
      if (ev && ev.deletedAt === null) {
        await db.careEvents.put({ ...ev, deletedAt: now });
        await enqueue(ev.workspaceId, 'careEvent.void', ev.id, null, null, now);
      }
    }
  });
}

// ---------------------------------------------------------------- danger zone

/** Deletes every PlantPal record on this device (gardens, photos, outbox, settings stored in the database). */
export async function deleteAllLocalData(): Promise<void> {
  await db.delete();
  await db.open();
}
