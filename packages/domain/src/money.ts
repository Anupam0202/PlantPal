/** Money as integer minor units (e.g. paise, cents) plus ISO 4217 currency and exponent. */
export interface Money {
  minor: bigint;
  currency: string;
  exponent: number;
}

export class CurrencyMismatchError extends Error {
  constructor(a: string, b: string) {
    super(`Cannot combine ${a} with ${b}`);
    this.name = 'CurrencyMismatchError';
  }
}

const CURRENCY_RE = /^[A-Z]{3}$/;

export function money(minor: bigint | number, currency: string, exponent = 2): Money {
  if (!CURRENCY_RE.test(currency)) throw new RangeError(`Invalid currency code "${currency}"`);
  if (!Number.isInteger(exponent) || exponent < 0 || exponent > 4) throw new RangeError('Invalid exponent');
  if (typeof minor === 'number' && !Number.isSafeInteger(minor))
    throw new RangeError('Minor units must be an integer');
  return { minor: BigInt(minor), currency, exponent };
}

/** Parses a decimal string ("12.50") into minor units without floating-point rounding. */
export function parseMoney(text: string, currency: string, exponent = 2): Money | null {
  const m = /^\s*(-)?(\d+)(?:[.,](\d+))?\s*$/.exec(text);
  if (!m) return null;
  const frac = m[3] ?? '';
  if (frac.length > exponent) return null;
  const digits = (m[2] ?? '0') + frac.padEnd(exponent, '0');
  const minor = BigInt(digits) * (m[1] ? -1n : 1n);
  return money(minor, currency, exponent);
}

export function addMoney(a: Money, b: Money): Money {
  if (a.currency !== b.currency || a.exponent !== b.exponent)
    throw new CurrencyMismatchError(a.currency, b.currency);
  return { ...a, minor: a.minor + b.minor };
}

/** Totals per currency; different currencies are never summed together. */
export function totalsByCurrency(items: readonly Money[]): Map<string, Money> {
  const out = new Map<string, Money>();
  for (const m of items) {
    const prev = out.get(m.currency);
    out.set(m.currency, prev ? addMoney(prev, m) : m);
  }
  return out;
}

/** Decimal string for display or export, e.g. `{minor: 1250n, exponent: 2}` → "12.50". */
export function moneyToDecimalString(m: Money): string {
  const neg = m.minor < 0n;
  const abs = (neg ? -m.minor : m.minor).toString().padStart(m.exponent + 1, '0');
  const whole = abs.slice(0, abs.length - m.exponent);
  const frac = m.exponent > 0 ? '.' + abs.slice(abs.length - m.exponent) : '';
  return (neg ? '-' : '') + whole + frac;
}

/** JSON-safe form (bigint becomes a string). */
export function moneyToJSON(m: Money): { minor: string; currency: string; exponent: number } {
  return { minor: m.minor.toString(), currency: m.currency, exponent: m.exponent };
}

export function moneyFromJSON(v: { minor: string; currency: string; exponent: number }): Money {
  return money(BigInt(v.minor), v.currency, v.exponent);
}
