/**
 * Pure rules for the community features (§20): coarse H3 cells and the exchange state machine.
 * No I/O, so every transition is unit-tested on its own.
 */

// ---------------------------------------------------------------- H3 cells (coarse location only)

/** Community surfaces use H3 resolution 7 (about 5 km²); feeds group by the resolution-5 parent. */
export const CELL_RES = 7;
export const AREA_RES = 5;

const MODE_CELL = 1n;

/**
 * Validates an H3 cell index (hex string) at a given resolution using its bit layout: mode 1,
 * resolution, base cell 0–121, digits 0–6 up to the resolution and 7 ("unused") after it.
 */
export function isCell(index: string, res: number): boolean {
  if (!/^[0-9a-f]{15,16}$/.test(index)) return false;
  const h = BigInt(`0x${index}`);
  if (h >> 63n !== 0n) return false;
  if (((h >> 59n) & 0xfn) !== MODE_CELL) return false;
  if (Number((h >> 52n) & 0xfn) !== res) return false;
  if (Number((h >> 45n) & 0x7fn) > 121) return false;
  for (let r = 1; r <= 15; r++) {
    const digit = Number((h >> BigInt((15 - r) * 3)) & 7n);
    if (r <= res ? digit === 7 : digit !== 7) return false;
  }
  return true;
}

/** The ancestor of `index` at a coarser resolution (same bit operations H3's cellToParent uses). */
export function parentCell(index: string, res: number): string {
  let h = BigInt(`0x${index}`);
  h = (h & ~(0xfn << 52n)) | (BigInt(res) << 52n);
  for (let r = res + 1; r <= 15; r++) h |= 7n << BigInt((15 - r) * 3);
  return h.toString(16);
}

// ---------------------------------------------------------------- exchange state machine

export const LISTING_STATES = [
  'draft',
  'listed',
  'reserved',
  'handoff_confirmed',
  'completed',
  'withdrawn',
  'expired',
] as const;
export type ListingState = (typeof LISTING_STATES)[number];

export const RESERVATION_STATES = ['active', 'released', 'cancelled', 'expired', 'completed'] as const;
export type ReservationState = (typeof RESERVATION_STATES)[number];

export type ListingEvent =
  | 'publish'
  | 'withdraw'
  | 'expire'
  | 'reserve'
  | 'release'
  | 'cancel'
  | 'reservation_expire'
  | 'both_confirmed'
  | 'complete';

/**
 * `draft → listed → reserved (48 h) → handoff_confirmed (both parties) → completed`;
 * `listed → withdrawn | expired`; `reserved → listed` when the reservation is released (owner),
 * cancelled (requester) or expires.
 */
const TRANSITIONS: Record<ListingEvent, Partial<Record<ListingState, ListingState>>> = {
  publish: { draft: 'listed' },
  withdraw: { draft: 'withdrawn', listed: 'withdrawn' },
  expire: { listed: 'expired' },
  reserve: { listed: 'reserved' },
  release: { reserved: 'listed' },
  cancel: { reserved: 'listed' },
  reservation_expire: { reserved: 'listed' },
  both_confirmed: { reserved: 'handoff_confirmed' },
  complete: { handoff_confirmed: 'completed' },
};

export function nextState(state: ListingState, event: ListingEvent): ListingState | null {
  return TRANSITIONS[event][state] ?? null;
}

export const RESERVATION_HOURS = 48;
export const LISTING_DAYS = 30;

// ---------------------------------------------------------------- moderation

export const REPORT_REASONS = [
  'spam',
  'harassment',
  'invasive_or_unsafe',
  'illegal',
  'misinformation',
  'other',
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

/** Independent reports (distinct reporters) that hide content until a moderator reviews it. */
export const AUTO_HIDE_REPORTS = 3;

export const CONTENT_TYPES = ['post', 'event', 'listing', 'question'] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];

export const MOD_ACTIONS = [
  'hide',
  'unhide',
  'remove',
  'restore',
  'warn',
  'suspend',
  'unsuspend',
  'ban',
  'unban',
] as const;
export type ModAction = (typeof MOD_ACTIONS)[number];

/** Map cells with fewer contributors than this are hidden (k-anonymity, §19). */
export const MIN_CELL_CONTRIBUTORS = 5;
