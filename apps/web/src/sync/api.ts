import type { OutboxOp } from '@plantpal/schemas';
import type { PullResponse, PushResponse, Role, SnapshotResponse } from '@plantpal/sync';

/**
 * Account, sync and sharing calls. They go to the app's own origin: the Worker serves the app, so
 * the session cookie stays first-party (HttpOnly, SameSite=Lax). Nothing here carries a Gemini key.
 */
const BASE = String(import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** The server has no account support (no Worker, or no auth secret configured). */
export const accountsUnavailable = (e: unknown) =>
  e instanceof ApiError && (e.code === 'CONFIGURATION_REQUIRED' || e.status === 404 || e.status === 405);

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    throw new ApiError(0, 'OFFLINE', 'No connection');
  }
  if (res.status === 204) return undefined as T;
  // A static host answers unknown paths with the app's HTML: there is no API here.
  if (!(res.headers.get('content-type') ?? '').includes('json'))
    throw new ApiError(res.ok ? 404 : res.status, 'NOT_FOUND', 'No PlantPal server here');
  const data = (await res.json().catch(() => null)) as
    (Record<string, unknown> & { code?: string; detail?: string; title?: string; message?: string }) | null;
  if (!res.ok)
    throw new ApiError(
      res.status,
      String(data?.code ?? (res.status === 404 ? 'NOT_FOUND' : 'UNKNOWN')),
      String(data?.detail ?? data?.message ?? data?.title ?? res.statusText),
      typeof data?.retryAfterSeconds === 'number' ? data.retryAfterSeconds : undefined,
    );
  return data as T;
}

export interface Me {
  user: { id: string; name: string };
  workspaces: Array<{ id: string; name: string; role: Role }>;
}
export interface Member {
  userId: string;
  name: string | null;
  role: Role;
  createdAt: number;
}
export interface ShareLink {
  id: string;
  gardenId: string;
  label: string;
  zoneIds: string[];
  startsAt: number;
  expiresAt: number;
  revokedAt: number | null;
}
export interface SitterView {
  label: string;
  garden: { name: string; timezone: string };
  startsAt: number;
  expiresAt: number;
  plants: Array<{ id: string; name: string; zone: string }>;
  care: Array<{ specimenId: string | null; kind: string; occurredAt: number; amountMl: number | null }>;
}
export type SitterKind = 'water' | 'feed' | 'pest-check' | 'other';

const ws = (id: string) => `/api/v1/workspaces/${encodeURIComponent(id)}`;

export const api = {
  me: () => call<Me>('GET', '/api/v1/me'),
  claim: (id: string, name: string) =>
    call<{ id: string; name: string; role: Role }>('POST', '/api/v1/workspaces', { id, name }),

  push: (ops: OutboxOp[]) => call<PushResponse>('POST', '/api/v1/sync/push', { ops }),
  pull: (workspace: string, cursor: number, limit = 200) =>
    call<PullResponse>(
      'GET',
      `/api/v1/sync/pull?workspace=${encodeURIComponent(workspace)}&cursor=${cursor}&limit=${limit}`,
    ),
  snapshot: (workspace: string) =>
    call<SnapshotResponse>('GET', `/api/v1/sync/snapshot?workspace=${encodeURIComponent(workspace)}`),

  members: (id: string) => call<{ members: Member[] }>('GET', `${ws(id)}/members`),
  setRole: (id: string, userId: string, role: Role) =>
    call<Member>('PATCH', `${ws(id)}/members/${encodeURIComponent(userId)}`, { role }),
  removeMember: (id: string, userId: string) =>
    call<void>('DELETE', `${ws(id)}/members/${encodeURIComponent(userId)}`),
  invite: (id: string, role: Exclude<Role, 'owner'>, ttlHours: number) =>
    call<{ token: string; expiresAt: number; role: Role }>('POST', `${ws(id)}/invitations`, {
      role,
      ttlHours,
    }),
  accept: (token: string) =>
    call<{ workspaceId: string; role: Role }>('POST', '/api/v1/invitations/accept', { token }),

  shareLinks: (id: string) => call<{ links: ShareLink[] }>('GET', `${ws(id)}/share-links`),
  createShareLink: (
    id: string,
    input: { gardenId: string; zoneIds: string[]; label: string; startsAt: number; expiresAt: number },
  ) => call<ShareLink & { token: string }>('POST', `${ws(id)}/share-links`, input),
  revokeShareLink: (id: string, linkId: string) =>
    call<void>('DELETE', `${ws(id)}/share-links/${encodeURIComponent(linkId)}`),
  linkSummary: (id: string, linkId: string) =>
    call<{ care: Array<Record<string, unknown>> }>(
      'GET',
      `${ws(id)}/share-links/${encodeURIComponent(linkId)}/summary`,
    ),

  sitterView: (token: string) => call<SitterView>('GET', `/api/v1/share/${encodeURIComponent(token)}`),
  sitterCare: (
    token: string,
    input: { specimenId: string; kind: SitterKind; amountMl?: number | null; notes?: string },
  ) => call<{ id: string }>('POST', `/api/v1/share/${encodeURIComponent(token)}/care`, input),
};
