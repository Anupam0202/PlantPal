import type { NumRange, TraitAssertion } from '@plantpal/schemas';

/** A trait value as short text with its unit. */
export function traitText(a: Pick<TraitAssertion, 'value' | 'unit'>, levels: Record<string, string>): string {
  const v = a.value as unknown;
  const unit = a.unit ? ` ${a.unit}` : '';
  if (typeof v === 'number') return `${v}${unit}`;
  if (typeof v === 'string') return levels[v] ?? v;
  if (Array.isArray(v)) return v.join(', ') + unit;
  if (v && typeof v === 'object' && 'min' in v && 'max' in v) {
    const r = v as NumRange;
    return r.min === r.max ? `${r.min}${unit}` : `${r.min}–${r.max}${unit}`;
  }
  return '—';
}
