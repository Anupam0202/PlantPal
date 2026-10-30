import { newId } from '@plantpal/domain';
import {
  AUTO_HIDE_REPORTS,
  MIN_CELL_CONTRIBUTORS,
  RESERVATION_HOURS,
  type ContentType,
  type ListingState,
  type ModAction,
  type ReportReason,
} from './community-rules';

export type Visibility = 'visible' | 'hidden' | 'removed';
export type StaffRole = 'moderator' | 'admin';
export type ListingKind = 'seeds' | 'cuttings' | 'seedlings' | 'produce' | 'tools';

export interface Profile {
  userId: string;
  displayName: string;
  cell: string;
  area: string;
  country: string | null;
  bio: string;
  status: 'active' | 'suspended' | 'banned';
  suspendedUntil: number | null;
  createdAt: number;
}

export interface Post {
  id: string;
  authorId: string;
  authorName: string;
  body: string;
  visibility: Visibility;
  createdAt: number;
}

export interface CommunityEvent {
  id: string;
  organiserId: string;
  organiserName: string;
  title: string;
  body: string;
  place: string;
  startsAt: number;
  endsAt: number;
  capacity: number | null;
  cancelledAt: number | null;
  visibility: Visibility;
  going: number;
  maybe: number;
  mine: 'going' | 'maybe' | null;
}

export interface Listing {
  id: string;
  ownerId: string;
  ownerName: string;
  kind: ListingKind;
  title: string;
  body: string;
  scientificName: string | null;
  quantity: string;
  pickup: string;
  state: ListingState;
  visibility: Visibility;
  expiresAt: number;
  createdAt: number;
}

export interface Reservation {
  id: string;
  listingId: string;
  requesterId: string;
  state: 'active' | 'released' | 'cancelled' | 'expired' | 'completed';
  expiresAt: number;
  ownerConfirmedAt: number | null;
  requesterConfirmedAt: number | null;
  ownerContact: string | null;
  requesterContact: string | null;
}

export interface Question {
  id: string;
  listingId: string;
  authorId: string;
  authorName: string;
  parentId: string | null;
  body: string;
  visibility: Visibility;
  createdAt: number;
}

const TABLE: Record<ContentType, { table: string; author: string }> = {
  post: { table: 'community_posts', author: 'author_id' },
  event: { table: 'community_events', author: 'organiser_id' },
  listing: { table: 'exchange_listings', author: 'owner_id' },
  question: { table: 'exchange_questions', author: 'author_id' },
};

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** Contributors count on the map when they shared something in this window. */
const ACTIVE_DAYS = 90;

/** Blocks work both ways: neither side sees the other's posts, listings or questions. */
const notBlocked = (col: string) =>
  `${col} NOT IN (SELECT blocked_id FROM community_blocks WHERE blocker_id = ?1)
   AND ${col} NOT IN (SELECT blocker_id FROM community_blocks WHERE blocked_id = ?1)`;

/** People see public content, plus their own whatever its state (with that state shown). */
const seen = (alias: string, author: string) =>
  `(${alias}.visibility = 'visible' OR ${alias}.${author} = ?1)`;

/** Community data on D1 (§20). Raw SQL so state changes are single conditional statements. */
export class CommunityStore {
  constructor(private readonly d1: D1Database) {}

  private async all<T>(sql: string, ...args: unknown[]): Promise<T[]> {
    return (
      await this.d1
        .prepare(sql)
        .bind(...args)
        .all<T>()
    ).results;
  }
  private async one<T>(sql: string, ...args: unknown[]): Promise<T | null> {
    return (
      (await this.d1
        .prepare(sql)
        .bind(...args)
        .first<T>()) ?? null
    );
  }
  private async run(sql: string, ...args: unknown[]): Promise<number> {
    return (
      (
        await this.d1
          .prepare(sql)
          .bind(...args)
          .run()
      ).meta.changes ?? 0
    );
  }

