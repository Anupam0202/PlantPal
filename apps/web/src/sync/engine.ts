import { newId } from '@plantpal/domain';
import type { OutboxOp, Workspace } from '@plantpal/schemas';
import {
  ENTITIES,
  isEntityName,
  MAX_PUSH_OPS,
  type Change,
  type EntityName,
  type OpResult,
  type PullResponse,
  type PushResponse,
  type SnapshotResponse,
} from '@plantpal/sync';
import { CLIENT_SCHEMA, db, getMeta, setMeta, type RecordTable } from '../data/db';

/** What the engine needs from the server: HTTP in the app, the real server logic in tests. */
export interface Transport {
  push(ops: OutboxOp[]): Promise<PushResponse>;
  pull(workspace: string, cursor: number, limit?: number): Promise<PullResponse>;
  snapshot(workspace: string): Promise<SnapshotResponse>;
}

export const TABLE: Record<EntityName, RecordTable> = {
  garden: 'gardens',
  zone: 'zones',
  container: 'containers',
  specimen: 'specimens',
  careEvent: 'careEvents',
  observation: 'observations',
  harvest: 'harvests',
  healthCase: 'healthCases',
  plan: 'plans',
  planItem: 'planItems',
  careSchedule: 'careSchedules',
  taskLog: 'taskLogs',
  layout: 'layouts',
  natureVisit: 'natureVisits',
  pantryItem: 'pantryItems',
};

/** Referenced records first, so every upload's references already exist on the server. */
export const UPLOAD_ORDER: readonly EntityName[] = [
  'garden',
  'zone',
  'container',
  'specimen',
  'careSchedule',
  'careEvent',
  'taskLog',
  'observation',
  'harvest',
  'pantryItem',
  'healthCase',
  'plan',
  'planItem',
  'layout',
  'natureVisit',
];

const SYNCED_TABLES = () => Object.values(TABLE).map((t) => db.table(t));
type Row = Record<string, unknown> & { id: string; workspaceId: string; version?: number };

export const cursorKey = (ws: string) => `sync.cursor.${ws}`;
/** Set after a snapshot replaced local data while changes were waiting: the person reviews them first. */
export const reviewKey = (ws: string) => `sync.review.${ws}`;
export const CONFLICTS_KEY = 'sync.conflicts';

/** A change of mine the server did not take because the record changed elsewhere first. */
export interface Conflict {
  id: string;
  workspaceId: string;
  entity: EntityName;
  entityId: string;
  action: 'create' | 'update' | 'delete';
  /** My last version of the record; null when I deleted it. */
  mine: Row | null;
  /** The server's copy, now on this device. */
  theirs: Row | null;
  at: number;
}

export const conflicts = async () => (await getMeta<Conflict[]>(CONFLICTS_KEY)) ?? [];

const entityOf = (op: OutboxOp) => op.type.split('.')[0] ?? '';
const actionOf = (op: OutboxOp) => op.type.split('.')[1] ?? '';
const send = ({ error: _local, ...op }: OutboxOp): OutboxOp => op;

export interface PushSummary {
  sent: number;
  applied: number;
  conflicts: number;
  rejected: number;
}

/** Sends up to 100 waiting changes and settles each result on this device. */
export async function pushOnce(t: Transport, now = Date.now()): Promise<PushSummary> {
  const summary: PushSummary = { sent: 0, applied: 0, conflicts: 0, rejected: 0 };
  const pending = await db.outbox.where('state').equals('pending').toArray();
  const paused = new Set<string>();
  for (const ws of new Set(pending.map((o) => o.workspaceId)))
    if (await getMeta<boolean>(reviewKey(ws))) paused.add(ws);
  // Outbox ids are monotonic ULIDs, so id order is the order the changes were made.
  const batch = pending
    .filter((o) => !paused.has(o.workspaceId))
    .sort((a, b) => (a.opId < b.opId ? -1 : 1))
    .slice(0, MAX_PUSH_OPS);
  if (batch.length === 0) return summary;
  const { results } = await t.push(batch.map(send));
  const byId = new Map(results.map((r) => [r.opId, r]));
  summary.sent = batch.length;
  for (const op of batch) {
    const r = byId.get(op.opId);
    if (!r) continue;
    if (r.status === 'applied' || r.status === 'duplicate') summary.applied++;
    if (r.status === 'conflict') summary.conflicts++;
    if (r.status === 'rejected') summary.rejected++;
    await settle(op, r, now);
  }
  return summary;
}

