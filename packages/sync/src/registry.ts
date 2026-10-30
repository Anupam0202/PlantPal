import type { z } from 'zod';
import {
  CareEvent,
  CareSchedule,
  Container,
  Garden,
  Harvest,
  HealthCase,
  Layout,
  NatureVisit,
  Observation,
  PantryItem,
  Plan,
  PlanItem,
  Specimen,
  TaskLog,
  Zone,
} from '@plantpal/schemas';

/**
 * How each synced record type behaves (§14.3).
 * - `versioned`: updates carry `baseVersion`; a stale one is a conflict.
 * - `append`: created once, never edited, only voided; merged by id.
 */
export interface EntitySpec {
  schema: z.ZodType;
  kind: 'versioned' | 'append';
  /** Fields that reference other synced records; each must live in the same workspace. */
  refs: ReadonlyArray<{ field: string; entity: EntityName; many?: boolean }>;
  /** Helpers may write this type (care and observations, §6.11). */
  helper: boolean;
  /** Completions de-duplicate on this key: first wins (§14.3). */
  dedupeKey?: (record: Record<string, unknown>) => string | null;
}

export const ENTITY_NAMES = [
  'garden',
  'zone',
  'container',
  'specimen',
  'careEvent',
  'observation',
  'harvest',
  'healthCase',
  'plan',
  'planItem',
  'careSchedule',
  'taskLog',
  'layout',
  'natureVisit',
  'pantryItem',
] as const;
export type EntityName = (typeof ENTITY_NAMES)[number];

const g = { field: 'gardenId', entity: 'garden' } as const;

export const ENTITIES: Record<EntityName, EntitySpec> = {
  garden: { schema: Garden, kind: 'versioned', refs: [], helper: false },
  zone: { schema: Zone, kind: 'versioned', refs: [g], helper: false },
  container: {
    schema: Container,
    kind: 'versioned',
    refs: [g, { field: 'zoneId', entity: 'zone' }],
    helper: false,
  },
  specimen: {
    schema: Specimen,
    kind: 'versioned',
    refs: [
      g,
      { field: 'zoneId', entity: 'zone' },
      { field: 'containerId', entity: 'container' },
      { field: 'parentSpecimenId', entity: 'specimen' },
    ],
    helper: false,
  },
  careEvent: {
    schema: CareEvent,
    kind: 'append',
    refs: [g, { field: 'specimenId', entity: 'specimen' }],
    helper: true,
    dedupeKey: (r) =>
      typeof r.occurrenceKey === 'string' && r.occurrenceKey ? `care:${r.occurrenceKey}` : null,
  },
  observation: {
    schema: Observation,
    kind: 'append',
    refs: [g, { field: 'specimenId', entity: 'specimen' }],
    helper: true,
  },
  harvest: {
    schema: Harvest,
    kind: 'append',
    refs: [g, { field: 'specimenId', entity: 'specimen' }],
    helper: true,
  },
  healthCase: {
    schema: HealthCase,
    kind: 'versioned',
    refs: [
      g,
      { field: 'specimenId', entity: 'specimen' },
      { field: 'followUpScheduleIds', entity: 'careSchedule', many: true },
    ],
    helper: false,
  },
  plan: { schema: Plan, kind: 'versioned', refs: [g], helper: false },
  planItem: {
    schema: PlanItem,
    kind: 'versioned',
    refs: [
      g,
      { field: 'planId', entity: 'plan' },
      { field: 'zoneId', entity: 'zone' },
      { field: 'specimenId', entity: 'specimen' },
    ],
    helper: false,
  },
  careSchedule: {
    schema: CareSchedule,
    kind: 'versioned',
    refs: [g, { field: 'specimenId', entity: 'specimen' }, { field: 'zoneId', entity: 'zone' }],
    helper: false,
  },
  taskLog: {
    schema: TaskLog,
    kind: 'append',
    refs: [
      g,
      { field: 'specimenId', entity: 'specimen' },
      { field: 'scheduleId', entity: 'careSchedule' },
      { field: 'careEventId', entity: 'careEvent' },
    ],
    helper: true,
    // Two people completing the same occurrence: the first completion wins.
    dedupeKey: (r) =>
      r.action === 'done' && typeof r.occurrenceKey === 'string' ? `done:${r.occurrenceKey}` : null,
  },
  layout: {
    schema: Layout,
    kind: 'versioned',
    refs: [g, { field: 'zoneId', entity: 'zone' }],
    helper: false,
  },
  natureVisit: {
    schema: NatureVisit,
    kind: 'append',
    refs: [g, { field: 'zoneId', entity: 'zone' }, { field: 'specimenId', entity: 'specimen' }],
    helper: true,
  },
  pantryItem: {
    schema: PantryItem,
    kind: 'versioned',
    refs: [g, { field: 'harvestId', entity: 'harvest' }, { field: 'specimenId', entity: 'specimen' }],
    helper: true,
  },
};

export function isEntityName(s: string): s is EntityName {
  return (ENTITY_NAMES as readonly string[]).includes(s);
}

/** Ids a record refers to, with the type each must be. */
export function referencedIds(
  entity: EntityName,
  record: Record<string, unknown>,
): Array<{ id: string; entity: EntityName }> {
  const out: Array<{ id: string; entity: EntityName }> = [];
  for (const r of ENTITIES[entity].refs) {
    const v = record[r.field];
    if (r.many && Array.isArray(v))
      for (const id of v) if (typeof id === 'string') out.push({ id, entity: r.entity });
    if (!r.many && typeof v === 'string') out.push({ id: v, entity: r.entity });
  }
  return out;
}
