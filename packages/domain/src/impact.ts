import type {
  CareEvent,
  Container,
  Harvest,
  NatureVisit,
  PantryItem,
  RegionStatusValue,
  Specimen,
  Taxon,
} from '@plantpal/schemas';
import { trait } from './eligibility';
import { totalsOf } from './harvest';
import { taxaObserved } from './nature';

export type LedgerMethod = 'MEASURED' | 'ESTIMATED' | 'DERIVED';

/** Where a line's figure comes from. The app words it in the person's language. */
export type LedgerSource = 'own' | 'catalogue-native' | 'bloom-bridge' | 'catalogue-spread' | 'not-estimated';

/** What limits a line's figure, with the numbers the wording needs. */
export type LedgerNote =
  | { kind: 'unlinked'; plants: number }
  | { kind: 'missing-months' }
  | { kind: 'effort' }
  | { kind: 'substrate'; containers: number }
  | { kind: 'spread'; lo: number; hi: number; plants: number }
  | { kind: 'no-method' };

export type LedgerMetric =
  | 'food-mass'
  | 'food-count'
  | 'water-rain'
  | 'water-potable'
  | 'water-grey'
  | 'waterings-unmeasured'
  | 'composted'
  | 'native-specimens'
  | 'bloom-months'
  | 'nature-visits'
  | 'nature-minutes'
  | 'taxa-observed'
  | 'shared-plants'
  | 'shared-produce-mass'
  | 'peat-free-share'
  | 'canopy-area'
  | 'trees'
  | 'carbon';

export interface LedgerRow {
  metric: LedgerMetric;
  /** `null` means not known or not estimated: shown as such, never as 0 (S2). */
  value: number | null;
  unit: string;
  /** For counts: the label ("bunch", "piece"). */
  label?: string;
  method: LedgerMethod;
  source: LedgerSource;
  uncertainty: LedgerNote | null;
}

export interface LedgerInput {
  period: { from: string; to: string };
  harvests: readonly Harvest[];
  careEvents: readonly CareEvent[];
  pantry: readonly PantryItem[];
  visits: readonly NatureVisit[];
  specimens: readonly Specimen[];
  containers: readonly Container[];
  taxonOf: (s: Specimen) => Taxon | null;
  nativeStatus: (t: Taxon) => RegionStatusValue;
  /** Months with known pollinator forage, from the Bloom Bridge. */
  forageMonths: number | null;
}

const inPeriod = (on: string, p: LedgerInput['period']) => on >= p.from && on <= p.to;
const r1 = (v: number) => Math.round(v * 10) / 10;

/**
 * Impact Ledger v1 (§6.14). Every row says how it was obtained. Logged values are `MEASURED`, counts
 * over records are `DERIVED`, model-based values are `ESTIMATED` with their uncertainty. Carbon is not
 * estimated for herbaceous plants and has no number without a cited allometry (S12).
 */
