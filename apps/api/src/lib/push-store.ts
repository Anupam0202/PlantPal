import { and, eq, sql } from 'drizzle-orm';
import { drizzle, type DrizzleD1Database } from 'drizzle-orm/d1';
import { newId } from '@plantpal/domain';
import { pushSubscriptions } from '@plantpal/db';
import type { PushSubscriptionKeys } from './webpush';

export interface StoredSubscription extends PushSubscriptionKeys {
  id: string;
  userId: string;
}

/** Web Push subscriptions on D1, one per browser, owned by the signed-in person. */
export class PushStore {
  private readonly db: DrizzleD1Database;
  constructor(d1: D1Database) {
    this.db = drizzle(d1);
  }

  /** Saves a browser's subscription. The same browser signing in to another account moves it. */
  async upsert(userId: string, sub: PushSubscriptionKeys, now: number): Promise<string> {
    const id = newId(now);
    const [row] = await this.db
      .insert(pushSubscriptions)
      .values({ id, userId, endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth, createdAt: now })
      .onConflictDoUpdate({
        target: pushSubscriptions.endpoint,
        set: { userId, p256dh: sub.p256dh, auth: sub.auth, failures: 0 },
      })
      .returning({ id: pushSubscriptions.id });
    return row?.id ?? id;
  }

  async remove(userId: string, endpoint: string) {
    await this.db
      .delete(pushSubscriptions)
      .where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint)));
  }

  async ofUser(userId: string): Promise<StoredSubscription[]> {
    return this.db
      .select({
        id: pushSubscriptions.id,
        userId: pushSubscriptions.userId,
        endpoint: pushSubscriptions.endpoint,
        p256dh: pushSubscriptions.p256dh,
        auth: pushSubscriptions.auth,
      })
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, userId));
  }

  async drop(id: string) {
    await this.db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, id));
  }

  async sent(id: string, now: number) {
    await this.db
      .update(pushSubscriptions)
      .set({ lastSuccessAt: now, failures: 0 })
      .where(eq(pushSubscriptions.id, id));
  }

  async failed(id: string) {
    await this.db
      .update(pushSubscriptions)
      .set({ failures: sql`${pushSubscriptions.failures} + 1` })
      .where(eq(pushSubscriptions.id, id));
  }
}
