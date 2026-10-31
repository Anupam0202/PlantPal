import { z } from 'zod';
import { EpochMs, Id } from './primitives';

/** A queued local change, pushed to the server once the workspace syncs. */
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
  /** Why the server refused it (kept on this device only; never sent). */
  error: z
    .object({ code: z.string().max(40), message: z.string().max(500) })
    .nullable()
    .optional(),
});
export type OutboxOp = z.infer<typeof OutboxOp>;
