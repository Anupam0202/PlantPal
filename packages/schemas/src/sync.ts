import { z } from 'zod';
import { EpochMs, Id } from './primitives';

/** A queued local change, pushed to the server once the workspace syncs (M10). */
export const OutboxOp = z.object({
  opId: Id,
  workspaceId: Id,
  /** `<entity>.<action>`, e.g. `careEvent.create`, `specimen.update`. */
  type: z.string().regex(/^[a-zA-Z]+\.(create|update|delete|void)$/),
  entityId: Id,
  payload: z.unknown(),
  baseVersion: z.number().int().positive().nullable(),
  createdAt: EpochMs,
  clientSchema: z.number().int().positive(),
  state: z.enum(['pending', 'rejected']),
});
export type OutboxOp = z.infer<typeof OutboxOp>;
