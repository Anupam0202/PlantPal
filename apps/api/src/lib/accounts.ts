import { and, count, eq, isNull } from 'drizzle-orm';
import { drizzle, type DrizzleD1Database } from 'drizzle-orm/d1';
import { invitations, memberships, shareLinks, workspaces } from '@plantpal/db';
import type { Role } from '@plantpal/sync';

/** 32 random bytes, base64url. Shown once; only its SHA-256 is stored. */
export function newToken(): string {
  const b = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...b))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
}

export async function tokenHash(token: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

export interface Member {
  userId: string;
  role: Role;
  createdAt: number;
}

export interface SitterLink {
  id: string;
  workspaceId: string;
  gardenId: string;
  label: string;
  zoneIds: string[];
  startsAt: number;
  expiresAt: number;
  revokedAt: number | null;
}

/** Workspaces, memberships, invitations and sitter links on D1. Server-authoritative (§14.3). */
export class AccountsStore {
  private readonly db: DrizzleD1Database;
  constructor(d1: D1Database) {
    this.db = drizzle(d1);
  }

  async roleOf(workspaceId: string, userId: string): Promise<Role | null> {
    const [m] = await this.db
      .select({ role: memberships.role })
      .from(memberships)
      .where(and(eq(memberships.workspaceId, workspaceId), eq(memberships.userId, userId)))
      .limit(1);
    return m?.role ?? null;
  }

  async workspacesOf(userId: string) {
    return this.db
      .select({ id: workspaces.id, name: workspaces.name, role: memberships.role })
      .from(memberships)
      .innerJoin(workspaces, eq(workspaces.id, memberships.workspaceId))
      .where(eq(memberships.userId, userId));
  }

  async getWorkspace(id: string) {
    const [w] = await this.db.select().from(workspaces).where(eq(workspaces.id, id)).limit(1);
    return w ?? null;
  }

  /** Creates a workspace owned by the user. The id comes from the device (a guest workspace being claimed). */
  async createWorkspace(id: string, name: string, userId: string, now: number) {
    await this.db.batch([
      this.db.insert(workspaces).values({ id, name, createdBy: userId, createdAt: now }),
      this.db.insert(memberships).values({ workspaceId: id, userId, role: 'owner', createdAt: now }),
    ]);
  }

  async members(workspaceId: string): Promise<Member[]> {
    return this.db
      .select({ userId: memberships.userId, role: memberships.role, createdAt: memberships.createdAt })
      .from(memberships)
      .where(eq(memberships.workspaceId, workspaceId));
  }

  async owners(workspaceId: string): Promise<number> {
    const [r] = await this.db
      .select({ n: count() })
      .from(memberships)
      .where(and(eq(memberships.workspaceId, workspaceId), eq(memberships.role, 'owner')));
    return r?.n ?? 0;
  }

  async setRole(workspaceId: string, userId: string, role: Role) {
    await this.db
      .update(memberships)
      .set({ role })
      .where(and(eq(memberships.workspaceId, workspaceId), eq(memberships.userId, userId)));
  }

  async removeMember(workspaceId: string, userId: string) {
    await this.db
      .delete(memberships)
      .where(and(eq(memberships.workspaceId, workspaceId), eq(memberships.userId, userId)));
  }

  async createInvitation(i: {
    id: string;
    workspaceId: string;
    role: Exclude<Role, 'owner'>;
    tokenHash: string;
    expiresAt: number;
    createdBy: string;
    now: number;
  }) {
    await this.db.insert(invitations).values({
      id: i.id,
      workspaceId: i.workspaceId,
      role: i.role,
      tokenHash: i.tokenHash,
      expiresAt: i.expiresAt,
      createdBy: i.createdBy,
      createdAt: i.now,
    });
  }

  /**
   * Accepts a single-use invitation. The conditional update makes "used once" hold even when two
   * people click at the same moment: only one update matches `used_at IS NULL`.
   */
  async acceptInvitation(hash: string, userId: string, now: number) {
    const [inv] = await this.db.select().from(invitations).where(eq(invitations.tokenHash, hash)).limit(1);
    if (!inv) return { ok: false as const, reason: 'NOT_FOUND' as const };
    if (inv.usedAt !== null) return { ok: false as const, reason: 'USED' as const };
    if (inv.expiresAt <= now) return { ok: false as const, reason: 'EXPIRED' as const };
    const existing = await this.roleOf(inv.workspaceId, userId);
    const claimed = await this.db
      .update(invitations)
      .set({ usedAt: now, usedBy: userId })
      .where(and(eq(invitations.id, inv.id), isNull(invitations.usedAt)))
      .returning({ id: invitations.id });
    if (claimed.length === 0) return { ok: false as const, reason: 'USED' as const };
    if (!existing)
      await this.db
        .insert(memberships)
        .values({ workspaceId: inv.workspaceId, userId, role: inv.role, createdAt: now })
        .onConflictDoNothing();
    return { ok: true as const, workspaceId: inv.workspaceId, role: existing ?? inv.role };
  }

  async createShareLink(l: SitterLink & { tokenHash: string; createdBy: string; now: number }) {
    await this.db.insert(shareLinks).values({
      id: l.id,
      workspaceId: l.workspaceId,
      gardenId: l.gardenId,
      label: l.label,
      zoneIds: JSON.stringify(l.zoneIds),
      tokenHash: l.tokenHash,
      startsAt: l.startsAt,
      expiresAt: l.expiresAt,
      createdBy: l.createdBy,
      createdAt: l.now,
    });
  }

  async shareLinks(workspaceId: string): Promise<SitterLink[]> {
    const rows = await this.db.select().from(shareLinks).where(eq(shareLinks.workspaceId, workspaceId));
    return rows.map((r) => ({ ...r, zoneIds: JSON.parse(r.zoneIds) as string[] }));
  }

  async shareLinkByHash(hash: string): Promise<SitterLink | null> {
    const [r] = await this.db.select().from(shareLinks).where(eq(shareLinks.tokenHash, hash)).limit(1);
    return r ? { ...r, zoneIds: JSON.parse(r.zoneIds) as string[] } : null;
  }

  async revokeShareLink(workspaceId: string, id: string, now: number) {
    await this.db
      .update(shareLinks)
      .set({ revokedAt: now })
      .where(and(eq(shareLinks.workspaceId, workspaceId), eq(shareLinks.id, id)));
  }
}
