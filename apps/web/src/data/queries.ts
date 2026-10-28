import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type {
  CareEvent,
  Container,
  Garden,
  Harvest,
  LegacyAchievements,
  Media,
  Observation,
  Specimen,
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
