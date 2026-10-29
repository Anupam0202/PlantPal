import type {
  Evidence,
  Level,
  RegionStatus,
  RegionStatusValue,
  Taxon,
  ToxicityAssertion,
  ToxicityGroup,
  TraitAssertion,
  TraitKey,
} from '@plantpal/schemas';
import {
  type INDOOR_LIGHT,
  type LIFEFORMS,
  type SOW_SEASONS,
  TRAITS,
  type USE_GROUPS,
} from '@plantpal/schemas';
import { SOURCES } from './sources';

type Lifeform = (typeof LIFEFORMS)[number];
type UseGroup = (typeof USE_GROUPS)[number];
type SowSeason = (typeof SOW_SEASONS)[number];
type IndoorLight = (typeof INDOOR_LIGHT)[number];
type Pair = readonly [number, number];

/** Compact authoring form for one taxon's draft traits. Expanded by `taxon()` into full assertions. */
export interface TraitSpec {
  life: Lifeform;
  use: UseGroup;
  /** Direct sun the plant does well in, h/day. */
  sun: Pair;
  indoor?: IndoorLight;
  /** Lowest air temperature the plant survives, °C. */
  minT: number;
  heat: Level;
  h: Pair;
  s: Pair;
  /** Smallest sensible container, litres. */
  pot: number;
  water: Level;
  effort: Level;
  /** Days from sowing or planting to first harvest or flowering. Omitted for foliage plants. */
  dtm?: Pair;
  sow: SowSeason;
  poll: Level;
  food: 'none' | Level;
  orn: Level;
  /** Usual outdoor flowering months (1–12), northern-hemisphere reference. Omitted when unknown. */
  bloom?: readonly number[];
}

const range = ([min, max]: Pair) => ({ min, max });

function draft<K extends TraitKey>(trait: K, value: unknown): TraitAssertion {
  return {
    trait,
    value,
    unit: TRAITS[trait].unit,
    evidence: 'AI_DRAFT',
    sourceId: SOURCES.draft.id,
    review: 'needs_review',
  };
}

function traits(t: TraitSpec): TraitAssertion[] {
  const out: TraitAssertion[] = [
    draft('lifeform', t.life),
    draft('useGroup', t.use),
    draft('sunHours', range(t.sun)),
    draft('minTempC', t.minT),
    draft('heatTolerance', t.heat),
    draft('heightCm', range(t.h)),
    draft('spreadCm', range(t.s)),
    draft('minContainerL', t.pot),
    draft('waterNeed', t.water),
    draft('effort', t.effort),
    draft('sowSeason', t.sow),
    draft('pollinatorValue', t.poll),
    draft('foodValue', t.food),
    draft('ornamentalValue', t.orn),
  ];
  if (t.indoor) out.push(draft('indoorLight', t.indoor));
  if (t.dtm) out.push(draft('daysToMaturity', range(t.dtm)));
  if (t.bloom) out.push(draft('bloomMonths', [...t.bloom]));
  return out;
}

/** Native or introduced status drafted from general knowledge; needs checking against WCVP. */
export function nativeDraft(region: string, status: RegionStatusValue = 'NATIVE'): RegionStatus {
  return { region, status, evidence: 'AI_DRAFT', sourceId: SOURCES.draft.id, review: 'needs_review' };
}

export function listed(
  region: string,
  sourceId: string,
  status: RegionStatusValue = 'INVASIVE_LISTED',
  evidence: Evidence = 'OFFICIAL',
): RegionStatus {
  return { region, status, evidence, sourceId, review: 'needs_review' };
}

/** ASPCA statements for the groups it covers. `slug` is the plant page under the ASPCA list. */
export function aspca(
  slug: string | null,
  statuses: Partial<Record<Exclude<ToxicityGroup, 'people'>, 'TOXIC' | 'NON_TOXIC_LISTED'>>,
  note?: string,
): ToxicityAssertion[] {
  return (Object.entries(statuses) as Array<[ToxicityGroup, 'TOXIC' | 'NON_TOXIC_LISTED']>).map(
    ([group, status]) => ({
      group,
      status,
      evidence: 'EXTENSION',
      sourceId: SOURCES.aspca.id,
      ...(slug ? { sourceUrl: `${SOURCES.aspca.url}/${slug}` } : {}),
      review: 'needs_review',
      ...(note ? { note } : {}),
    }),
  );
}

export function taxon(
  id: string,
  scientificName: string,
  family: string,
  names: Taxon['names'],
  spec: TraitSpec,
  extra: { regions?: RegionStatus[]; toxicity?: ToxicityAssertion[] } = {},
): Taxon {
  return {
    id,
    scientificName,
    family,
    gbifKey: null,
    names,
    traits: traits(spec),
    regions: extra.regions ?? [],
    toxicity: extra.toxicity ?? [],
  };
}
