import { ULID_RE } from '@plantpal/schemas';

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const TIME_MAX = 2 ** 48 - 1;

function encodeTime(ms: number): string {
  if (!Number.isInteger(ms) || ms < 0 || ms > TIME_MAX) throw new RangeError(`Invalid ULID time: ${ms}`);
  let out = '';
  let t = ms;
  for (let i = 0; i < 10; i++) {
    out = ALPHABET[t % 32] + out;
    t = Math.floor(t / 32);
  }
  return out;
}

/** Encodes 10 bytes (80 bits) as 16 base32 characters. */
function encodeRandom(bytes: Uint8Array): string {
  let out = '';
  let buffer = 0;
  let bits = 0;
  for (let i = 0; i < 10; i++) {
    buffer = (buffer << 8) | (bytes[i] ?? 0);
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(buffer >> (bits - 5)) & 31];
      bits -= 5;
    }
    buffer &= (1 << bits) - 1;
  }
  return out;
}

function randomBytes(): Uint8Array {
  const b = new Uint8Array(10);
  globalThis.crypto.getRandomValues(b);
  return b;
}

/** Increments the 80-bit random part so ids created in the same millisecond still sort. */
function increment(bytes: Uint8Array): Uint8Array {
  const next: Uint8Array = bytes.slice();
  for (let i = next.length - 1; i >= 0; i--) {
    const v = next[i] ?? 0;
    if (v < 255) {
      next[i] = v + 1;
      return next;
    }
    next[i] = 0;
  }
  throw new RangeError('ULID random overflow');
}

let lastTime = -1;
let lastRandom: Uint8Array = new Uint8Array(10);

/** New monotonic ULID. */
export function newId(now: number = Date.now()): string {
  if (now <= lastTime) {
    lastRandom = increment(lastRandom);
    return encodeTime(lastTime) + encodeRandom(lastRandom);
  }
  lastTime = now;
  lastRandom = randomBytes();
  return encodeTime(now) + encodeRandom(lastRandom);
}

/**
 * Deterministic ULID: the same `(timeMs, seed)` always yields the same id. Used by the legacy
 * migration so a re-run or a resumed run never creates duplicates.
 */
export function deterministicId(timeMs: number, seed: string): string {
  const t = Math.min(Math.max(0, Math.floor(timeMs)), TIME_MAX);
  return encodeTime(t) + encodeRandom(hash80(seed));
}

export function isId(value: unknown): value is string {
  return typeof value === 'string' && ULID_RE.test(value);
}

/** Creation time encoded in a ULID. */
export function idTime(id: string): number {
  let t = 0;
  for (let i = 0; i < 10; i++) t = t * 32 + ALPHABET.indexOf(id.charAt(i));
  return t;
}

/** 80-bit non-cryptographic hash (two independent 53-bit cyrb53 lanes). */
export function hash80(input: string): Uint8Array {
  const a = cyrb53(input, 0x9e3779b1);
  const b = cyrb53(input, 0x85ebca77);
  const out = new Uint8Array(10);
  // 5 bytes from each lane (40 bits each).
  for (let i = 0; i < 5; i++) {
    out[i] = Math.floor(a / 2 ** (8 * i)) & 255;
    out[5 + i] = Math.floor(b / 2 ** (8 * i)) & 255;
  }
  return out;
}

function cyrb53(str: string, seed: number): number {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}
