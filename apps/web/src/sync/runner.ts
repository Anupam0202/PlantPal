import { liveQuery } from 'dexie';
import { MAX_PUSH_OPS } from '@plantpal/sync';
import { db, getMeta, setMeta } from '../data/db';
import { accountsUnavailable, api, ApiError } from './api';
import { pullOnce, pushOnce, syncedWorkspaces, type Transport } from './engine';

export type SyncState = 'idle' | 'syncing' | 'offline' | 'signed-out' | 'unavailable' | 'error';
export interface SyncStatus {
  state: SyncState;
  lastSyncedAt: number | null;
  /** Workspaces this person can no longer reach (access removed). */
  revoked: string[];
}
export const STATUS_KEY = 'sync.status';
const EMPTY: SyncStatus = { state: 'idle', lastSyncedAt: null, revoked: [] };

const http: Transport = { push: api.push, pull: api.pull, snapshot: api.snapshot };
const CHANNEL = 'plantpal-sync';
const INTERVAL_MS = 60_000;
const DEBOUNCE_MS = 1_500;
const MAX_BACKOFF_MS = 5 * 60_000;

async function setStatus(patch: Partial<SyncStatus>) {
  const cur = (await getMeta<SyncStatus>(STATUS_KEY)) ?? EMPTY;
  await setMeta(STATUS_KEY, { ...cur, ...patch });
}

/**
 * Access to a shared garden was removed: its waiting changes can never be uploaded there, so they
 * move to "unsent", where the person can export or discard them (§14.3 revocation).
 */
async function revoke(workspaceId: string) {
  await db.transaction('rw', db.outbox, async () => {
    const ops = await db.outbox.where('workspaceId').equals(workspaceId).toArray();
    for (const op of ops)
      if (op.state === 'pending')
        await db.outbox.update(op.opId, {
          state: 'rejected',
          error: { code: 'FORBIDDEN', message: 'You no longer have access to this garden' },
        });
  });
  const cur = (await getMeta<SyncStatus>(STATUS_KEY)) ?? EMPTY;
  if (!cur.revoked.includes(workspaceId)) await setStatus({ revoked: [...cur.revoked, workspaceId] });
}

let running = false;
let again = false;
let backoff = 0;
let retry: ReturnType<typeof setTimeout> | undefined;

/** One full round: send everything waiting, then fetch every synced workspace. */
export async function syncNow(t: Transport = http): Promise<void> {
  if (running) {
    again = true;
    return;
  }
  running = true;
  clearTimeout(retry);
  try {
    const spaces = await syncedWorkspaces();
    if (spaces.length === 0) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      await setStatus({ state: 'offline' });
      return;
    }
    await setStatus({ state: 'syncing' });
    for (let i = 0; i < 50; i++) if ((await pushOnce(t)).sent < MAX_PUSH_OPS) break;
    for (const ws of spaces) {
      try {
        await pullOnce(t, ws.id);
      } catch (e) {
        if (e instanceof ApiError && e.status === 403) await revoke(ws.id);
        else throw e;
      }
    }
    backoff = 0;
    await setStatus({ state: 'idle', lastSyncedAt: Date.now() });
    void live?.refresh();
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) await setStatus({ state: 'signed-out' });
    else if (accountsUnavailable(e)) await setStatus({ state: 'unavailable' });
    else if (e instanceof ApiError && e.code === 'OFFLINE') await setStatus({ state: 'offline' });
    else {
      await setStatus({ state: 'error' });
      backoff = Math.min(backoff ? backoff * 2 : 5_000, MAX_BACKOFF_MS);
      retry = setTimeout(() => void syncNow(t), backoff);
    }
  } finally {
    running = false;
    if (again) {
      again = false;
      void syncNow(t);
    }
  }
}

