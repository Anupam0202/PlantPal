import type { NumRange } from '@plantpal/schemas';

/** Growth scenarios (§6.7): illustrative sizes from the catalogue's size ranges, with an uncertainty band. */
export const GROWTH_STAGES = ['planting', '1y', '3y', 'mature'] as const;
export type GrowthStage = (typeof GROWTH_STAGES)[number];

const FACTORS: Record<string, Record<GrowthStage, number>> = {
  // Annuals reach full size within one season and are sown again: they "reset" each year.
  annual: { planting: 0.1, '1y': 1, '3y': 1, mature: 1 },
  biennial: { planting: 0.1, '1y': 0.7, '3y': 1, mature: 1 },
  perennial: { planting: 0.15, '1y': 0.6, '3y': 1, mature: 1 },
  bulb: { planting: 0.2, '1y': 0.9, '3y': 1, mature: 1 },
  grass: { planting: 0.15, '1y': 0.6, '3y': 1, mature: 1 },
  climber: { planting: 0.1, '1y': 0.4, '3y': 0.8, mature: 1 },
  shrub: { planting: 0.1, '1y': 0.35, '3y': 0.75, mature: 1 },
  tree: { planting: 0.05, '1y': 0.15, '3y': 0.4, mature: 1 },
};

export interface GrowthSize {
  min: number;
  max: number;
  /** The value drawn; the band [min, max] shows the uncertainty. */
  mid: number;
  /** Annuals are re-sown each season. */
  resets: boolean;
}

export function sizeAtStage(
  range: NumRange | null,
  lifeform: string | null,
  stage: GrowthStage,
): GrowthSize | null {
  if (!range) return null;
  const f = (FACTORS[lifeform ?? ''] ?? FACTORS.perennial!)[stage];
  const min = Math.round(range.min * f * 10) / 10;
  const max = Math.round(range.max * f * 10) / 10;
  return { min, max, mid: Math.round(((min + max) / 2) * 10) / 10, resets: lifeform === 'annual' };
}
