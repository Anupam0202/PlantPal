import type { OpResult } from './protocol';
import type { EntityName } from './registry';
import type { Mutation, StoredRecord, SyncRepo } from './server';

/** In-memory SyncRepo for tests and local tools. */
export class MemorySyncRepo implements SyncRepo {
  records = new Map<string, StoredRecord>();
  changes: Array<{
    seq: number;
    workspaceId: string;
    entity: EntityName;
    id: string;
    op: 'upsert' | 'delete';
    version: number;
    at: number;
  }> = [];
  idem = new Map<string, { payloadHash: string; result: OpResult }>();
  floors = new Map<string, number>();
  private seq = 0;
  private key = (e: string, id: string) => `${e}:${id}`;

  async getRecord(entity: EntityName, id: string) {
    return this.records.get(this.key(entity, id)) ?? null;
  }
  async findLiveByDedupeKey(workspaceId: string, entity: EntityName, key: string) {
    for (const r of this.records.values())
      if (r.workspaceId === workspaceId && r.entity === entity && r.dedupeKey === key && r.deletedAt === null)
        return r;
    return null;
  }
  async getIdempotency(opId: string) {
    return this.idem.get(opId) ?? null;
  }
  async saveIdempotency(e: Mutation['idempotency']) {
    this.idem.set(e.opId, { payloadHash: e.payloadHash, result: e.result });
  }
  async apply(m: Mutation) {
    this.records.set(this.key(m.record.entity, m.record.id), m.record);
    this.changes.push({
      seq: ++this.seq,
      workspaceId: m.record.workspaceId,
      entity: m.record.entity,
      id: m.record.id,
      op: m.change.op,
      version: m.record.version,
      at: m.change.at,
    });
    await this.saveIdempotency(m.idempotency);
  }
  async changesSince(workspaceId: string, cursor: number, limit: number) {
    return this.changes
      .filter((c) => c.workspaceId === workspaceId && c.seq > cursor)
      .slice(0, limit)
      .map(({ seq, entity, id, op, version }) => ({ seq, entity, id, op, version }));
  }
  async changeFloor(workspaceId: string) {
    return this.floors.get(workspaceId) ?? 0;
  }
  async latestSeq(workspaceId: string) {
    return this.changes.filter((c) => c.workspaceId === workspaceId).at(-1)?.seq ?? 0;
  }
  async liveRecords(workspaceId: string) {
    return [...this.records.values()].filter((r) => r.workspaceId === workspaceId && r.deletedAt === null);
  }
  /** Drops change rows older than `before` (epoch ms); older cursors then need a snapshot. */
  prune(workspaceId: string, before: number) {
    const keep = this.changes.filter((c) => c.workspaceId !== workspaceId || c.at >= before);
    const dropped = this.changes.filter((c) => c.workspaceId === workspaceId && c.at < before);
    if (dropped.length) this.floors.set(workspaceId, Math.max(...dropped.map((c) => c.seq)) + 1);
    this.changes = keep;
  }
}