async function settle(op: OutboxOp, r: OpResult, now: number) {
  const entity = entityOf(op);
  if (!isEntityName(entity)) return;
  const table = db.table(TABLE[entity]);
  await db.transaction('rw', [db.outbox, db.meta, table], async () => {
    // A later push may already have settled this op (another tab, a retry).
    if (!(await db.outbox.get(op.opId))) return;
    if (r.status === 'applied') {
      await db.outbox.delete(op.opId);
      return;
    }
    if (r.status === 'duplicate') {
      await db.outbox.delete(op.opId);
      // Someone else completed the same task first: theirs is the record everyone keeps.
      if (r.existingId && r.existingId !== op.entityId && ENTITIES[entity].dedupeKey)
        await table.delete(op.entityId);
      return;
    }
    if (r.status === 'rejected') {
      await db.outbox.update(op.opId, {
        state: 'rejected',
        error: { code: r.code ?? 'VALIDATION_FAILED', message: (r.message ?? '').slice(0, 500) },
      });
      return;
    }
    // Conflict: the server copy wins on this device; my latest version is kept for review.
    const later = (await db.outbox.where('workspaceId').equals(op.workspaceId).toArray()).filter(
      (o) => o.state === 'pending' && o.entityId === op.entityId && entityOf(o) === entity,
    );
    const last = later.sort((a, b) => (a.opId < b.opId ? -1 : 1)).at(-1) ?? op;
    const mine = actionOf(last) === 'delete' ? null : ((last.payload as Row | null) ?? null);
    const theirs = (r.server as Row | null) ?? null;
    await db.outbox.bulkDelete(later.map((o) => o.opId).concat(op.opId));
    if (theirs) await table.put(theirs);
    const list = await conflicts();
    const entry: Conflict = {
      id: op.opId,
      workspaceId: op.workspaceId,
      entity,
      entityId: op.entityId,
      action: actionOf(last) as Conflict['action'],
      mine,
      theirs,
      at: now,
    };
    await setMeta(CONFLICTS_KEY, [...list.filter((c) => c.entityId !== op.entityId), entry]);
  });
}

/** Applies the server's records, leaving alone anything with a change still waiting to be sent. */
async function applyRecords(ws: string, rows: Array<Pick<Change, 'entity' | 'id' | 'version' | 'record'>>) {
  await db.transaction('rw', [db.outbox, ...SYNCED_TABLES()], async () => {
    const waiting = new Set(
      (await db.outbox.where('workspaceId').equals(ws).toArray())
        .filter((o) => o.state === 'pending')
        .map((o) => o.entityId),
    );
    for (const c of rows) {
      const record = c.record as Row | null;
      if (!isEntityName(c.entity) || !record || waiting.has(c.id)) continue;
      if (record.workspaceId !== ws) continue;
      const table = db.table(TABLE[c.entity]);
      const local = (await table.get(c.id)) as Row | undefined;
      if (local && ENTITIES[c.entity].kind === 'versioned' && (local.version ?? 0) > c.version) continue;
      await table.put(record);
    }
  });
}

const snapshotNeeded = (e: unknown) =>
  typeof e === 'object' && e !== null && (e as { code?: string }).code === 'SNAPSHOT_REQUIRED';

/** Fetches every change since this device's cursor; falls back to a snapshot when it is too old. */
export async function pullOnce(t: Transport, ws: string): Promise<{ changes: number; snapshot: boolean }> {
  let cursor = (await getMeta<number>(cursorKey(ws))) ?? 0;
  let changes = 0;
  for (;;) {
    let page: PullResponse;
    try {
      page = await t.pull(ws, cursor, 200);
    } catch (e) {
      if (!snapshotNeeded(e)) throw e;
      await applySnapshot(t, ws);
      return { changes, snapshot: true };
    }
    await applyRecords(ws, page.changes);
    changes += page.changes.length;
    cursor = page.cursor;
    await setMeta(cursorKey(ws), cursor);
    if (!page.hasMore) return { changes, snapshot: false };
  }
}

/**
 * Replaces this device's copy of a workspace with the server's. Records with a change still
 * waiting (or refused) stay, and waiting changes pause until the person has reviewed them.
 */
export async function applySnapshot(t: Transport, ws: string) {
  const snap = await t.snapshot(ws);
  const keep = new Set(snap.records.map((r) => r.id));
  await db.transaction('rw', [db.outbox, db.meta, ...SYNCED_TABLES()], async () => {
    const ops = await db.outbox.where('workspaceId').equals(ws).toArray();
    const touched = new Set(ops.map((o) => o.entityId));
    for (const name of Object.values(TABLE)) {
      const table = db.table(name);
      const stale = (await table.where('workspaceId').equals(ws).primaryKeys()) as string[];
      await table.bulkDelete(stale.filter((id) => !keep.has(id) && !touched.has(id)));
    }
    await setMeta(cursorKey(ws), snap.cursor);
    if (ops.some((o) => o.state === 'pending')) await setMeta(reviewKey(ws), true);
  });
  await applyRecords(ws, snap.records);
}

