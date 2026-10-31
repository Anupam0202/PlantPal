import { useQuery } from '@tanstack/react-query';
import { community, type CommunityProfile, type Notice } from '../../community/api';
import { accountsUnavailable, ApiError } from '../../sync/api';

export type CommunityState =
  | { kind: 'loading' }
  | { kind: 'off' }
  | { kind: 'offline' }
  | { kind: 'unavailable' }
  | { kind: 'signed-out' }
  | {
      kind: 'ready';
      profile: CommunityProfile | null;
      staff: 'moderator' | 'admin' | null;
      notices: Notice[];
    };

export const COMMUNITY_KEY = ['community'] as const;

/** Is the community on, am I signed in, and do I have a profile? One request each, never retried in a loop. */
export function useCommunity(): CommunityState {
  const q = useQuery({
    queryKey: COMMUNITY_KEY,
    queryFn: async (): Promise<CommunityState> => {
      try {
        if (!(await community.status()).enabled) return { kind: 'off' };
        return { kind: 'ready', ...(await community.profile()) };
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return { kind: 'signed-out' };
        if (e instanceof ApiError && e.code === 'OFFLINE') return { kind: 'offline' };
        // No server here (a static host), or one without accounts: the community is simply not on.
        if (accountsUnavailable(e)) return { kind: 'off' };
        return { kind: 'unavailable' };
      }
    },
    retry: false,
    staleTime: 30_000,
    networkMode: 'always',
  });
  return q.data ?? { kind: 'loading' };
}

/** A server's explanation when it gave one (it names the rule that applied), else a friendly fallback. */
export function problemText(e: unknown, fallback: string): string {
  return e instanceof ApiError && e.message && e.code !== 'UNKNOWN' && e.code !== 'OFFLINE'
    ? e.message
    : fallback;
}

/** The H3 resolution-7 cell (about 5 km²) around a point, computed on this device. */
export async function coarseCell(lat: number, lon: number): Promise<string> {
  const { latLngToCell } = await import('h3-js');
  return latLngToCell(lat, lon, 7);
}
