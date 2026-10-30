import type { Role } from './protocol';
import { ENTITIES, type EntityName } from './registry';

export type Action = 'create' | 'update' | 'delete' | 'void';

/**
 * Who may change what (§6.11). Owners and gardeners edit the garden; helpers log care, observations,
 * harvests and nature visits; viewers only read. Deleting a whole garden is the owner's call.
 */
export function canWrite(role: Role, entity: EntityName, action: Action): boolean {
  if (role === 'viewer') return false;
  if (entity === 'garden' && action === 'delete') return role === 'owner';
  if (role === 'owner' || role === 'gardener') return true;
  return ENTITIES[entity].helper;
}

export const canRead = (role: Role | null): boolean => role !== null;

/** Membership, invitations and share links are managed by owners only. */
export const canManage = (role: Role | null): boolean => role === 'owner';
