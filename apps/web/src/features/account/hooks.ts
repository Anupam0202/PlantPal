import { useQuery } from '@tanstack/react-query';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, getMeta } from '../../data/db';
import { useWorkspaceId } from '../../data/queries';
import { api, ApiError, type Me } from '../../sync/api';
import { CONFLICTS_KEY, reviewKey, type Conflict } from '../../sync/engine';
import { STATUS_KEY, type SyncStatus } from '../../sync/runner';

export type MeState =
  | { kind: 'loading' }
  | { kind: 'signed-out' }
  | { kind: 'unavailable' }
  | { kind: 'offline' }
  | { kind: 'signed-in'; me: Me };

/** Who is signed in, if anyone. Never retried in a loop; refetched after sign-in or sign-out. */
export function useMe(): { state: MeState; refetch: () => Promise<unknown> } {
  const q = useQuery({
    queryKey: ['me'],
    queryFn: async (): Promise<MeState> => {
      try {
        return { kind: 'signed-in', me: await api.me() };
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return { kind: 'signed-out' };
        if (e instanceof ApiError && e.code === 'OFFLINE') return { kind: 'offline' };
        return { kind: 'unavailable' };
      }
    },
    retry: false,
    staleTime: 60_000,
    networkMode: 'always',
  });
  return { state: q.data ?? { kind: 'loading' }, refetch: q.refetch };
}

export function useSyncStatus(): SyncStatus | undefined {
  return useLiveQuery(() => getMeta<SyncStatus>(STATUS_KEY), []);
}

export function useOutbox() {
  return useLiveQuery(async () => {
    const all = await db.outbox.toArray();
    return {
      pending: all.filter((o) => o.state === 'pending'),
      rejected: all.filter((o) => o.state === 'rejected').sort((a, b) => (a.opId < b.opId ? -1 : 1)),
    };
  }, []);
}

export function useConflicts(): Conflict[] | undefined {
  return useLiveQuery(async () => (await getMeta<Conflict[]>(CONFLICTS_KEY)) ?? [], []);
}

/** Workspaces on this device, and whether each waits for a review after a snapshot. */
export function useLocalWorkspaces() {
  const active = useWorkspaceId();
  const list = useLiveQuery(async () => {
    const all = await db.workspaces.toArray();
    return Promise.all(
      all.map(async (w) => ({ ...w, review: Boolean(await getMeta<boolean>(reviewKey(w.id))) })),
    );
  }, []);
  return { active, list };
}
