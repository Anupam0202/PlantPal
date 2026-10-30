import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type {
  HealthCase,
  Layout,
  LayoutVersion,
  NatureVisit,
  PantryItem,
  SpeciesDraftRecord,
  CareEvent,
  CareSchedule,
  Container,
  Garden,
  Harvest,
  LegacyAchievements,
  Media,
  Observation,
  Plan,
  PlanItem,
  SeedLot,
  Specimen,
  TaskLog,
  Zone,
} from '@plantpal/schemas';
import { db, getMeta } from './db';
import { ensureWorkspace } from './commands';

const alive = <T extends { deletedAt: number | null }>(r: T) => r.deletedAt === null;

export function useWorkspaceId(): string | undefined {
  const [fallback, setFallback] = useState<string>();
  const id = useLiveQuery(() => getMeta<string>('activeWorkspaceId'), []);
  useEffect(() => {
    if (id === undefined) void ensureWorkspace().then((ws) => setFallback(ws.id));
  }, [id]);
  return id ?? fallback;
}

export function useGardens(): Garden[] | undefined {
  const ws = useWorkspaceId();
  return useLiveQuery(async () => {
    if (!ws) return undefined;
    const all = await db.gardens.where('workspaceId').equals(ws).toArray();
    return all.filter(alive).sort((a, b) => a.createdAt - b.createdAt);
  }, [ws]);
}

/** The garden the user is working in (remembered), or the first one. `null` when there are none. */
export function useActiveGarden(): { garden: Garden | null | undefined; gardens: Garden[] | undefined } {
  const gardens = useGardens();
  const activeId = useLiveQuery(() => getMeta<string | null>('activeGardenId'), []);
  if (gardens === undefined) return { garden: undefined, gardens };
  const garden = gardens.find((g) => g.id === activeId) ?? gardens[0] ?? null;
  return { garden, gardens };
}

export function useZones(gardenId: string | undefined): Zone[] | undefined {
  return useLiveQuery(
    async () =>
      gardenId
        ? (await db.zones.where('gardenId').equals(gardenId).toArray())
            .filter(alive)
            .sort((a, b) => a.createdAt - b.createdAt)
        : [],
    [gardenId],
  );
}

export function useContainers(gardenId: string | undefined): Container[] | undefined {
  return useLiveQuery(
    async () =>
      gardenId
        ? (await db.containers.where('gardenId').equals(gardenId).toArray())
            .filter(alive)
            .sort((a, b) => a.createdAt - b.createdAt)
        : [],
    [gardenId],
  );
}

export function useSpecimens(gardenId: string | undefined): Specimen[] | undefined {
  return useLiveQuery(
    async () =>
      gardenId
        ? (await db.specimens.where('gardenId').equals(gardenId).toArray())
            .filter(alive)
            .sort((a, b) => a.displayName.localeCompare(b.displayName))
        : [],
    [gardenId],
  );
}

export function useSpecimen(id: string): Specimen | null | undefined {
  return useLiveQuery(async () => {
    const s = await db.specimens.get(id);
    return s && s.deletedAt === null ? s : null;
  }, [id]);
}

export function useGarden(id: string | undefined): Garden | null | undefined {
  return useLiveQuery(async () => {
    if (!id) return null;
    const g = await db.gardens.get(id);
    return g && g.deletedAt === null ? g : null;
  }, [id]);
}

export type TimelineItem =
  | {
      type: 'care';
      id: string;
      at: number;
      on: string;
      uncertain: boolean;
      specimenId: string | null;
      record: CareEvent;
    }
  | {
      type: 'observation';
      id: string;
      at: number;
      on: string;
      uncertain: boolean;
      specimenId: string | null;
      record: Observation;
    }
  | {
      type: 'harvest';
      id: string;
      at: number;
      on: string;
      uncertain: boolean;
      specimenId: string | null;
      record: Harvest;
    };

