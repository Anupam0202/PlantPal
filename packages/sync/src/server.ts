import type { OutboxOp } from '@plantpal/schemas';
import { payloadHash } from './hash';
import {
  MAX_PULL_LIMIT,
  type Change,
  type OpCode,
  type OpResult,
  type PullResponse,
  type Role,
  type SnapshotResponse,
} from './protocol';
import { ENTITIES, isEntityName, referencedIds, type EntityName } from './registry';
import { canRead, canWrite, type Action } from './roles';

export interface StoredRecord {
  workspaceId: string;
  entity: EntityName;
  id: string;
  version: number;
  deletedAt: number | null;
  dedupeKey: string | null;
  record: Record<string, unknown>;
}

/** One atomic write: the record, its change-log entry and the idempotency entry (§14.3). */
export interface Mutation {
  record: StoredRecord;
  change: { op: 'upsert' | 'delete'; at: number };
  idempotency: {
    opId: string;
    actorId: string;
    payloadHash: string;
    result: OpResult;
    /** What the op touched: an audit trail of who changed which record. */
    entity: string;
    entityId: string;
  };
}

/** Storage the sync service needs; D1 in the Worker, memory in tests. */
export interface SyncRepo {
  getRecord(entity: EntityName, id: string): Promise<StoredRecord | null>;
  findLiveByDedupeKey(workspaceId: string, entity: EntityName, key: string): Promise<StoredRecord | null>;
  getIdempotency(opId: string): Promise<{ payloadHash: string; result: OpResult } | null>;
  saveIdempotency(entry: Mutation['idempotency']): Promise<void>;
  apply(m: Mutation): Promise<void>;
  changesSince(
    workspaceId: string,
    cursor: number,
    limit: number,
  ): Promise<
    Array<{ seq: number; entity: EntityName; id: string; op: 'upsert' | 'delete'; version: number }>
  >;
  /** Records an actor changed (applied ops only), newest first: the plant-sitter summary. */
  appliedBy(actorId: string): Promise<Array<{ entity: string; entityId: string }>>;
  /** Changes before this seq were pruned; older cursors need a snapshot. */
  changeFloor(workspaceId: string): Promise<number>;
  latestSeq(workspaceId: string): Promise<number>;
  liveRecords(workspaceId: string): Promise<StoredRecord[]>;
}

/** The person (or link) acting, with their role in the target workspace. */
export interface Actor {
  id: string;
  role: Role | null;
}

const result = (
  opId: string,
  status: OpResult['status'],
  extra: Partial<Omit<OpResult, 'opId' | 'status'>> = {},
): OpResult => ({
  opId,
  status,
  version: null,
  code: null,
  message: null,
  server: null,
  existingId: null,
  ...extra,
});
const reject = (opId: string, code: OpCode, message: string) => result(opId, 'rejected', { code, message });

function actionOf(op: OutboxOp): Action | null {
  const a = op.type.split('.')[1];
  return a === 'create' || a === 'update' || a === 'delete' || a === 'void' ? a : null;
}

/**
 * Applies one op: authorise → validate → check related ids → idempotency → conflict policy → write.
 * Every check runs on every op; nothing a client says about its own role is trusted.
 */