  // ------------------------------------------------------------ profiles, staff, blocks

  profile(userId: string) {
    return this.one<Profile>(
      `SELECT user_id AS userId, display_name AS displayName, cell, area, country, bio, status,
              suspended_until AS suspendedUntil, created_at AS createdAt
         FROM community_profiles WHERE user_id = ?`,
      userId,
    );
  }

  async saveProfile(
    p: Pick<Profile, 'userId' | 'displayName' | 'cell' | 'area' | 'country' | 'bio'>,
    now: number,
  ) {
    await this.run(
      `INSERT INTO community_profiles (user_id, display_name, cell, area, country, bio, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (user_id) DO UPDATE SET display_name = excluded.display_name, cell = excluded.cell,
         area = excluded.area, country = excluded.country, bio = excluded.bio, updated_at = excluded.updated_at`,
      p.userId,
      p.displayName,
      p.cell,
      p.area,
      p.country,
      p.bio,
      now,
      now,
    );
  }

  async staffRole(userId: string): Promise<StaffRole | null> {
    return (
      (await this.one<{ role: StaffRole }>('SELECT role FROM community_staff WHERE user_id = ?', userId))
        ?.role ?? null
    );
  }

  async setStaff(userId: string, role: StaffRole | null, now: number) {
    if (role === null) await this.run('DELETE FROM community_staff WHERE user_id = ?', userId);
    else
      await this.run(
        `INSERT INTO community_staff (user_id, role, created_at) VALUES (?, ?, ?)
         ON CONFLICT (user_id) DO UPDATE SET role = excluded.role`,
        userId,
        role,
        now,
      );
  }

  async block(blocker: string, blocked: string, now: number) {
    await this.run(
      'INSERT OR IGNORE INTO community_blocks (blocker_id, blocked_id, created_at) VALUES (?, ?, ?)',
      blocker,
      blocked,
      now,
    );
  }

  async unblock(blocker: string, blocked: string) {
    await this.run('DELETE FROM community_blocks WHERE blocker_id = ? AND blocked_id = ?', blocker, blocked);
  }

  blocks(blocker: string) {
    return this.all<{ userId: string; displayName: string | null }>(
      `SELECT b.blocked_id AS userId, p.display_name AS displayName
         FROM community_blocks b LEFT JOIN community_profiles p ON p.user_id = b.blocked_id
        WHERE b.blocker_id = ? ORDER BY b.created_at DESC`,
      blocker,
    );
  }

  async blockedEitherWay(a: string, b: string): Promise<boolean> {
    return (
      (await this.one(
        `SELECT 1 FROM community_blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)`,
        a,
        b,
        b,
        a,
      )) !== null
    );
  }

  // ------------------------------------------------------------ posts

  async createPost(p: { authorId: string; area: string; cell: string; body: string }, now: number) {
    const id = newId(now);
    await this.run(
      'INSERT INTO community_posts (id, author_id, area, cell, body, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      id,
      p.authorId,
      p.area,
      p.cell,
      p.body,
      now,
    );
    return id;
  }

  feed(area: string, viewer: string, before: number, limit: number) {
    return this.all<Post>(
      `SELECT x.id, x.author_id AS authorId, p.display_name AS authorName, x.body, x.visibility,
              x.created_at AS createdAt
         FROM community_posts x JOIN community_profiles p ON p.user_id = x.author_id
        WHERE x.area = ?2 AND x.created_at < ?3 AND x.visibility != 'removed' AND ${seen('x', 'author_id')}
          AND ${notBlocked('x.author_id')}
        ORDER BY x.created_at DESC LIMIT ?4`,
      viewer,
      area,
      before,
      limit,
    );
  }

  // ------------------------------------------------------------ events