/** Care events, observations and harvests merged newest-first, for a garden or a single plant. */
export function useTimeline(opts: {
  gardenId?: string;
  specimenId?: string;
  limit?: number;
}): TimelineItem[] | undefined {
  const { gardenId, specimenId, limit = 200 } = opts;
  return useLiveQuery(async () => {
    if (!gardenId && !specimenId) return [];
    const [care, obs, harv] = specimenId
      ? await Promise.all([
          db.careEvents.where('specimenId').equals(specimenId).toArray(),
          db.observations.where('specimenId').equals(specimenId).toArray(),
          db.harvests.where('specimenId').equals(specimenId).toArray(),
        ])
      : await Promise.all([
          db.careEvents
            .where('gardenId')
            .equals(gardenId ?? '')
            .toArray(),
          db.observations
            .where('gardenId')
            .equals(gardenId ?? '')
            .toArray(),
          db.harvests
            .where('gardenId')
            .equals(gardenId ?? '')
            .toArray(),
        ]);
    const items: TimelineItem[] = [
      ...care.filter(alive).map((r) => ({
        type: 'care' as const,
        id: r.id,
        at: r.occurredAt,
        on: r.occurredOn,
        uncertain: r.dateUncertain,
        specimenId: r.specimenId,
        record: r,
      })),
      ...obs.filter(alive).map((r) => ({
        type: 'observation' as const,
        id: r.id,
        at: r.occurredAt,
        on: r.occurredOn,
        uncertain: r.dateUncertain,
        specimenId: r.specimenId,
        record: r,
      })),
      ...harv.filter(alive).map((r) => ({
        type: 'harvest' as const,
        id: r.id,
        at: r.createdAt,
        on: r.harvestedOn,
        uncertain: r.dateUncertain,
        specimenId: r.specimenId,
        record: r,
      })),
    ];
    items.sort((a, b) => (a.on === b.on ? b.at - a.at : a.on < b.on ? 1 : -1));
    return items.slice(0, limit);
  }, [gardenId, specimenId, limit]);
}

export function useMedia(ids: readonly string[]): Media[] | undefined {
  const key = ids.join(',');
  return useLiveQuery(async () => {
    if (ids.length === 0) return [];
    const rows = await db.media.bulkGet([...ids]);
    return rows.filter((m): m is Media => !!m && m.deletedAt === null);
  }, [key]);
}

/** Object URL for a stored image; revoked automatically when the component unmounts. */
export function useMediaUrl(
  mediaId: string | null | undefined,
  variant: 'thumb' | 'full' = 'thumb',
): string | null {
  const blob = useLiveQuery(async () => {
    if (!mediaId) return null;
    const row = await db.mediaBlobs.get(mediaId);
    return row ? row[variant] : null;
  }, [mediaId, variant]);
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob) {
      setUrl(null);
      return;
    }
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return url;
}

export function useLegacyAchievements(): LegacyAchievements | null | undefined {
  return useLiveQuery(async () => (await getMeta<LegacyAchievements>('legacyAchievements')) ?? null, []);
}

export function useRecordCounts(gardenId: string | undefined) {
  return useLiveQuery(async () => {
    if (!gardenId) return null;
    const specimens = (await db.specimens.where('gardenId').equals(gardenId).toArray()).filter(
      (s) => alive(s) && !s.holding,
    );
    return {
      active: specimens.filter((s) => s.status === 'active').length,
      planned: specimens.filter((s) => s.status === 'planned').length,
      total: specimens.length,
    };
  }, [gardenId]);
}

/** Saved plans for a garden, newest first. */
export function usePlans(gardenId: string | undefined): Plan[] | undefined {
  return useLiveQuery(
    async () =>
      gardenId
        ? (await db.plans.where('gardenId').equals(gardenId).toArray())
            .filter(alive)
            .sort((a, b) => b.createdAt - a.createdAt)
        : [],
    [gardenId],
  );
}

export function usePlanItems(gardenId: string | undefined): PlanItem[] | undefined {
  return useLiveQuery(
    async () =>
      gardenId ? (await db.planItems.where('gardenId').equals(gardenId).toArray()).filter(alive) : [],
    [gardenId],
  );
}

export function useSchedules(gardenId: string | undefined): CareSchedule[] | undefined {
  return useLiveQuery(
    async () =>
      gardenId ? (await db.careSchedules.where('gardenId').equals(gardenId).toArray()).filter(alive) : [],
    [gardenId],
  );
}

/** Task history (including voided rows, which the care engine ignores) since `sinceMs`. */
export function useTaskLogs(gardenId: string | undefined, sinceMs: number): TaskLog[] | undefined {
  return useLiveQuery(
    async () =>
      gardenId
        ? (await db.taskLogs.where('gardenId').equals(gardenId).toArray()).filter((l) => l.at >= sinceMs)
        : [],
    [gardenId, sinceMs],
  );
}

/** Non-voided care events since `sinceMs` (watering resets the pot's water balance). */
export function useRecentCare(gardenId: string | undefined, sinceMs: number): CareEvent[] | undefined {
  return useLiveQuery(
    async () =>
      gardenId
        ? (
            await db.careEvents
              .where('[gardenId+occurredAt]')
              .between([gardenId, sinceMs], [gardenId, Number.MAX_SAFE_INTEGER])
              .toArray()
          ).filter(alive)
        : [],
    [gardenId, sinceMs],
  );
}