/** The person checked the waiting changes after a snapshot: send them again. */
export async function resumeAfterReview(ws: string) {
  await db.meta.delete(reviewKey(ws));
}

/**
 * Turns this device's guest workspace into a synced one (§14.3 "guest → account"): every record is
 * queued as a create, through the same validated push path. Versions restart at 1, since no other
 * device has these records yet.
 */
export async function queueClaim(ws: Workspace, now = Date.now()) {
  await db.transaction('rw', [db.workspaces, db.outbox, db.meta, ...SYNCED_TABLES()], async () => {
    for (const entity of UPLOAD_ORDER) {
      const table = db.table(TABLE[entity]);
      let rows = (await table.where('workspaceId').equals(ws.id).toArray()) as Row[];
      if (entity === 'specimen') rows = parentsFirst(rows);
      for (const row of rows) {
        const record = ENTITIES[entity].kind === 'versioned' ? { ...row, version: 1 } : row;
        if (record !== row) await table.put(record);
        await db.outbox.add({
          opId: newId(now),
          workspaceId: ws.id,
          type: `${entity}.create`,
          entityId: row.id,
          payload: record,
          baseVersion: null,
          createdAt: now,
          clientSchema: CLIENT_SCHEMA,
          state: 'pending',
        });
      }
    }
    await db.workspaces.put({ ...ws, mode: 'synced', updatedAt: now });
    await setMeta(cursorKey(ws.id), 0);
  });
}

/** Cuttings and divisions point at their parent plant, which must be uploaded first. */
function parentsFirst(rows: Row[]): Row[] {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const out: Row[] = [];
  const seen = new Set<string>();
  const visit = (r: Row) => {
    if (seen.has(r.id)) return;
    seen.add(r.id);
    const parent = typeof r.parentSpecimenId === 'string' ? byId.get(r.parentSpecimenId) : undefined;
    if (parent) visit(parent);
    out.push(r);
  };
  rows.forEach(visit);
  return out;
}

/** Adds a workspace someone shared with me, fills it from the server, and switches to it. */
export async function joinWorkspace(t: Transport, ws: { id: string; name: string }, now = Date.now()) {
  if (!(await db.workspaces.get(ws.id)))
    await db.workspaces.put({
      id: ws.id,
      name: ws.name,
      mode: 'synced',
      createdAt: now,
      updatedAt: now,
      version: 1,
    });
  await applySnapshot(t, ws.id);
  await setMeta('activeWorkspaceId', ws.id);
  await setMeta('activeGardenId', null);
}

/** Keep the server's copy: forget my version. */
export async function keepTheirs(conflictId: string) {
  await setMeta(
    CONFLICTS_KEY,
    (await conflicts()).filter((c) => c.id !== conflictId),
  );
}

/** Keep my version: re-apply it on top of the server's copy, as a normal change. */
export async function keepMine(conflictId: string, now = Date.now()) {
  const c = (await conflicts()).find((x) => x.id === conflictId);
  if (!c) return;
  const spec = ENTITIES[c.entity];
  const table = db.table(TABLE[c.entity]);
  await db.transaction('rw', [db.outbox, db.meta, table], async () => {
    const current = (await table.get(c.entityId)) as Row | undefined;
    if (spec.kind === 'versioned' && current && c.action !== 'create') {
      const base = current.version ?? 1;
      if (c.mine === null) {
        await table.put({ ...current, deletedAt: now, updatedAt: now, version: base + 1 });
        await queue(c, 'delete', null, base, now);
      } else {
        const next = spec.schema.parse({ ...c.mine, version: base + 1, updatedAt: now }) as Row;
        await table.put(next);
        await queue(c, 'update', next, base, now);
      }
    }
    await setMeta(
      CONFLICTS_KEY,
      (await conflicts()).filter((x) => x.id !== conflictId),
    );
  });
}

async function queue(c: Conflict, action: string, payload: unknown, baseVersion: number, now: number) {
  await db.outbox.add({
    opId: newId(now),
    workspaceId: c.workspaceId,
    type: `${c.entity}.${action}`,
    entityId: c.entityId,
    payload,
    baseVersion,
    createdAt: now,
    clientSchema: CLIENT_SCHEMA,
    state: 'pending',
  });
}

/** Refused changes are never retried on their own; the person discards or retries them. */
export async function discardUnsent(opIds: string[]) {
  await db.outbox.bulkDelete(opIds);
}

export async function retryUnsent(opIds: string[]) {
  await db.transaction('rw', db.outbox, async () => {
    for (const id of opIds) await db.outbox.update(id, { state: 'pending', error: null });
  });
}

export const syncedWorkspaces = () => db.workspaces.filter((w) => w.mode === 'synced').toArray();