  async createEvent(
    e: {
      organiserId: string;
      area: string;
      cell: string;
      title: string;
      body: string;
      place: string;
      startsAt: number;
      endsAt: number;
      capacity: number | null;
    },
    now: number,
  ) {
    const id = newId(now);
    await this.run(
      `INSERT INTO community_events (id, organiser_id, area, cell, title, body, place, starts_at, ends_at, capacity, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      e.organiserId,
      e.area,
      e.cell,
      e.title,
      e.body,
      e.place,
      e.startsAt,
      e.endsAt,
      e.capacity,
      now,
    );
    return id;
  }

  private eventSql(where: string) {
    return `SELECT e.id, e.organiser_id AS organiserId, p.display_name AS organiserName, e.title, e.body,
                   e.place, e.starts_at AS startsAt, e.ends_at AS endsAt, e.capacity,
                   e.cancelled_at AS cancelledAt, e.visibility,
                   (SELECT COUNT(*) FROM community_rsvps r WHERE r.event_id = e.id AND r.status = 'going') AS going,
                   (SELECT COUNT(*) FROM community_rsvps r WHERE r.event_id = e.id AND r.status = 'maybe') AS maybe,
                   (SELECT r.status FROM community_rsvps r WHERE r.event_id = e.id AND r.user_id = ?1) AS mine
              FROM community_events e JOIN community_profiles p ON p.user_id = e.organiser_id
             WHERE e.visibility != 'removed' AND ${seen('e', 'organiser_id')} AND ${notBlocked('e.organiser_id')}
               AND ${where}`;
  }

  events(area: string, viewer: string, now: number) {
    return this.all<CommunityEvent>(
      `${this.eventSql('e.area = ?2 AND e.ends_at >= ?3')} ORDER BY e.starts_at LIMIT 100`,
      viewer,
      area,
      now,
    );
  }

  event(id: string, viewer: string) {
    return this.one<CommunityEvent>(this.eventSql('e.id = ?2'), viewer, id);
  }

  /**
   * RSVP "going" respects the capacity in one conditional upsert. A refused change (full or cancelled)
   * leaves the earlier answer as it was.
   */
  async rsvp(
    eventId: string,
    userId: string,
    status: 'going' | 'maybe' | null,
    now: number,
  ): Promise<boolean> {
    if (status === null) {
      await this.run('DELETE FROM community_rsvps WHERE event_id = ? AND user_id = ?', eventId, userId);
      return true;
    }
    const changed = await this.run(
      `INSERT INTO community_rsvps (event_id, user_id, status, created_at)
       SELECT ?1, ?2, ?3, ?4 FROM community_events e
        WHERE e.id = ?1 AND e.cancelled_at IS NULL AND e.visibility = 'visible'
          AND (?3 != 'going' OR e.capacity IS NULL
               OR (SELECT COUNT(*) FROM community_rsvps r
                    WHERE r.event_id = ?1 AND r.status = 'going' AND r.user_id != ?2) < e.capacity)
       ON CONFLICT (event_id, user_id) DO UPDATE SET status = excluded.status`,
      eventId,
      userId,
      status,
      now,
    );
    return changed === 1;
  }

  async cancelEvent(id: string, organiserId: string, now: number) {
    return (
      (await this.run(
        'UPDATE community_events SET cancelled_at = ? WHERE id = ? AND organiser_id = ? AND cancelled_at IS NULL',
        now,
        id,
        organiserId,
      )) === 1
    );
  }

  // ------------------------------------------------------------ exchange

  async createListing(
    l: Omit<Listing, 'id' | 'ownerName' | 'state' | 'visibility' | 'createdAt'> & {
      area: string;
      cell: string;
      state: 'draft' | 'listed';
    },
    now: number,
  ) {
    const id = newId(now);
    await this.run(
      `INSERT INTO exchange_listings (id, owner_id, area, cell, kind, title, body, scientific_name, quantity, pickup, state, expires_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      l.ownerId,
      l.area,
      l.cell,
      l.kind,
      l.title,
      l.body,
      l.scientificName,
      l.quantity,
      l.pickup,
      l.state,
      l.expiresAt,
      now,
      now,
    );
    return id;
  }

  private listingSql(where: string) {
    return `SELECT l.id, l.owner_id AS ownerId, p.display_name AS ownerName, l.kind, l.title, l.body,
                   l.scientific_name AS scientificName, l.quantity, l.pickup, l.state, l.visibility,
                   l.expires_at AS expiresAt, l.created_at AS createdAt
              FROM exchange_listings l JOIN community_profiles p ON p.user_id = l.owner_id
             WHERE l.visibility != 'removed' AND ${seen('l', 'owner_id')} AND ${notBlocked('l.owner_id')}
               AND ${where}`;
  }

  listings(area: string, viewer: string, kind: ListingKind | null) {
    return this.all<Listing>(
      `${this.listingSql(
        `l.area = ?2 AND (l.state IN ('listed', 'reserved') OR l.owner_id = ?1) AND (?3 IS NULL OR l.kind = ?3)`,
      )} ORDER BY l.created_at DESC LIMIT 100`,
      viewer,
      area,
      kind,
    );
  }

  listing(id: string, viewer: string) {
    return this.one<Listing & { area: string }>(
      this.listingSql('l.id = ?2').replace('l.created_at AS createdAt', 'l.created_at AS createdAt, l.area'),
      viewer,
      id,
    );
  }

  reservationOf(listingId: string) {
    return this.one<Reservation>(
      `SELECT id, listing_id AS listingId, requester_id AS requesterId, state, expires_at AS expiresAt,
              owner_confirmed_at AS ownerConfirmedAt, requester_confirmed_at AS requesterConfirmedAt,
              owner_contact AS ownerContact, requester_contact AS requesterContact
         FROM exchange_reservations WHERE listing_id = ? AND state IN ('active', 'completed')
        ORDER BY created_at DESC LIMIT 1`,
      listingId,
    );
  }

  /** Lazily applies time-based transitions for one listing (also swept daily). */
  async sweep(listingId: string | null, now: number) {
    const one = listingId === null ? '' : ' AND listing_id = ?2';
    const oneL = listingId === null ? '' : ' AND id = ?2';
    const args = listingId === null ? [now] : [now, listingId];
    // A reservation not yet handed over expires after 48 h; its listing goes back on offer.
    await this.d1.batch([
      this.d1
        .prepare(
          `UPDATE exchange_listings SET state = 'listed', updated_at = ?1
            WHERE state = 'reserved'${oneL} AND id IN (SELECT listing_id FROM exchange_reservations
                  WHERE state = 'active' AND expires_at <= ?1)`,
        )
        .bind(...args),
      this.d1
        .prepare(
          `UPDATE exchange_reservations SET state = 'expired', updated_at = ?1
            WHERE state = 'active' AND expires_at <= ?1${one}
              AND listing_id IN (SELECT id FROM exchange_listings WHERE state = 'listed')`,
        )
        .bind(...args),
      this.d1
        .prepare(
          `UPDATE exchange_listings SET state = 'expired', updated_at = ?1 WHERE state = 'listed' AND expires_at <= ?1${oneL}`,
        )
        .bind(...args),
    ]);
  }

  async setListingState(id: string, ownerId: string, from: ListingState[], to: ListingState, now: number) {
    return (
      (await this.run(
        `UPDATE exchange_listings SET state = ?, updated_at = ?
          WHERE id = ? AND owner_id = ? AND state IN (${from.map(() => '?').join(', ')})`,
        to,
        now,
        id,
        ownerId,
        ...from,
      )) === 1
    );
  }

  /**
   * Reserves a listing for one requester. The conditional update and the insert run as one D1
   * batch, and a partial unique index allows one active reservation: exactly one winner.
   */
  async reserve(listingId: string, requesterId: string, now: number) {
    await this.sweep(listingId, now);
    const id = newId(now);
    const expiresAt = now + RESERVATION_HOURS * HOUR;
    const [, inserted] = await this.d1.batch([
      this.d1
        .prepare(
          `UPDATE exchange_listings SET state = 'reserved', updated_at = ?1
            WHERE id = ?2 AND state = 'listed' AND visibility = 'visible' AND owner_id != ?3 AND expires_at > ?1`,
        )
        .bind(now, listingId, requesterId),
      this.d1
        .prepare(
          `INSERT INTO exchange_reservations (id, listing_id, requester_id, state, expires_at, created_at, updated_at)
           SELECT ?1, ?2, ?3, 'active', ?4, ?5, ?5 WHERE changes() = 1`,
        )
        .bind(id, listingId, requesterId, expiresAt, now),
    ]);
    return inserted?.meta.changes === 1 ? { id, expiresAt } : null;
  }

  /** Owner releases or requester cancels: the reservation ends and the listing is on offer again. */
  async endReservation(listingId: string, actor: 'owner' | 'requester', userId: string, now: number) {
    const who = actor === 'owner' ? `l.owner_id = ?3` : `r.requester_id = ?3`;
    const [ended] = await this.d1.batch([
      this.d1
        .prepare(
          `UPDATE exchange_reservations AS r SET state = ?4, updated_at = ?1
            WHERE r.listing_id = ?2 AND r.state = 'active'
              AND EXISTS (SELECT 1 FROM exchange_listings l WHERE l.id = ?2 AND l.state = 'reserved' AND ${who})`,
        )
        .bind(now, listingId, userId, actor === 'owner' ? 'released' : 'cancelled'),
      this.d1
        .prepare(
          `UPDATE exchange_listings SET state = 'listed', updated_at = ?1 WHERE id = ?2 AND state = 'reserved' AND changes() = 1`,
        )
        .bind(now, listingId),
    ]);
    return ended?.meta.changes === 1;
  }

  /** Each party confirms the handoff; with both, the listing moves to handoff_confirmed. */
  async confirmHandoff(listingId: string, actor: 'owner' | 'requester', now: number) {
    const col = actor === 'owner' ? 'owner_confirmed_at' : 'requester_confirmed_at';
    const [confirmed] = await this.d1.batch([
      this.d1
        .prepare(
          `UPDATE exchange_reservations SET ${col} = COALESCE(${col}, ?1), updated_at = ?1
            WHERE listing_id = ?2 AND state = 'active'`,
        )
        .bind(now, listingId),
      this.d1
        .prepare(
          `UPDATE exchange_listings SET state = 'handoff_confirmed', updated_at = ?1
            WHERE id = ?2 AND state = 'reserved' AND EXISTS (
              SELECT 1 FROM exchange_reservations WHERE listing_id = ?2 AND state = 'active'
                 AND owner_confirmed_at IS NOT NULL AND requester_confirmed_at IS NOT NULL)`,
        )
        .bind(now, listingId),
    ]);
    return confirmed?.meta.changes === 1;
  }

  async complete(listingId: string, now: number) {
    const [done] = await this.d1.batch([
      this.d1
        .prepare(
          `UPDATE exchange_listings SET state = 'completed', updated_at = ?1 WHERE id = ?2 AND state = 'handoff_confirmed'`,
        )
        .bind(now, listingId),
      this.d1
        .prepare(
          `UPDATE exchange_reservations SET state = 'completed', updated_at = ?1
            WHERE listing_id = ?2 AND state = 'active' AND changes() = 1`,
        )
        .bind(now, listingId),
    ]);
    return done?.meta.changes === 1;
  }

  async setContact(listingId: string, actor: 'owner' | 'requester', contact: string, now: number) {
    const col = actor === 'owner' ? 'owner_contact' : 'requester_contact';
    return (
      (await this.run(
        `UPDATE exchange_reservations SET ${col} = ?, updated_at = ? WHERE listing_id = ? AND state IN ('active', 'completed')`,
        contact,
        now,
        listingId,
      )) === 1
    );
  }

  async ask(q: { listingId: string; authorId: string; parentId: string | null; body: string }, now: number) {
    const id = newId(now);
    await this.run(
      'INSERT INTO exchange_questions (id, listing_id, author_id, parent_id, body, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      id,
      q.listingId,
      q.authorId,
      q.parentId,
      q.body,
      now,
    );
    return id;
  }

  questions(listingId: string, viewer: string) {
    return this.all<Question>(
      `SELECT q.id, q.listing_id AS listingId, q.author_id AS authorId, p.display_name AS authorName,
              q.parent_id AS parentId, q.body, q.visibility, q.created_at AS createdAt
         FROM exchange_questions q JOIN community_profiles p ON p.user_id = q.author_id
        WHERE q.listing_id = ?2 AND q.visibility != 'removed' AND ${seen('q', 'author_id')}
          AND ${notBlocked('q.author_id')}
        ORDER BY q.created_at`,
      viewer,
      listingId,
    );
  }

  // ------------------------------------------------------------ reports and moderation

  /** The author of a piece of content, or null if it does not exist. */
  async authorOf(type: ContentType, id: string): Promise<string | null> {
    const t = TABLE[type];
    return (
      (await this.one<{ a: string }>(`SELECT ${t.author} AS a FROM ${t.table} WHERE id = ?`, id))?.a ?? null
    );
  }

  /** One report per person per item; enough independent reports hide it until a moderator looks. */
  async report(
    r: { type: ContentType; id: string; reporterId: string; reason: ReportReason; note: string },
    now: number,
  ) {
    await this.run(
      `INSERT OR IGNORE INTO community_reports (id, content_type, content_id, reporter_id, reason, note, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      newId(now),
      r.type,
      r.id,
      r.reporterId,
      r.reason,
      r.note,
      now,
    );
    const open =
      (
        await this.one<{ n: number }>(
          `SELECT COUNT(DISTINCT reporter_id) AS n FROM community_reports
          WHERE content_type = ? AND content_id = ? AND resolved_at IS NULL`,
          r.type,
          r.id,
        )
      )?.n ?? 0;
    let hidden = false;
    if (open >= AUTO_HIDE_REPORTS)
      hidden =
        (await this.run(
          `UPDATE ${TABLE[r.type].table} SET visibility = 'hidden' WHERE id = ? AND visibility = 'visible'`,
          r.id,
        )) === 1;
    return { open, hidden };
  }

  /** Items waiting for a moderator: anything with open reports or hidden pending review. */
  async queue() {
    const items: Array<{
      type: ContentType;
      id: string;
      authorId: string;
      text: string;
      visibility: Visibility;
      reports: number;
      reasons: string;
    }> = [];
    for (const [type, t] of Object.entries(TABLE) as Array<[ContentType, (typeof TABLE)[ContentType]]>) {
      const text = type === 'event' || type === 'listing' ? `x.title || ': ' || x.body` : 'x.body';
      items.push(
        ...(
          await this.all<Omit<(typeof items)[number], 'type'>>(
            `SELECT x.id, x.${t.author} AS authorId, ${text} AS text, x.visibility,
                    (SELECT COUNT(*) FROM community_reports r WHERE r.content_type = ?1 AND r.content_id = x.id AND r.resolved_at IS NULL) AS reports,
                    COALESCE((SELECT GROUP_CONCAT(DISTINCT r.reason) FROM community_reports r WHERE r.content_type = ?1 AND r.content_id = x.id AND r.resolved_at IS NULL), '') AS reasons
               FROM ${t.table} x
              WHERE x.visibility = 'hidden'
                 OR EXISTS (SELECT 1 FROM community_reports r WHERE r.content_type = ?1 AND r.content_id = x.id AND r.resolved_at IS NULL)`,
            type,
          )
        ).map((row) => ({ ...row, type })),
      );
    }
    const appeals = await this.all<{
      id: string;
      actionId: string;
      userId: string;
      body: string;
      action: string;
      targetType: string;
      targetId: string;
      reason: string;
      createdAt: number;
    }>(
      `SELECT a.id, a.action_id AS actionId, a.user_id AS userId, a.body, m.action, m.target_type AS targetType,
              m.target_id AS targetId, m.reason, a.created_at AS createdAt
         FROM moderation_appeals a JOIN moderation_actions m ON m.id = a.action_id
        WHERE a.state = 'open' ORDER BY a.created_at`,
    );
    return { items: items.sort((a, b) => b.reports - a.reports), appeals };
  }

  /** Applies a moderation action and writes it to the audit log. Returns the action id. */
  async moderate(
    a: {
      moderatorId: string;
      action: ModAction;
      targetType: ContentType | 'user';
      targetId: string;
      reason: string;
      days?: number;
    },
    now: number,
  ): Promise<{ id: string } | null> {
    let subject: string | null;
    let until: number | null = null;
    const stmts: D1PreparedStatement[] = [];
    if (a.targetType === 'user') {
      subject = (await this.profile(a.targetId)) ? a.targetId : null;
      if (!subject) return null;
      const setStatus = (status: string, untilAt: number | null) =>
        this.d1
          .prepare(
            'UPDATE community_profiles SET status = ?, suspended_until = ?, updated_at = ? WHERE user_id = ?',
          )
          .bind(status, untilAt, now, a.targetId);
      if (a.action === 'suspend') {
        until = now + (a.days ?? 7) * DAY;
        stmts.push(setStatus('suspended', until));
      } else if (a.action === 'unsuspend' || a.action === 'unban') stmts.push(setStatus('active', null));
      else if (a.action === 'ban') {
        stmts.push(setStatus('banned', null));
        // A ban hides everything the person shared; moderators can restore items one by one.
        for (const t of Object.values(TABLE))
          stmts.push(
            this.d1
              .prepare(
                `UPDATE ${t.table} SET visibility = 'hidden' WHERE ${t.author} = ? AND visibility = 'visible'`,
              )
              .bind(a.targetId),
          );
      } else if (a.action !== 'warn') return null;
    } else {
      subject = await this.authorOf(a.targetType, a.targetId);
      if (!subject) return null;
      const to: Partial<Record<ModAction, Visibility>> = {
        hide: 'hidden',
        unhide: 'visible',
        remove: 'removed',
        restore: 'visible',
      };
      const visibility = to[a.action];
      if (visibility)
        stmts.push(
          this.d1
            .prepare(`UPDATE ${TABLE[a.targetType].table} SET visibility = ? WHERE id = ?`)
            .bind(visibility, a.targetId),
        );
      else if (a.action !== 'warn') return null;
      // The reports on this item are now dealt with.
      stmts.push(
        this.d1
          .prepare(
            'UPDATE community_reports SET resolved_at = ? WHERE content_type = ? AND content_id = ? AND resolved_at IS NULL',
          )
          .bind(now, a.targetType, a.targetId),
      );
    }
    const id = newId(now);
    stmts.push(
      this.d1
        .prepare(
          `INSERT INTO moderation_actions (id, moderator_id, action, target_type, target_id, subject_id, reason, until, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(id, a.moderatorId, a.action, a.targetType, a.targetId, subject, a.reason, until, now),
    );
    await this.d1.batch(stmts);
    return { id };
  }

  audit(limit: number) {
    return this.all<{
      id: string;
      moderatorId: string;
      action: string;
      targetType: string;
      targetId: string;
      subjectId: string;
      reason: string;
      until: number | null;
      createdAt: number;
    }>(
      `SELECT id, moderator_id AS moderatorId, action, target_type AS targetType, target_id AS targetId,
              subject_id AS subjectId, reason, until, created_at AS createdAt
         FROM moderation_actions ORDER BY created_at DESC, id DESC LIMIT ?`,
      limit,
    );
  }

  /** Actions taken on my content or account, so I can see why and appeal. */
  actionsAbout(userId: string) {
    return this.all<{
      id: string;
      action: string;
      targetType: string;
      targetId: string;
      reason: string;
      until: number | null;
      createdAt: number;
      appeal: string | null;
    }>(
      `SELECT m.id, m.action, m.target_type AS targetType, m.target_id AS targetId, m.reason, m.until,
              m.created_at AS createdAt, a.state AS appeal
         FROM moderation_actions m LEFT JOIN moderation_appeals a ON a.action_id = m.id
        WHERE m.subject_id = ? AND m.action IN ('hide', 'remove', 'warn', 'suspend', 'ban')
        ORDER BY m.created_at DESC, m.id DESC`,
      userId,
    );
  }

  async appeal(actionId: string, userId: string, body: string, now: number) {
    const action = await this.one<{ subject: string }>(
      `SELECT subject_id AS subject FROM moderation_actions
        WHERE id = ? AND action IN ('hide', 'remove', 'warn', 'suspend', 'ban')`,
      actionId,
    );
    if (!action || action.subject !== userId) return null;
    const id = newId(now);
    const added = await this.run(
      'INSERT OR IGNORE INTO moderation_appeals (id, action_id, user_id, body, created_at) VALUES (?, ?, ?, ?, ?)',
      id,
      actionId,
      userId,
      body,
      now,
    );
    return added === 1 ? { id } : { id: null };
  }

  /** Overturning an appeal reverses the action, and that reversal is audited too. */
  async decideAppeal(appealId: string, moderatorId: string, decision: 'upheld' | 'overturned', now: number) {
    const a = await this.one<{
      actionId: string;
      action: ModAction;
      targetType: ContentType | 'user';
      targetId: string;
    }>(
      `SELECT a.action_id AS actionId, m.action, m.target_type AS targetType, m.target_id AS targetId
         FROM moderation_appeals a JOIN moderation_actions m ON m.id = a.action_id
        WHERE a.id = ? AND a.state = 'open'`,
      appealId,
    );
    if (!a) return false;
    await this.run(
      'UPDATE moderation_appeals SET state = ?, decided_by = ?, decided_at = ? WHERE id = ? AND state = ?',
      decision,
      moderatorId,
      now,
      appealId,
      'open',
    );
    if (decision === 'overturned') {
      const undo: Partial<Record<ModAction, ModAction>> = {
        hide: 'unhide',
        remove: 'restore',
        suspend: 'unsuspend',
        ban: 'unban',
      };
      const reverse = undo[a.action];
      if (reverse)
        await this.moderate(
          {
            moderatorId,
            action: reverse,
            targetType: a.targetType,
            targetId: a.targetId,
            reason: `Appeal ${appealId} overturned`,
          },
          now,
        );
    }
    return true;
  }

  // ------------------------------------------------------------ map

  /**
   * Active contributors per resolution-7 cell in an area. Cells with fewer than five are left out
   * entirely (k-anonymity, §19); nothing about who they are is returned.
   */
  mapCells(area: string, now: number) {
    const since = now - ACTIVE_DAYS * DAY;
    return this.all<{ cell: string; contributors: number }>(
      `SELECT p.cell AS cell, COUNT(DISTINCT p.user_id) AS contributors
         FROM community_profiles p
        WHERE p.area = ?1 AND p.status = 'active' AND (
              EXISTS (SELECT 1 FROM community_posts x WHERE x.author_id = p.user_id AND x.visibility = 'visible' AND x.created_at >= ?2)
           OR EXISTS (SELECT 1 FROM community_events x WHERE x.organiser_id = p.user_id AND x.visibility = 'visible' AND x.created_at >= ?2)
           OR EXISTS (SELECT 1 FROM exchange_listings x WHERE x.owner_id = p.user_id AND x.visibility = 'visible' AND x.created_at >= ?2))
        GROUP BY p.cell HAVING COUNT(DISTINCT p.user_id) >= ?3`,
      area,
      since,
      MIN_CELL_CONTRIBUTORS,
    );
  }
}