export function impactLedger(i: LedgerInput): LedgerRow[] {
  const rows: LedgerRow[] = [];
  const p = i.period;
  const own: LedgerSource = 'own';

  const harvests = i.harvests.filter((h) => h.deletedAt === null && inPeriod(h.harvestedOn, p));
  const food = totalsOf(harvests);
  rows.push({
    metric: 'food-mass',
    value: food.massG / 1000,
    unit: 'kg',
    method: 'MEASURED',
    source: own,
    uncertainty: null,
  });
  for (const [label, n] of Object.entries(food.counts))
    rows.push({
      metric: 'food-count',
      value: n,
      unit: 'count',
      label,
      method: 'MEASURED',
      source: own,
      uncertainty: null,
    });

  const water = i.careEvents.filter(
    (e) => e.deletedAt === null && e.kind === 'water' && inPeriod(e.occurredOn, p),
  );
  const litres = (src: CareEvent['waterSource']) =>
    water
      .filter((e) => e.waterSource === src && e.amountMl !== null)
      .reduce((a, e) => a + (e.amountMl ?? 0), 0) / 1000;
  rows.push({
    metric: 'water-rain',
    value: r1(litres('rain')),
    unit: 'L',
    method: 'MEASURED',
    source: own,
    uncertainty: null,
  });
  rows.push({
    metric: 'water-potable',
    value: r1(litres('tap')),
    unit: 'L',
    method: 'MEASURED',
    source: own,
    uncertainty: null,
  });
  rows.push({
    metric: 'water-grey',
    value: r1(litres('grey')),
    unit: 'L',
    method: 'MEASURED',
    source: own,
    uncertainty: null,
  });
  const unmeasured = water.filter((e) => e.amountMl === null).length;
  if (unmeasured > 0)
    rows.push({
      metric: 'waterings-unmeasured',
      value: unmeasured,
      unit: 'count',
      method: 'MEASURED',
      source: own,
      uncertainty: null,
    });

  const pantryIn = i.pantry.filter(
    (x) => x.deletedAt === null && inPeriod(new Date(x.updatedAt).toISOString().slice(0, 10), p),
  );
  const composted = totalsOf([
    ...pantryIn.filter((x) => x.state === 'composted'),
    ...harvests.filter((h) => h.destination === 'composted'),
  ]);
  rows.push({
    metric: 'composted',
    value: composted.massG / 1000,
    unit: 'kg',
    method: 'MEASURED',
    source: own,
    uncertainty: null,
  });

  const given = totalsOf([
    ...pantryIn.filter((x) => x.state === 'given'),
    ...harvests.filter((h) => h.destination === 'shared'),
  ]);
  rows.push({
    metric: 'shared-produce-mass',
    value: given.massG / 1000,
    unit: 'kg',
    method: 'MEASURED',
    source: own,
    uncertainty: null,
  });
  rows.push({
    metric: 'shared-plants',
    value: i.specimens.filter((s) => s.deletedAt === null && s.status === 'given_away').length,
    unit: 'count',
    method: 'DERIVED',
    source: own,
    uncertainty: null,
  });

  const active = i.specimens.filter(
    (s) => s.deletedAt === null && (s.status === 'active' || s.status === 'dormant'),
  );
  const linked = active.map((s) => ({ s, t: i.taxonOf(s) }));
  const natives = linked.filter(({ t }) => t && i.nativeStatus(t) === 'NATIVE').length;
  const unlinked = linked.filter(({ t }) => !t).length;
  rows.push({
    metric: 'native-specimens',
    value: natives,
    unit: 'count',
    method: 'DERIVED',
    source: 'catalogue-native',
    uncertainty: unlinked ? { kind: 'unlinked', plants: unlinked } : null,
  });
  rows.push({
    metric: 'bloom-months',
    value: i.forageMonths,
    unit: 'months',
    method: 'DERIVED',
    source: 'bloom-bridge',
    uncertainty: i.forageMonths === null ? null : { kind: 'missing-months' },
  });

  const visits = i.visits.filter((v) => v.deletedAt === null && inPeriod(v.occurredOn, p));
  rows.push({
    metric: 'nature-visits',
    value: visits.length,
    unit: 'count',
    method: 'MEASURED',
    source: own,
    uncertainty: null,
  });
  rows.push({
    metric: 'nature-minutes',
    value: Math.round(visits.reduce((a, v) => a + v.durationS, 0) / 60),
    unit: 'min',
    method: 'MEASURED',
    source: own,
    uncertainty: null,
  });
  rows.push({
    metric: 'taxa-observed',
    value: taxaObserved(visits).length,
    unit: 'count',
    method: 'DERIVED',
    source: own,
    uncertainty: { kind: 'effort' },
  });

  const known = i.containers.filter((c) => c.deletedAt === null && c.substrateType !== null);
  rows.push({
    metric: 'peat-free-share',
    value: known.length
      ? Math.round(
          (known.filter((c) => c.substrateType === 'peat-free' || c.substrateType === 'coir').length /
            known.length) *
            100,
        )
      : null,
    unit: '%',
    method: 'DERIVED',
    source: own,
    uncertainty: known.length ? { kind: 'substrate', containers: known.length } : null,
  });

  let area = 0;
  let lo = 0;
  let hi = 0;
  let counted = 0;
  for (const { t } of linked) {
    const s = t ? trait(t, 'spreadCm') : null;
    if (!s) continue;
    const disc = (cm: number) => Math.PI * (cm / 200) ** 2;
    area += disc((s.min + s.max) / 2);
    lo += disc(s.min);
    hi += disc(s.max);
    counted++;
  }
  rows.push({
    metric: 'canopy-area',
    value: counted ? r1(area) : null,
    unit: 'm²',
    method: 'ESTIMATED',
    source: 'catalogue-spread',
    uncertainty: counted ? { kind: 'spread', lo: r1(lo), hi: r1(hi), plants: counted } : null,
  });
  rows.push({
    metric: 'trees',
    value: linked.filter(({ t }) => t && trait(t, 'lifeform') === 'tree').length,
    unit: 'count',
    method: 'DERIVED',
    source: own,
    uncertainty: null,
  });
  rows.push({
    metric: 'carbon',
    value: null,
    unit: 'kg CO₂',
    method: 'ESTIMATED',
    source: 'not-estimated',
    uncertainty: { kind: 'no-method' },
  });
  return rows;
}
