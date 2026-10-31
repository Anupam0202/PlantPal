/**
 * Quantities with explicit dimensions (S1). Conversion only happens inside a dimension;
 * mass, volume, count, length and area are never added together.
 */
export type Dimension = 'mass' | 'volume' | 'length' | 'area' | 'count' | 'temperature';

export interface Quantity<D extends Dimension = Dimension> {
  dim: D;
  value: number;
  unit: string;
}

/** Factor to the canonical unit of each dimension (g, ml, cm, m², item, °C). */
const UNITS: Record<Exclude<Dimension, 'temperature' | 'count'>, Record<string, number>> = {
  mass: { g: 1, kg: 1000, mg: 0.001, lb: 453.59237, oz: 28.349523125 },
  volume: { ml: 1, l: 1000, 'us-gal': 3785.411784, 'uk-gal': 4546.09, 'fl-oz': 29.5735295625 },
  length: { mm: 0.1, cm: 1, m: 100, in: 2.54, ft: 30.48 },
  area: { m2: 1, cm2: 0.0001, ft2: 0.09290304 },
};

export const CANONICAL_UNIT: Record<Dimension, string> = {
  mass: 'g',
  volume: 'ml',
  length: 'cm',
  area: 'm2',
  count: 'item',
  temperature: 'c',
};

export class DimensionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DimensionError';
  }
}

export function qty<D extends Dimension>(
  dim: D,
  value: number,
  unit: string = CANONICAL_UNIT[dim],
): Quantity<D> {
  if (!Number.isFinite(value)) throw new RangeError('Quantity value must be a finite number');
  if (dim !== 'count' && dim !== 'temperature' && !(unit in UNITS[dim as keyof typeof UNITS])) {
    throw new DimensionError(`Unknown ${dim} unit "${unit}"`);
  }
  if (dim === 'temperature' && unit !== 'c' && unit !== 'f')
    throw new DimensionError(`Unknown temperature unit "${unit}"`);
  return { dim, value, unit };
}

/** Converts within the same dimension. Counts never convert (a bunch is not a number of grams). */
export function convert<D extends Dimension>(q: Quantity<D>, unit: string): Quantity<D> {
  if (q.unit === unit) return q;
  if (q.dim === 'count') throw new DimensionError('Counts keep their own label and cannot be converted');
  if (q.dim === 'temperature') {
    if (q.unit === 'c' && unit === 'f') return { ...q, unit, value: (q.value * 9) / 5 + 32 };
    if (q.unit === 'f' && unit === 'c') return { ...q, unit, value: ((q.value - 32) * 5) / 9 };
    throw new DimensionError(`Unknown temperature unit "${unit}"`);
  }
  const table = UNITS[q.dim as keyof typeof UNITS];
  const from = table[q.unit];
  const to = table[unit];
  if (from === undefined || to === undefined) throw new DimensionError(`Cannot convert ${q.unit} to ${unit}`);
  return { ...q, unit, value: (q.value * from) / to };
}

export function toCanonical<D extends Dimension>(q: Quantity<D>): Quantity<D> {
  return q.dim === 'count' ? q : convert(q, CANONICAL_UNIT[q.dim]);
}

/** Adds quantities of one dimension. Throws when dimensions differ. */
export function add<D extends Dimension>(a: Quantity<D>, b: Quantity<D>): Quantity<D> {
  if (a.dim !== b.dim) throw new DimensionError(`Cannot add ${a.dim} to ${b.dim}`);
  if (a.dim === 'temperature') throw new DimensionError('Temperatures are not additive');
  if (a.dim === 'count') {
    if (a.unit !== b.unit) throw new DimensionError(`Cannot add "${a.unit}" to "${b.unit}"`);
    return { ...a, value: a.value + b.value };
  }
  const ca = toCanonical(a);
  const cb = toCanonical(b);
  return { ...ca, value: ca.value + cb.value };
}

/**
 * Totals a mixed list per dimension (and per label for counts): `500 g + 1 kg + 3 bunches`
 * becomes `{ mass: 1500 g, 'count:bunch': 3 bunch }` — never one number.
 */
export function totalsByDimension(items: readonly Quantity[]): Map<string, Quantity> {
  const out = new Map<string, Quantity>();
  for (const q of items) {
    if (q.dim === 'temperature') continue;
    const key = q.dim === 'count' ? `count:${q.unit}` : q.dim;
    const prev = out.get(key);
    out.set(key, prev ? add(prev, q) : toCanonical(q));
  }
  return out;
}

const MASS_ALIASES: Record<string, string> = {
  g: 'g',
  gm: 'g',
  gms: 'g',
  gr: 'g',
  gram: 'g',
  grams: 'g',
  gramme: 'g',
  grammes: 'g',
  kg: 'kg',
  kgs: 'kg',
  kilo: 'kg',
  kilos: 'kg',
  kilogram: 'kg',
  kilograms: 'kg',
  mg: 'mg',
  lb: 'lb',
  lbs: 'lb',
  pound: 'lb',
  pounds: 'lb',
  oz: 'oz',
  ounce: 'oz',
  ounces: 'oz',
};
const VOLUME_ALIASES: Record<string, string> = {
  ml: 'ml',
  millilitre: 'ml',
  millilitres: 'ml',
  milliliter: 'ml',
  milliliters: 'ml',
  l: 'l',
  ltr: 'l',
  litre: 'l',
  litres: 'l',
  liter: 'l',
  liters: 'l',
  gal: 'us-gal',
  gallon: 'us-gal',
  gallons: 'us-gal',
  'fl oz': 'fl-oz',
  floz: 'fl-oz',
};

/** Classifies a free-text unit as a known mass or volume unit, or as a count label. */
export function classifyUnit(
  raw: string,
): { dim: 'mass'; unit: string } | { dim: 'volume'; unit: string } | { dim: 'count'; label: string } {
  const u = raw.trim().toLowerCase().replace(/\.$/, '');
  const mass = MASS_ALIASES[u];
  if (mass) return { dim: 'mass', unit: mass };
  const vol = VOLUME_ALIASES[u];
  if (vol) return { dim: 'volume', unit: vol };
  return { dim: 'count', label: u };
}