export async function applyOp(repo: SyncRepo, actor: Actor, op: OutboxOp, now: number): Promise<OpResult> {
  const [entityName] = op.type.split('.');
  const action = actionOf(op);
  if (!entityName || !isEntityName(entityName) || !action)
    return reject(op.opId, 'UNKNOWN_ENTITY', `Unknown operation ${op.type}`);
  const entity: EntityName = entityName;
  const spec = ENTITIES[entity];
  if (!actor.role || !canWrite(actor.role, entity, action))
    return reject(op.opId, 'FORBIDDEN', 'Your role in this garden does not allow this change');
  if ((action === 'void') !== (spec.kind === 'append') && action !== 'create') {
    return reject(op.opId, 'VALIDATION_FAILED', `${op.type} is not valid for ${spec.kind} records`);
  }

  const hash = await payloadHash({
    type: op.type,
    entityId: op.entityId,
    payload: op.payload,
    base: op.baseVersion,
  });
  const seen = await repo.getIdempotency(op.opId);
  if (seen) {
    if (seen.payloadHash !== hash)
      return reject(op.opId, 'IDEMPOTENCY_CONFLICT', 'This operation id was already used for different data');
    return { ...seen.result, status: seen.result.status === 'applied' ? 'duplicate' : seen.result.status };
  }

  const current = await repo.getRecord(entity, op.entityId);
  if (current && current.workspaceId !== op.workspaceId)
    return reject(op.opId, 'FORBIDDEN', 'That record belongs to another workspace');

  const finish = async (r: OpResult, write?: { record: StoredRecord; op: 'upsert' | 'delete' }) => {
    const idem = {
      opId: op.opId,
      actorId: actor.id,
      payloadHash: hash,
      result: r,
      entity,
      entityId: op.entityId,
    };
    if (write)
      await repo.apply({ record: write.record, change: { op: write.op, at: now }, idempotency: idem });
    else await repo.saveIdempotency(idem);
    return r;
  };

  // Deletes and voids carry no payload: tombstone the record (idempotently).
  if (action === 'delete' || action === 'void') {
    if (!current) return reject(op.opId, 'NOT_FOUND', 'Nothing to remove');
    if (current.deletedAt !== null) return finish(result(op.opId, 'duplicate', { version: current.version }));
    if (action === 'delete' && op.baseVersion !== current.version)
      return result(op.opId, 'conflict', {
        code: 'VERSION_CONFLICT',
        version: current.version,
        server: current.record,
        message: 'Changed on another device',
      });
    const version = spec.kind === 'versioned' ? current.version + 1 : current.version;
    const record = {
      ...current.record,
      deletedAt: now,
      ...(spec.kind === 'versioned' ? { version, updatedAt: now } : {}),
    };
    return finish(result(op.opId, 'applied', { version }), {
      record: { ...current, version, deletedAt: now, record },
      op: 'delete',
    });
  }

  const parsed = spec.schema.safeParse(op.payload);
  if (!parsed.success)
    return reject(op.opId, 'VALIDATION_FAILED', parsed.error.issues[0]?.message ?? 'Invalid record');
  const record = parsed.data as Record<string, unknown>;
  if (record.id !== op.entityId || record.workspaceId !== op.workspaceId)
    return reject(op.opId, 'VALIDATION_FAILED', 'The record id or workspace does not match the operation');

  // A second completion of the same task is a duplicate even when it points at records the first
  // completion made redundant (its own care event), so de-duplicate before checking references.
  const key = action === 'create' && !current ? spec.dedupeKey?.(record) : null;
  if (key) {
    const winner = await repo.findLiveByDedupeKey(op.workspaceId, entity, key);
    if (winner)
      return finish(
        result(op.opId, 'duplicate', {
          existingId: winner.id,
          version: winner.version,
          message: 'Already done by someone else',
        }),
      );
  }

  for (const ref of referencedIds(entity, record)) {
    const target = await repo.getRecord(ref.entity, ref.id);
    if (!target) return reject(op.opId, 'NOT_FOUND', `Referenced ${ref.entity} ${ref.id} is unknown`);
    if (target.workspaceId !== op.workspaceId)
      return reject(op.opId, 'FORBIDDEN', `Referenced ${ref.entity} belongs to another workspace`);
  }

  const version = spec.kind === 'versioned' ? (record.version as number) : 1;
  const stored = (): StoredRecord => ({
    workspaceId: op.workspaceId,
    entity,
    id: op.entityId,
    version,
    deletedAt: (record.deletedAt as number | null | undefined) ?? null,
    dedupeKey: spec.dedupeKey?.(record) ?? null,
    record,
  });

  if (action === 'create') {
    if (current) {
      const same = (await payloadHash(current.record)) === (await payloadHash(record));
      return same
        ? finish(result(op.opId, 'duplicate', { version: current.version }))
        : result(op.opId, 'conflict', {
            code: 'VERSION_CONFLICT',
            version: current.version,
            server: current.record,
            message: 'A different record already has this id',
          });
    }
    if (spec.kind === 'versioned' && version !== 1)
      return reject(op.opId, 'VALIDATION_FAILED', 'A new record starts at version 1');
    return finish(result(op.opId, 'applied', { version }), { record: stored(), op: 'upsert' });
  }

  // update (versioned only)
  if (spec.kind !== 'versioned')
    return reject(op.opId, 'VALIDATION_FAILED', 'Append-only records are never edited');
  if (!current) return reject(op.opId, 'NOT_FOUND', 'Nothing to update');
  if (current.deletedAt !== null)
    return result(op.opId, 'conflict', {
      code: 'VERSION_CONFLICT',
      version: current.version,
      server: current.record,
      message: 'It was deleted on another device',
    });
  if (op.baseVersion !== current.version || version !== current.version + 1)
    return result(op.opId, 'conflict', {
      code: 'VERSION_CONFLICT',
      version: current.version,
      server: current.record,
      message: 'Changed on another device',
    });
  return finish(result(op.opId, 'applied', { version }), { record: stored(), op: 'upsert' });
}

