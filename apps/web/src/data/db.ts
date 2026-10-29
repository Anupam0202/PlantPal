import Dexie, { type EntityTable } from 'dexie';
import type {
  CareEvent,
  CareSchedule,
  Container,
  Draft,
  Garden,
  Harvest,
  HealthCase,
  SpeciesDraftRecord,
  Media,
  Observation,
  OutboxOp,
  Plan,
  PlanItem,
  SoilTest,
  Specimen,
  TaskLog,
  Workspace,
  Zone,
} from '@plantpal/schemas';

/** Bumped with every Dexie schema change; sent with outbox ops so the server knows the client shape. */
export const CLIENT_SCHEMA = 5;

export interface MediaBlob {
  id: string;
  full: Blob;
  thumb: Blob;
}

export interface MetaRow {
  key: string;
  value: unknown;
}

/** Cached provider payloads (public facts for rounded coordinates; never user records). */
export interface FactRow {
  key: string;
  value: unknown;
  storedAt: number;
  freshUntil: number;
  expiresAt: number;
}

export type PlantPalDB = Dexie & {
  workspaces: EntityTable<Workspace, 'id'>;
  gardens: EntityTable<Garden, 'id'>;
  zones: EntityTable<Zone, 'id'>;
  containers: EntityTable<Container, 'id'>;
  specimens: EntityTable<Specimen, 'id'>;
  careEvents: EntityTable<CareEvent, 'id'>;
  observations: EntityTable<Observation, 'id'>;
  harvests: EntityTable<Harvest, 'id'>;
  media: EntityTable<Media, 'id'>;
  mediaBlobs: EntityTable<MediaBlob, 'id'>;
  soilTests: EntityTable<SoilTest, 'id'>;
  healthCases: EntityTable<HealthCase, 'id'>;
  drafts: EntityTable<Draft, 'id'>;
  outbox: EntityTable<OutboxOp, 'opId'>;
  meta: EntityTable<MetaRow, 'key'>;
  facts: EntityTable<FactRow, 'key'>;
  plans: EntityTable<Plan, 'id'>;
  planItems: EntityTable<PlanItem, 'id'>;
  careSchedules: EntityTable<CareSchedule, 'id'>;
  taskLogs: EntityTable<TaskLog, 'id'>;
  speciesDrafts: EntityTable<SpeciesDraftRecord, 'id'>;
};

/** Schema version 1 (M2). Kept verbatim so upgrades are tested from the real previous shape. */
export const STORES_V1 = {
  workspaces: 'id',
  gardens: 'id, workspaceId',
  zones: 'id, gardenId, workspaceId',
  containers: 'id, zoneId, gardenId, workspaceId',
  specimens: 'id, gardenId, zoneId, containerId, status, workspaceId',
  careEvents:
    'id, &opId, workspaceId, specimenId, gardenId, occurredAt, [specimenId+occurredAt], [gardenId+occurredAt], occurrenceKey',
  observations:
    'id, &opId, workspaceId, specimenId, gardenId, occurredAt, [specimenId+occurredAt], [gardenId+occurredAt]',
  harvests: 'id, &opId, workspaceId, specimenId, gardenId, harvestedOn',
  media: 'id, gardenId, link.id, workspaceId',
  mediaBlobs: 'id',
  soilTests: 'id, gardenId, workspaceId',
  healthCases: 'id, gardenId, specimenId, workspaceId',
  drafts: 'id, workspaceId',
  outbox: 'opId, workspaceId, createdAt, state',
  meta: 'key',
} as const;

export function createDb(name = 'plantpal'): PlantPalDB {
  const db = new Dexie(name) as PlantPalDB;
  db.version(1).stores(STORES_V1);
  // v2 (M3): cache of provider facts, evictable under storage pressure.
  db.version(2).stores({ facts: 'key, expiresAt' });
  // v3 (M4): plans and their item snapshots. Older garden, zone and specimen rows gain new fields
  // through schema defaults when they are next written, so no data migration is needed.
  db.version(3).stores({
    plans: 'id, gardenId, workspaceId',
    planItems: 'id, planId, gardenId, workspaceId, taxonId',
  });
  // v4 (M5): care schedules and the append-only task history.
  db.version(4).stores({
    careSchedules: 'id, gardenId, specimenId, workspaceId',
    taskLogs: 'id, &opId, gardenId, specimenId, occurrenceKey, at, workspaceId',
  });
  // v5 (M7): species drafted on this device (cited AI drafts awaiting review). Health cases gain
  // optional fields through schema defaults, so they need no data migration.
  db.version(5).stores({ speciesDrafts: 'id, workspaceId, scientificName' });
  return db;
}

export const db = createDb();

/** Tables that hold user records (everything except blobs, outbox and meta). */
export const RECORD_TABLES = [
  'workspaces',
  'gardens',
  'zones',
  'containers',
  'specimens',
  'careEvents',
  'observations',
  'harvests',
  'media',
  'soilTests',
  'healthCases',
  'drafts',
  'plans',
  'planItems',
  'careSchedules',
  'taskLogs',
  'speciesDrafts',
] as const;
export type RecordTable = (typeof RECORD_TABLES)[number];

export async function getMeta<T>(key: string): Promise<T | undefined> {
  return (await db.meta.get(key))?.value as T | undefined;
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await db.meta.put({ key, value });
}
