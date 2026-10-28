import { z } from 'zod';

/** Crockford base32 ULID: 10 time chars + 16 random chars. */
export const ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/;
export const Id = z.string().regex(ULID_RE, 'Expected a ULID');
export type Id = z.infer<typeof Id>;

const LOCAL_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** True when `s` is a real calendar date written as YYYY-MM-DD. */
export function isLocalDateString(s: string): boolean {
  const m = LOCAL_DATE_RE.exec(s);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1) return false;
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo - 1] ?? 0;
  return d <= days;
}

/** Garden-local calendar date (no time, no zone), interpreted in the garden's time zone. */
export const LocalDate = z.string().refine(isLocalDateString, 'Expected a date as YYYY-MM-DD');
export type LocalDate = z.infer<typeof LocalDate>;

/** UTC epoch milliseconds. */
export const EpochMs = z.number().int().nonnegative();

export const EVIDENCE = [
  'MEASURED',
  'OFFICIAL',
  'PEER_REVIEWED',
  'EXTENSION',
  'MODELLED',
  'COMMUNITY',
  'AI_DRAFT',
  'TRADITION',
  'UNKNOWN',
] as const;
export const Evidence = z.enum(EVIDENCE);
export type Evidence = z.infer<typeof Evidence>;

/** Optional non-negative number where `null` means "not recorded" (never zero by default). */
export const OptionalAmount = z.number().finite().nonnegative().nullable();

export const ShortText = z.string().trim().max(200);
export const LongText = z.string().max(10_000);

/**
 * Where a record came from. Legacy imports keep every field the v4 model has no home for in
 * `extra`, so nothing the user wrote is lost.
 */
export const RecordSource = z
  .object({
    kind: z.enum(['legacy-v3', 'import']),
    key: z.string().max(100),
    legacyId: z.string().max(200).nullable(),
    extra: z.record(z.string(), z.unknown()).optional(),
  })
  .nullable();
export type RecordSource = z.infer<typeof RecordSource>;