/** Applies ops in order. Ops for different workspaces in one push are each checked on their own. */
export async function applyPush(
  repo: SyncRepo,
  roleIn: (workspaceId: string) => Promise<Role | null>,
  actorId: string,
  ops: readonly OutboxOp[],
  now: number,
): Promise<OpResult[]> {
  const roles = new Map<string, Role | null>();
  const out: OpResult[] = [];
  for (const op of ops) {
    if (!roles.has(op.workspaceId)) roles.set(op.workspaceId, await roleIn(op.workspaceId));
    out.push(await applyOp(repo, { id: actorId, role: roles.get(op.workspaceId) ?? null }, op, now));
  }
  return out;
}

export class SyncAccessError extends Error {
  constructor(readonly code: 'FORBIDDEN' | 'SNAPSHOT_REQUIRED') {
    super(code);
    this.name = 'SyncAccessError';
  }
}

/** Changes since `cursor`, with each record as the server holds it now (tombstones included). */
export async function pullChanges(
  repo: SyncRepo,
  role: Role | null,
  workspaceId: string,
  cursor: number,
  limit = 100,
): Promise<PullResponse> {
  if (!canRead(role)) throw new SyncAccessError('FORBIDDEN');
  // The floor is one past the newest pruned change: a cursor right below it has missed nothing.
  if (cursor > 0 && cursor + 1 < (await repo.changeFloor(workspaceId)))
    throw new SyncAccessError('SNAPSHOT_REQUIRED');
  const n = Math.min(Math.max(1, limit), MAX_PULL_LIMIT);
  const rows = await repo.changesSince(workspaceId, cursor, n + 1);
  const page = rows.slice(0, n);
  const changes: Change[] = [];
  for (const c of page) {
    const r = await repo.getRecord(c.entity, c.id);
    changes.push({ ...c, record: r?.record ?? null });
  }
  return { changes, cursor: page.at(-1)?.seq ?? cursor, hasMore: rows.length > n };
}

export async function snapshot(
  repo: SyncRepo,
  role: Role | null,
  workspaceId: string,
): Promise<SnapshotResponse> {
  if (!canRead(role)) throw new SyncAccessError('FORBIDDEN');
  const cursor = await repo.latestSeq(workspaceId);
  const records = (await repo.liveRecords(workspaceId)).map((r) => ({
    entity: r.entity,
    id: r.id,
    version: r.version,
    record: r.record,
  }));
  return { workspaceId, cursor, records };
}