export function useHealthCases(gardenId: string | undefined): HealthCase[] | undefined {
  return useLiveQuery(
    async () =>
      gardenId
        ? (await db.healthCases.where('gardenId').equals(gardenId).toArray())
            .filter((c) => c.deletedAt === null)
            .sort((a, b) => b.openedAt - a.openedAt)
        : [],
    [gardenId],
  );
}

export function useHealthCase(id: string): HealthCase | null | undefined {
  return useLiveQuery(async () => {
    const c = await db.healthCases.get(id);
    return c && c.deletedAt === null ? c : null;
  }, [id]);
}

export function useSpeciesDrafts(): SpeciesDraftRecord[] | undefined {
  return useLiveQuery(
    async () =>
      (await db.speciesDrafts.toArray())
        .filter((d) => d.deletedAt === null)
        .sort((a, b) => b.createdAt - a.createdAt),
    [],
  );
}

export function useSpeciesDraft(id: string): SpeciesDraftRecord | null | undefined {
  return useLiveQuery(async () => {
    const d = await db.speciesDrafts.get(id);
    return d && d.deletedAt === null ? d : null;
  }, [id]);
}

export function useLayouts(gardenId: string | undefined): Layout[] | undefined {
  return useLiveQuery(
    async () =>
      gardenId
        ? (await db.layouts.where('gardenId').equals(gardenId).toArray())
            .filter((l) => l.deletedAt === null)
            .sort((a, b) => b.updatedAt - a.updatedAt)
        : [],
    [gardenId],
  );
}

export function useLayout(id: string): Layout | null | undefined {
  return useLiveQuery(async () => {
    const l = await db.layouts.get(id);
    return l && l.deletedAt === null ? l : null;
  }, [id]);
}

export function useLayoutVersions(layoutId: string): LayoutVersion[] | undefined {
  return useLiveQuery(
    async () =>
      (await db.layoutVersions.where('layoutId').equals(layoutId).toArray()).sort(
        (a, b) => b.version - a.version,
      ),
    [layoutId],
  );
}

/** Nature visits for a garden, newest first. */
export function useNatureVisits(gardenId: string | undefined): NatureVisit[] | undefined {
  return useLiveQuery(
    async () =>
      gardenId
        ? (await db.natureVisits.where('gardenId').equals(gardenId).toArray())
            .filter((v) => v.deletedAt === null)
            .sort((a, b) => b.startedAt - a.startedAt)
        : [],
    [gardenId],
  );
}

export function usePantry(gardenId: string | undefined): PantryItem[] | undefined {
  return useLiveQuery(
    async () =>
      gardenId
        ? (await db.pantryItems.where('gardenId').equals(gardenId).toArray())
            .filter((p) => p.deletedAt === null)
            .sort((a, b) => b.updatedAt - a.updatedAt)
        : [],
    [gardenId],
  );
}

export function useHarvests(gardenId: string | undefined): Harvest[] | undefined {
  return useLiveQuery(
    async () =>
      gardenId
        ? (await db.harvests.where('gardenId').equals(gardenId).toArray())
            .filter((h) => h.deletedAt === null)
            .sort((a, b) => b.harvestedOn.localeCompare(a.harvestedOn) || b.createdAt - a.createdAt)
        : [],
    [gardenId],
  );
}

/** Every watering in a garden (for the Impact Ledger). */
export function useGardenCareEvents(gardenId: string | undefined): CareEvent[] | undefined {
  return useLiveQuery(
    async () =>
      gardenId
        ? (await db.careEvents.where('gardenId').equals(gardenId).toArray()).filter(
            (e) => e.deletedAt === null,
          )
        : [],
    [gardenId],
  );
}

export function useSeedLots(gardenId: string | undefined): SeedLot[] | undefined {
  return useLiveQuery(
    async () =>
      gardenId
        ? (await db.seedLots.where('gardenId').equals(gardenId).toArray())
            .filter(alive)
            .sort((a, b) => b.createdAt - a.createdAt)
        : undefined,
    [gardenId],
  );
}

export function useSeedLot(id: string | undefined): SeedLot | null | undefined {
  return useLiveQuery(async () => (id ? ((await db.seedLots.get(id)) ?? null) : undefined), [id]);
}

/** Every plant and seed lot in a garden, deleted ones included, for the family tree. */
export function useLineage(gardenId: string | undefined) {
  return useLiveQuery(
    async () =>
      gardenId
        ? {
            plants: await db.specimens.where('gardenId').equals(gardenId).toArray(),
            lots: await db.seedLots.where('gardenId').equals(gardenId).toArray(),
          }
        : undefined,
    [gardenId],
  );
}
