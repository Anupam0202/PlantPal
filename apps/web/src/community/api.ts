import { call } from '../sync/api';

/** Community (§20) calls. Text is always rendered as text; nothing here carries coordinates. */

export type Visibility = 'visible' | 'hidden' | 'removed';
export type ListingKind = 'seeds' | 'cuttings' | 'seedlings' | 'produce' | 'tools';
export type ListingState =
  'draft' | 'listed' | 'reserved' | 'handoff_confirmed' | 'completed' | 'withdrawn' | 'expired';
export type ContentType = 'post' | 'event' | 'listing' | 'question';
export type ReportReason =
  'spam' | 'harassment' | 'invasive_or_unsafe' | 'illegal' | 'misinformation' | 'other';
export type ListingAction =
  'publish' | 'withdraw' | 'reserve' | 'release' | 'cancel' | 'confirm' | 'complete';

export interface CommunityProfile {
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
export interface Notice {
  id: string;
  action: string;
  targetType: string;
  targetId: string;
  reason: string;
  until: number | null;
  createdAt: number;
  appeal: string | null;
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
export interface Question {
  id: string;
  authorId: string;
  authorName: string;
  parentId: string | null;
  body: string;
  visibility: Visibility;
  createdAt: number;
}
export interface ListingView {
  listing: Listing;
  role: 'owner' | 'requester' | null;
  questions: Question[];
  reservation: {
    state: string;
    expiresAt: number;
    ownerConfirmed: boolean;
    requesterConfirmed: boolean;
    mySharedContact: boolean;
    contacts: { owner: string; requester: string } | null;
  } | null;
}
export interface QueueItem {
  type: ContentType;
  id: string;
  authorId: string;
  text: string;
  visibility: Visibility;
  reports: number;
  reasons: string;
}
export interface Appeal {
  id: string;
  actionId: string;
  userId: string;
  body: string;
  action: string;
  targetType: string;
  targetId: string;
  reason: string;
  createdAt: number;
}

const C = '/api/v1/community';
const id = (s: string) => encodeURIComponent(s);

export const community = {
  status: () => call<{ enabled: boolean }>('GET', `${C}/status`),
  profile: () =>
    call<{ profile: CommunityProfile | null; staff: 'moderator' | 'admin' | null; notices: Notice[] }>(
      'GET',
      `${C}/profile`,
    ),
  saveProfile: (p: { displayName: string; cell: string; country: string | null; bio: string }) =>
    call<{ profile: CommunityProfile }>('PUT', `${C}/profile`, p),

  feed: (before?: number) => call<{ posts: Post[] }>('GET', `${C}/feed${before ? `?before=${before}` : ''}`),
  post: (body: string) => call<{ id: string }>('POST', `${C}/posts`, { body }),

  events: () => call<{ events: CommunityEvent[] }>('GET', `${C}/events`),
  createEvent: (e: {
    title: string;
    body: string;
    place: string;
    startsAt: number;
    endsAt: number;
    capacity: number | null;
  }) => call<{ id: string }>('POST', `${C}/events`, e),
  event: (eventId: string) => call<{ event: CommunityEvent }>('GET', `${C}/events/${id(eventId)}`),
  rsvp: (eventId: string, status: 'going' | 'maybe' | null) =>
    call<{ event: CommunityEvent }>('PUT', `${C}/events/${id(eventId)}/rsvp`, { status }),
  cancelEvent: (eventId: string) => call<{ ok: true }>('POST', `${C}/events/${id(eventId)}/cancel`),

  listings: (kind?: ListingKind) =>
    call<{ listings: Listing[] }>('GET', `${C}/exchange${kind ? `?kind=${kind}` : ''}`),
  createListing: (l: {
    kind: ListingKind;
    title: string;
    body: string;
    scientificName: string | null;
    quantity: string;
    pickup: string;
    publish: boolean;
  }) => call<{ id: string; state: ListingState }>('POST', `${C}/exchange`, l),
  listing: (listingId: string) => call<ListingView>('GET', `${C}/exchange/${id(listingId)}`),
  act: (listingId: string, action: ListingAction) =>
    call<ListingView>('POST', `${C}/exchange/${id(listingId)}/${action}`),
  contact: (listingId: string, contact: string) =>
    call<ListingView>('PUT', `${C}/exchange/${id(listingId)}/contact`, { contact }),
  ask: (listingId: string, body: string, parentId: string | null) =>
    call<{ id: string }>('POST', `${C}/exchange/${id(listingId)}/questions`, { body, parentId }),

  report: (type: ContentType, contentId: string, reason: ReportReason, note: string) =>
    call<{ ok: true }>('POST', `${C}/reports`, { type, id: contentId, reason, note }),
  blocks: () => call<{ blocks: Array<{ userId: string; displayName: string | null }> }>('GET', `${C}/blocks`),
  block: (userId: string) => call<{ ok: true }>('POST', `${C}/blocks`, { userId }),
  unblock: (userId: string) => call<{ ok: true }>('DELETE', `${C}/blocks/${id(userId)}`),
  appeal: (actionId: string, body: string) =>
    call<{ id: string }>('POST', `${C}/appeals`, { actionId, body }),
  map: () => call<{ area: string; cells: Array<{ cell: string; contributors: number }> }>('GET', `${C}/map`),

  queue: () => call<{ items: QueueItem[]; appeals: Appeal[] }>('GET', '/api/v1/admin/queue'),
  moderate: (a: { action: string; targetType: string; targetId: string; reason: string; days?: number }) =>
    call<{ id: string }>('POST', '/api/v1/admin/actions', a),
  audit: () =>
    call<{
      actions: Array<{
        id: string;
        moderatorId: string;
        action: string;
        targetType: string;
        targetId: string;
        subjectId: string;
        reason: string;
        until: number | null;
        createdAt: number;
      }>;
    }>('GET', '/api/v1/admin/audit'),
  decide: (appealId: string, decision: 'upheld' | 'overturned') =>
    call<{ ok: true }>('POST', `/api/v1/admin/appeals/${id(appealId)}`, { decision }),
};
