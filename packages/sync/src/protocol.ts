import { z } from 'zod';
import { OutboxOp } from '@plantpal/schemas';

/** Roles in a shared workspace (§6.11). */
export const ROLES = ['owner', 'gardener', 'helper', 'viewer'] as const;
export type Role = (typeof ROLES)[number];

export const MAX_PUSH_OPS = 100;
export const MAX_PULL_LIMIT = 100;

export const PushRequest = z.object({ ops: z.array(OutboxOp).min(1).max(MAX_PUSH_OPS) });
export type PushRequest = z.infer<typeof PushRequest>;

export const OP_STATUSES = ['applied', 'duplicate', 'conflict', 'rejected'] as const;
export type OpStatus = (typeof OP_STATUSES)[number];

/** Stable rejection codes (subset of §14.1). */
export const OP_CODES = [
  'VALIDATION_FAILED',
  'FORBIDDEN',
  'NOT_FOUND',
  'VERSION_CONFLICT',
  'IDEMPOTENCY_CONFLICT',
  'UNKNOWN_ENTITY',
] as const;
export type OpCode = (typeof OP_CODES)[number];

export const OpResult = z.object({
  opId: z.string(),
  status: z.enum(OP_STATUSES),
  /** Server version after the op (or the current one on conflict). */
  version: z.number().int().nullable(),
  code: z.enum(OP_CODES).nullable(),
  message: z.string().nullable(),
  /** On conflict: the server's copy, so the client can compare. */
  server: z.unknown().nullable(),
  /** On a duplicate completion: the record that won. */
  existingId: z.string().nullable(),
});
export type OpResult = z.infer<typeof OpResult>;

export const PushResponse = z.object({ results: z.array(OpResult) });
export type PushResponse = z.infer<typeof PushResponse>;

export const Change = z.object({
  seq: z.number().int().positive(),
  entity: z.string(),
  id: z.string(),
  op: z.enum(['upsert', 'delete']),
  version: z.number().int(),
  /** The record as the server holds it now (tombstones included); null when it was purged. */
  record: z.unknown().nullable(),
});
export type Change = z.infer<typeof Change>;

export const PullResponse = z.object({
  changes: z.array(Change),
  cursor: z.number().int().nonnegative(),
  hasMore: z.boolean(),
});
export type PullResponse = z.infer<typeof PullResponse>;

export const SnapshotResponse = z.object({
  workspaceId: z.string(),
  cursor: z.number().int().nonnegative(),
  records: z.array(
    z.object({ entity: z.string(), id: z.string(), version: z.number().int(), record: z.unknown() }),
  ),
});
export type SnapshotResponse = z.infer<typeof SnapshotResponse>;
