import { and, asc, desc, eq, gt, isNull, lt, lte, max, sql } from 'drizzle-orm';
import { drizzle, type DrizzleD1Database } from 'drizzle-orm/d1';
import { idempotency, records, syncChanges, workspaces } from '@plantpal/db';
import type { EntityName, Mutation, OpResult, StoredRecord, SyncRepo } from '@plantpal/sync';

type Row = typeof records.$inferSelect;

const toStored = (r: Row): StoredRecord => ({
  workspaceId: r.workspaceId,
  entity: r.entity as EntityName,
  id: r.id,
  version: r.version,
  deletedAt: r.deletedAt,
  dedupeKey: r.dedupeKey,
  record: JSON.parse(r.payload) as Record<string, unknown>,
});

/** SyncRepo on D1. Each op is one `batch()`: record, change-log row and idempotency row together. */
export class D1SyncRepo implements SyncRepo {
  private readonly db: DrizzleD1Database;
  constructor(d1: D1Database) {
    this.db = drizzle(d1);
  }

  async getRecord(entity: EntityName, id: string) {
    const [r] = await this.db
      .select()
      .from(records)
      .where(and(eq(records.entity, entity), eq(records.id, id)))
      .limit(1);
    return r ? toStored(r) : null;
  }

  async findLiveByDedupeKey(workspaceId: string, entity: EntityName, key: string) {
    const [r] = await this.db
      .select()
      .from(records)
      .where(
        and(
          eq(records.workspaceId, workspaceId),
          eq(records.entity, entity),
          eq(records.dedupeKey, key),
          isNull(records.deletedAt),
        ),
      )
      .limit(1);
    return r ? toStored(r) : null;
  }

  async getIdempotency(opId: string) {
    const [r] = await this.db.select().from(idempotency).where(eq(idempotency.opId, opId)).limit(1);
    return r ? { payloadHash: r.payloadHash, result: JSON.parse(r.result) as OpResult } : null;
  }

  private idemInsert(e: Mutation['idempotency'], at: number) {
    return this.db
      .insert(idempotency)
      .values({
        opId: e.opId,
        actorId: e.actorId,
        payloadHash: e.payloadHash,
        result: JSON.stringify(e.result),
        entity: e.entity,
        entityId: e.entityId,
        at,
      })
      .onConflictDoNothing();
  }

  async saveIdempotency(e: Mutation['idempotency']) {
    await this.idemInsert(e, Date.now());
  }

  async apply(m: Mutation) {
    const r = m.record;
    const row = {
      entity: r.entity,
      id: r.id,
      workspaceId: r.workspaceId,
      version: r.version,
      deletedAt: r.deletedAt,
      dedupeKey: r.dedupeKey,
      payload: JSON.stringify(r.record),
      updatedAt: m.change.at,
    };
    await this.db.batch([
      this.db
        .insert(records)
        .values(row)
        .onConflictDoUpdate({
          target: [records.entity, records.id],
          set: {
            version: row.version,
            deletedAt: row.deletedAt,
            dedupeKey: row.dedupeKey,
            payload: row.payload,
            updatedAt: row.updatedAt,
          },
        }),
      this.db.insert(syncChanges).values({
        workspaceId: r.workspaceId,
        entity: r.entity,
        entityId: r.id,
        op: m.change.op,
        version: r.version,
        at: m.change.at,
      }),
      this.idemInsert(m.idempotency, m.change.at),
    ]);
  }

  async appliedBy(actorId: string) {
    const rows = await this.db
      .select({ entity: idempotency.entity, entityId: idempotency.entityId, result: idempotency.result })
      .from(idempotency)
      .where(eq(idempotency.actorId, actorId))
      .orderBy(desc(idempotency.at));
    return rows
      .filter((r) => (JSON.parse(r.result) as OpResult).status === 'applied')
      .map(({ entity, entityId }) => ({ entity, entityId }));
  }

  async changesSince(workspaceId: string, cursor: number, limit: number) {
    const rows = await this.db
      .select()
      .from(syncChanges)
      .where(and(eq(syncChanges.workspaceId, workspaceId), gt(syncChanges.seq, cursor)))
      .orderBy(asc(syncChanges.seq))
      .limit(limit);
    return rows.map((c) => ({
      seq: c.seq,
      entity: c.entity as EntityName,
      id: c.entityId,
      op: c.op,
      version: c.version,
    }));
  }

  async changeFloor(workspaceId: string) {
    const [w] = await this.db
      .select({ f: workspaces.changeFloor })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);
    return w?.f ?? 0;
  }

  async latestSeq(workspaceId: string) {
    const [r] = await this.db
      .select({ s: max(syncChanges.seq) })
      .from(syncChanges)
      .where(eq(syncChanges.workspaceId, workspaceId));
    return r?.s ?? 0;
  }

  /**
   * Tombstone horizon (§14.3): drops change rows and idempotency entries older than `before`.
   * Each workspace's floor moves past what was dropped; devices behind it fetch a snapshot.
   * Records themselves (and their tombstones) stay.
   */
  async prune(before: number): Promise<{ workspaces: number }> {
    const floors = await this.db
      .select({ ws: syncChanges.workspaceId, seq: max(syncChanges.seq) })
      .from(syncChanges)
      .where(lt(syncChanges.at, before))
      .groupBy(syncChanges.workspaceId);
    for (const f of floors) {
      const seq = f.seq ?? 0;
      await this.db.batch([
        this.db
          .update(workspaces)
          .set({ changeFloor: sql`max(${workspaces.changeFloor}, ${seq + 1})` })
          .where(eq(workspaces.id, f.ws)),
        this.db.delete(syncChanges).where(and(eq(syncChanges.workspaceId, f.ws), lte(syncChanges.seq, seq))),
      ]);
    }
    await this.db.delete(idempotency).where(lt(idempotency.at, before));
    return { workspaces: floors.length };
  }

  async liveRecords(workspaceId: string) {
    const rows = await this.db
      .select()
      .from(records)
      .where(and(eq(records.workspaceId, workspaceId), isNull(records.deletedAt)));
    return rows.map(toStored);
  }
}