/** ws(s)://host for the API: the app's own origin unless a separate API base is configured. */
function liveUrl(workspaceId: string): string {
  const base = String(import.meta.env.VITE_API_BASE_URL ?? '') || location.origin;
  const u = new URL(`/api/v1/workspaces/${encodeURIComponent(workspaceId)}/live`, base);
  u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
  return u.toString();
}

/**
 * Live "changed" pings from each synced garden's room (§14.3 realtime). They carry no data: a ping
 * just triggers a pull. Sockets reconnect with backoff; polling stays as the fallback.
 */
function liveSockets(onChange: () => void) {
  const sockets = new Map<string, WebSocket>();
  let stopped = false;
  const open = (workspaceId: string, attempt = 0) => {
    if (stopped || sockets.has(workspaceId) || typeof WebSocket === 'undefined') return;
    let s: WebSocket;
    try {
      s = new WebSocket(liveUrl(workspaceId));
    } catch {
      return;
    }
    sockets.set(workspaceId, s);
    let keepAlive: ReturnType<typeof setInterval> | undefined;
    s.onopen = () => {
      attempt = 0;
      keepAlive = setInterval(() => s.send('ping'), 30_000);
    };
    s.onmessage = (e) => {
      if (typeof e.data === 'string' && e.data.includes('"changed"')) onChange();
    };
    s.onclose = (e) => {
      clearInterval(keepAlive);
      sockets.delete(workspaceId);
      // 4003: access removed. Otherwise come back later; a sync on focus covers the gap.
      if (stopped || e.code === 4003) return;
      setTimeout(() => open(workspaceId, attempt + 1), Math.min(MAX_BACKOFF_MS, 2_000 * 2 ** attempt));
    };
  };
  return {
    async refresh() {
      for (const w of await syncedWorkspaces()) open(w.id);
    },
    stop() {
      stopped = true;
      for (const s of sockets.values()) s.close();
      sockets.clear();
    },
  };
}

let live: ReturnType<typeof liveSockets> | null = null;
let leading = false;
const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(CHANNEL);

/** Ask whichever tab leads to sync now (after sign-in, a claim, a join, a retry). */
export function requestSync() {
  if (leading) void syncNow();
  else channel?.postMessage('sync');
}

/**
 * Starts background sync. One tab leads (Web Locks); the others only ask it to run. The leader
 * syncs when changes are queued, on reconnect, on focus and every minute while visible.
 */
export function startSync(): () => void {
  let release: (() => void) | undefined;
  const lead = () =>
    new Promise<void>((done) => {
      leading = true;
      let debounce: ReturnType<typeof setTimeout> | undefined;
      const soon = () => {
        clearTimeout(debounce);
        debounce = setTimeout(() => void syncNow(), DEBOUNCE_MS);
      };
      live = liveSockets(soon);
      const waiting = liveQuery(() => db.outbox.where('state').equals('pending').count()).subscribe({
        next: (n) => {
          if (n > 0) soon();
        },
      });
      const visible = () => {
        if (document.visibilityState === 'visible') void syncNow();
      };
      const tick = setInterval(() => {
        if (document.visibilityState === 'visible') void syncNow();
      }, INTERVAL_MS);
      const online = () => void syncNow();
      const onMessage = (e: MessageEvent) => {
        if (e.data === 'sync') void syncNow();
      };
      window.addEventListener('online', online);
      document.addEventListener('visibilitychange', visible);
      channel?.addEventListener('message', onMessage);
      void syncNow();
      release = () => {
        leading = false;
        live?.stop();
        live = null;
        waiting.unsubscribe();
        clearInterval(tick);
        clearTimeout(debounce);
        window.removeEventListener('online', online);
        document.removeEventListener('visibilitychange', visible);
        channel?.removeEventListener('message', onMessage);
        done();
      };
    });
  if (typeof navigator !== 'undefined' && 'locks' in navigator)
    void navigator.locks.request('plantpal-sync-leader', lead);
  else void lead();
  return () => release?.();
}
