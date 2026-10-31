import type {
  Goal,
  RegionStatus,
  RegionStatusValue,
  Taxon,
  ToxicityGroup,
  TraitKey,
  TraitValue,
} from '@plantpal/schemas';
import { GOALS, type INDOOR_LIGHT } from '@plantpal/schemas';
import { growingMonths } from './sunhours';

/**
 * Recommendation and eligibility engine (§17). Hard rules E1–E7 decide status; the soft
 * score only ranks eligible plants and can never override a hard rule. Results are deterministic.
 */

export { GOALS };
export type { Goal };

export type IndoorLightLevel = (typeof INDOOR_LIGHT)[number];
export type WaterAccess = 'tap' | 'carry' | 'rain';

export interface Household {
  cats: boolean;
  dogs: boolean;
  children: boolean;
}

export interface ZoneFacts {
  /** Indoors or a windowsill inside: light is judged by window class, temperature by the home. */
  indoor: boolean;
  /** Rain cannot reach it (S5). Null when unknown. */
  covered: boolean | null;
  /** Plants grow in containers (roots less protected from cold). */
  containers: boolean;
  rooftop: boolean;
  /** Direct-sun hours on the 21st of each month, January first. Null when unknown — never 0 by default. */
  sunMonthly: number[] | null;
  indoorLight: IndoorLightLevel | null;
  areaM2: number | null;
  clearanceCm: number | null;
  maxContainerL: number | null;
}

export interface ClimateFacts {
  /** Mean annual extreme minimum temperature, °C. */
  extremeMinC: number | null;
  /** Where the value came from: measured series or the user's answers to the manual questions. */
  basis: 'measured' | 'manual' | null;
  /** Frost-free days a year (365 when frost is rare). */
  seasonDays: number | null;
  /** Summers with many days above 35 °C. */
  hotSummers: boolean | null;
}

export interface EligibilityContext {
  lat: number | null;
  region: { countryCode: string | null; l3: string | null };
  /** Null when the user has not answered; no toxicity rule is applied then, and the UI asks. */
  household: Household | null;
  /** Show plants toxic to the household with a warning instead of excluding them (opt-in). */
  showToxicWithWarning: boolean;
  zone: ZoneFacts;
  climate: ClimateFacts;
  water: { access: WaterAccess | null; minutesPerWeek: number | null };
  goals: Goal[];
  /** Visible, adjustable weights per goal; missing goals weigh 1. */
  weights?: Partial<Record<Goal | 'effort' | 'light', number>>;
  /** Extra cold margin for roots in containers, °C (§17.2 E5). */
  containerMarginC: number;
  /** Current month in the garden's time zone, 0 = January. */
  month: number;
  /** Sowing months from local climatology (§6.15); without them a hemisphere and latitude rule is used. */
  sowWindows?: { warm: number[]; cool: number[] } | null;
}

export type RuleId = 'E1' | 'E2' | 'E3' | 'E4' | 'E5' | 'E6' | 'E7';
export type FindingOutcome = 'exclude' | 'needs_input' | 'tradeoff' | 'review' | 'pass';

export interface Finding {
  rule: RuleId;
  outcome: FindingOutcome;
  /** i18n key under `plan.reason`. */
  code: string;
  params?: Record<string, string | number>;
  sourceId?: string;
}

export type CandidateStatus = 'ELIGIBLE' | 'NEEDS_INPUT' | 'EXCLUDED';
export type CandidateFlag = 'NEEDS_REVIEW' | 'TOXIC_WARNING' | 'STATUS_CONFLICT' | 'DRAFT_TRAITS';

export interface Candidate {
  taxonId: string;
  status: CandidateStatus;
  findings: Finding[];
  flags: CandidateFlag[];
  nativeStatus: RegionStatusValue;
  /** 0–100 for eligible plants; null otherwise (a score never rescues an excluded plant). */
  score: number | null;
  scoreParts: Partial<Record<Goal | 'effort' | 'light', number>>;
  timing: { sowNow: boolean; nextMonth: number | null };
}

// ---------------------------------------------------------------- helpers

export function trait<K extends TraitKey>(t: Taxon, key: K): TraitValue<K> | null {
  const a = t.traits.find((x) => x.trait === key);
  return a ? (a.value as TraitValue<K>) : null;
}

const LEVEL = { none: 0, low: 1 / 3, medium: 2 / 3, high: 1 } as const;
const round = (x: number) => Math.round(x * 10) / 10;

/** Statuses that apply to the garden's region, the finer botanical country first. */
export function regionStatuses(t: Taxon, region: EligibilityContext['region']): RegionStatus[] {
  const l3 = region.l3 ? `L3:${region.l3}` : null;
  return [
    ...t.regions.filter((r) => l3 !== null && r.region === l3),
    ...t.regions.filter((r) => region.countryCode !== null && r.region === region.countryCode),
  ];
}

export function nativeStatusOf(t: Taxon, region: EligibilityContext['region']): RegionStatusValue {
  const statuses = regionStatuses(t, region);
  if (statuses.some((s) => s.status === 'INVASIVE_LISTED')) return 'INVASIVE_LISTED';
  const distinct = new Set(statuses.map((s) => s.status));
  if (distinct.has('CONFLICT') || (distinct.has('NATIVE') && distinct.has('INTRODUCED'))) {
    // A finer region that agrees with itself wins over a country-level disagreement.
    const first = statuses[0];
    if (
      first &&
      first.region.startsWith('L3:') &&
      statuses.filter((s) => s.region === first.region).length === 1
    )
      return first.status;
    return 'CONFLICT';
  }
  return statuses[0]?.status ?? 'UNKNOWN';
}

function isPerennial(t: Taxon): boolean {
  const life = trait(t, 'lifeform');
  return life !== null && life !== 'annual';
}

/** Months (0–11) when sowing or planting makes sense, by season, hemisphere and latitude (S18). */
export function sowMonths(season: 'cool' | 'warm' | 'any', lat: number | null): number[] {
  const all = Array.from({ length: 12 }, (_, i) => i);
  if (season === 'any' || lat === null) return all;
  if (Math.abs(lat) < 23.5) return season === 'warm' ? [1, 2, 3, 4, 5, 6] : [8, 9, 10, 11];
  const north = season === 'warm' ? [3, 4, 5] : [1, 2, 7, 8];
  return lat >= 0 ? north : north.map((m) => (m + 6) % 12);
}

// ---------------------------------------------------------------- rules

function e1(t: Taxon, ctx: EligibilityContext, out: Finding[], flags: Set<CandidateFlag>) {
  const statuses = regionStatuses(t, ctx.region);
  const invasive = statuses.find((s) => s.status === 'INVASIVE_LISTED');
  if (invasive) {
    out.push({
      rule: 'E1',
      outcome: 'exclude',
      code: 'invasiveListed',
      params: { region: invasive.region.replace(/^L3:/, '') },
      sourceId: invasive.sourceId,
    });
    return;
  }
  // Unknown country: we cannot check national lists, so a plant listed somewhere is flagged (S9).
  if (ctx.region.countryCode === null && t.regions.some((r) => r.status === 'INVASIVE_LISTED')) {
    flags.add('NEEDS_REVIEW');
    out.push({ rule: 'E1', outcome: 'review', code: 'invasiveElsewhere' });
  }
  if (nativeStatusOf(t, ctx.region) === 'CONFLICT') {
    flags.add('STATUS_CONFLICT');
    out.push({ rule: 'E1', outcome: 'review', code: 'statusConflict' });
  }
}

const GROUP_OF: Record<keyof Household, ToxicityGroup> = { cats: 'cats', dogs: 'dogs', children: 'people' };

function e2(t: Taxon, ctx: EligibilityContext, out: Finding[], flags: Set<CandidateFlag>) {
  if (!ctx.household) return;
  const members = (Object.keys(GROUP_OF) as Array<keyof Household>).filter((m) => ctx.household?.[m]);
  const unknown: string[] = [];
  for (const m of members) {
    const group = GROUP_OF[m];
    const stated = t.toxicity.filter((x) => x.group === group);
    const toxic = stated.find((x) => x.status === 'TOXIC');
    if (toxic) {
      if (ctx.showToxicWithWarning) {
        flags.add('TOXIC_WARNING');
        out.push({
          rule: 'E2',
          outcome: 'tradeoff',
          code: 'toxicTo',
          params: { group: m },
          sourceId: toxic.sourceId,
        });
      } else {
        out.push({
          rule: 'E2',
          outcome: 'exclude',
          code: 'toxicTo',
          params: { group: m },
          sourceId: toxic.sourceId,
        });
      }
      continue;
    }
    // Only a reviewed non-toxic listing clears the badge; an unreviewed one is still worth a look (S10).
    const cleared = stated.some((x) => x.status === 'NON_TOXIC_LISTED' && x.review === 'reviewed');
    if (!cleared) unknown.push(m);
  }
  if (unknown.length > 0) {
    flags.add('NEEDS_REVIEW');
    out.push({
      rule: 'E2',
      outcome: 'review',
      code: 'toxicityUnverified',
      params: { groups: unknown.join(',') },
    });
  }
}

function e3(t: Taxon, ctx: EligibilityContext, out: Finding[]) {
  const z = ctx.zone;
  const height = trait(t, 'heightCm');
  const spread = trait(t, 'spreadCm');
  const pot = trait(t, 'minContainerL');
  if (height && z.clearanceCm !== null) {
    if (height.min > z.clearanceCm)
      out.push({
        rule: 'E3',
        outcome: 'exclude',
        code: 'tooTall',
        params: { height: height.min, clearance: z.clearanceCm },
      });
    else if (height.max > z.clearanceCm)
      out.push({
        rule: 'E3',
        outcome: 'tradeoff',
        code: 'mayOutgrow',
        params: { height: height.max, clearance: z.clearanceCm },
      });
  }
  if (pot !== null && z.containers && z.maxContainerL !== null && pot > z.maxContainerL)
    out.push({
      rule: 'E3',
      outcome: 'exclude',
      code: 'potTooSmall',
      params: { need: pot, have: z.maxContainerL },
    });
  if (spread && z.areaM2 !== null) {
    const footprint = (spread.min / 100) ** 2;
    if (footprint > z.areaM2)
      out.push({
        rule: 'E3',
        outcome: 'exclude',
        code: 'tooWide',
        params: { spread: spread.min, area: z.areaM2 },
      });
  }
  // Wet potting mix weighs roughly 1 kg per litre: big pots on roofs need a structural check (S13).
  if (pot !== null && z.rooftop && pot >= 40)
    out.push({
      rule: 'E3',
      outcome: 'tradeoff',
      code: 'heavyOnRoof',
      params: { litres: pot, kg: Math.round(pot) },
    });
}

const LIGHT_RANK: Record<IndoorLightLevel, number> = {
  low: 0,
  medium: 1,
  'bright-indirect': 2,
  'bright-direct': 3,
};

function e4(t: Taxon, ctx: EligibilityContext, out: Finding[]): { lo: number; hi: number } | null {
  const sun = trait(t, 'sunHours');
  const z = ctx.zone;
  if (z.sunMonthly && z.sunMonthly.length === 12 && sun) {
    const season = trait(t, 'sowSeason') ?? 'any';
    const months = isPerennial(t) ? growingMonths('any', ctx.lat ?? 0) : growingMonths(season, ctx.lat ?? 0);
    const values = months.map((m) => z.sunMonthly?.[m] ?? 0);
    // Preserve 0: Math.min/max of real numbers, never a truthy default.
    const lo = Math.min(...values);
    const hi = Math.max(...values);
    if (hi < sun.min)
      out.push({
        rule: 'E4',
        outcome: 'exclude',
        code: 'tooLittleSun',
        params: { need: sun.min, have: round(hi) },
      });
    else if (lo > sun.max)
      out.push({
        rule: 'E4',
        outcome: 'exclude',
        code: 'tooMuchSun',
        params: { max: sun.max, have: round(lo) },
      });
    else if (lo < sun.min)
      out.push({
        rule: 'E4',
        outcome: 'tradeoff',
        code: 'sunSomeMonths',
        params: { need: sun.min, low: round(lo) },
      });
    return { lo, hi };
  }
  if (z.indoor && z.indoorLight) {
    const need = trait(t, 'indoorLight');
    if (need) {
      if (LIGHT_RANK[z.indoorLight] < LIGHT_RANK[need])
        out.push({
          rule: 'E4',
          outcome: 'exclude',
          code: 'needsBrighterWindow',
          params: { need, have: z.indoorLight },
        });
      else if (z.indoorLight === 'bright-direct' && LIGHT_RANK[need] <= 1)
        out.push({ rule: 'E4', outcome: 'tradeoff', code: 'shieldFromDirectSun' });
    } else if (sun && sun.min > 0) {
      if (z.indoorLight === 'bright-direct' && sun.min <= 6)
        out.push({ rule: 'E4', outcome: 'tradeoff', code: 'sunnySillOnly' });
      else out.push({ rule: 'E4', outcome: 'exclude', code: 'needsOutdoorSun', params: { need: sun.min } });
    }
    return null;
  }
  out.push({ rule: 'E4', outcome: 'needs_input', code: 'lightUnknown' });
  return null;
}

function e5(t: Taxon, ctx: EligibilityContext, out: Finding[]) {
  if (ctx.zone.indoor) return;
  const c = ctx.climate;
  const minT = trait(t, 'minTempC');
  const heat = trait(t, 'heatTolerance');
  const perennial = isPerennial(t);
  if (perennial && minT !== null) {
    if (c.extremeMinC === null) {
      out.push({ rule: 'E5', outcome: 'needs_input', code: 'climateUnknown' });
    } else {
      const margin = ctx.zone.containers ? ctx.containerMarginC : 0;
      const need = c.extremeMinC - margin;
      const params = { min: minT, local: round(c.extremeMinC), margin, basis: c.basis ?? 'measured' };
      if (minT > need) out.push({ rule: 'E5', outcome: 'exclude', code: 'tooCold', params });
      else if (minT > need - 2) out.push({ rule: 'E5', outcome: 'tradeoff', code: 'borderlineCold', params });
    }
  } else if (!perennial) {
    const dtm = trait(t, 'daysToMaturity');
    const season = c.seasonDays ?? (c.extremeMinC !== null && c.extremeMinC > 0 ? 365 : null);
    const warm = trait(t, 'sowSeason') === 'warm';
    if (season === null) out.push({ rule: 'E5', outcome: 'needs_input', code: 'climateUnknown' });
    else if (warm && dtm && season < dtm.min)
      out.push({
        rule: 'E5',
        outcome: 'exclude',
        code: 'seasonTooShort',
        params: { need: dtm.min, have: season },
      });
  }
  if (c.hotSummers === true && heat === 'low') {
    if (perennial) out.push({ rule: 'E5', outcome: 'exclude', code: 'heatSensitive' });
    else out.push({ rule: 'E5', outcome: 'tradeoff', code: 'growInCoolSeason' });
  } else if (c.hotSummers === true && heat === 'medium') {
    out.push({ rule: 'E5', outcome: 'tradeoff', code: 'shadeInHeat' });
  }
}

function e6(t: Taxon, ctx: EligibilityContext, out: Finding[]) {
  const need = trait(t, 'waterNeed');
  const effort = trait(t, 'effort');
  const { access, minutesPerWeek } = ctx.water;
  const noRain = ctx.zone.indoor || ctx.zone.covered === true;
  if (access === 'rain' && noRain) out.push({ rule: 'E6', outcome: 'needs_input', code: 'noWaterSource' });
  else if (need === 'high' && access === 'carry')
    out.push({ rule: 'E6', outcome: 'tradeoff', code: 'thirstyCarry' });
  else if (need === 'high' && access === 'rain')
    out.push({ rule: 'E6', outcome: 'tradeoff', code: 'waterInDrySpells' });
  if (minutesPerWeek !== null) {
    if (effort === 'high' && minutesPerWeek < 60)
      out.push({
        rule: 'E6',
        outcome: 'tradeoff',
        code: 'needsMoreTime',
        params: { minutes: minutesPerWeek },
      });
    else if (effort === 'medium' && minutesPerWeek < 20)
      out.push({
        rule: 'E6',
        outcome: 'tradeoff',
        code: 'needsMoreTime',
        params: { minutes: minutesPerWeek },
      });
  }
}

function e7(t: Taxon, ctx: EligibilityContext, out: Finding[]): Candidate['timing'] {
  const season = trait(t, 'sowSeason') ?? 'any';
  let months = sowMonths(season, ctx.lat);
  if (ctx.sowWindows && season !== 'any') {
    const local = season === 'warm' ? ctx.sowWindows.warm : ctx.sowWindows.cool;
    if (local.length > 0) months = local;
    else {
      // No month suits this crop here on average: allow it, but say so (choose tolerant varieties).
      out.push({ rule: 'E7', outcome: 'tradeoff', code: 'noIdealWindow', params: { season } });
      return { sowNow: false, nextMonth: null };
    }
  }
  if (months.includes(ctx.month)) return { sowNow: true, nextMonth: null };
  const next =
    Array.from({ length: 12 }, (_, i) => (ctx.month + i + 1) % 12).find((m) => months.includes(m)) ?? null;
  if (next !== null) out.push({ rule: 'E7', outcome: 'pass', code: 'plantLater', params: { month: next } });
  return { sowNow: false, nextMonth: next };
}

// ---------------------------------------------------------------- score

function scoreOf(
  t: Taxon,
  ctx: EligibilityContext,
  native: RegionStatusValue,
  light: { lo: number; hi: number } | null,
): { score: number; parts: Candidate['scoreParts'] } {
  const goals: Goal[] = ctx.goals.length > 0 ? ctx.goals : ['food', 'pollinators', 'beauty'];
  const parts: Candidate['scoreParts'] = {};
  const height = trait(t, 'heightCm');
  const life = trait(t, 'lifeform');
  const dtm = trait(t, 'daysToMaturity');
  const effort = trait(t, 'effort');
  for (const g of goals) {
    switch (g) {
      case 'food':
        parts.food = LEVEL[trait(t, 'foodValue') ?? 'none'];
        break;
      case 'pollinators':
        parts.pollinators = LEVEL[trait(t, 'pollinatorValue') ?? 'low'];
        break;
      case 'native':
        parts.native = native === 'NATIVE' ? 1 : 0;
        break;
      case 'cool-shade':
        parts['cool-shade'] =
          life === 'tree' || life === 'shrub' || life === 'climber' || (height?.max ?? 0) >= 150
            ? 1
            : (height?.max ?? 0) >= 80
              ? 0.5
              : 0;
        break;
      case 'beauty':
        parts.beauty = LEVEL[trait(t, 'ornamentalValue') ?? 'low'];
        break;
      case 'low-water':
        parts['low-water'] = { low: 1, medium: 0.4, high: 0 }[trait(t, 'waterNeed') ?? 'high'];
        break;
      case 'learn-kids':
        parts['learn-kids'] =
          effort === 'low' && dtm !== null && dtm.max <= 60 ? 1 : effort === 'low' ? 0.6 : 0.2;
        break;
    }
  }
  const minutes = ctx.water.minutesPerWeek;
  parts.effort =
    effort === 'low'
      ? 1
      : effort === 'medium'
        ? minutes === null || minutes >= 30
          ? 1
          : 0.5
        : minutes !== null && minutes >= 60
          ? 1
          : 0.2;
  const sun = trait(t, 'sunHours');
  parts.light = light && sun ? (light.lo >= sun.min ? 1 : 0.6) : 0.8;
  let sum = 0;
  let total = 0;
  for (const [k, v] of Object.entries(parts) as Array<[Goal | 'effort' | 'light', number]>) {
    const w = ctx.weights?.[k] ?? (k === 'effort' || k === 'light' ? 0.5 : 1);
    sum += w * v;
    total += w;
  }
  return { score: total > 0 ? Math.round((100 * sum) / total) : 0, parts };
}

// ---------------------------------------------------------------- pipeline

export function evaluate(t: Taxon, ctx: EligibilityContext): Candidate {
  const findings: Finding[] = [];
  const flags = new Set<CandidateFlag>();
  e1(t, ctx, findings, flags);
  e2(t, ctx, findings, flags);
  e3(t, ctx, findings);
  const light = e4(t, ctx, findings);
  e5(t, ctx, findings);
  e6(t, ctx, findings);
  const timing = e7(t, ctx, findings);
  if (t.traits.some((a) => a.review === 'needs_review')) flags.add('DRAFT_TRAITS');
  const status: CandidateStatus = findings.some((f) => f.outcome === 'exclude')
    ? 'EXCLUDED'
    : findings.some((f) => f.outcome === 'needs_input')
      ? 'NEEDS_INPUT'
      : 'ELIGIBLE';
  const native = nativeStatusOf(t, ctx.region);
  const scored = status === 'ELIGIBLE' ? scoreOf(t, ctx, native, light) : null;
  return {
    taxonId: t.id,
    status,
    findings,
    flags: [...flags].sort(),
    nativeStatus: native,
    score: scored?.score ?? null,
    scoreParts: scored?.parts ?? {},
    timing,
  };
}

/** Evaluates every taxon; eligible first by score, then the rest, ties broken by id (stable, §17.5). */
export function rankCandidates(taxa: readonly Taxon[], ctx: EligibilityContext): Candidate[] {
  const order: Record<CandidateStatus, number> = { ELIGIBLE: 0, NEEDS_INPUT: 1, EXCLUDED: 2 };
  return taxa
    .map((t) => evaluate(t, ctx))
    .sort(
      (a, b) =>
        order[a.status] - order[b.status] ||
        (b.score ?? -1) - (a.score ?? -1) ||
        (a.taxonId < b.taxonId ? -1 : a.taxonId > b.taxonId ? 1 : 0),
    );
}

/**
 * Greedy starter set: maximises score plus marginal coverage of the chosen goals and plant groups,
 * with at most `perFamily` plants from one family (§17.2 step 9).
 */
export function buildStarterSet(
  ranked: readonly Candidate[],
  taxa: readonly Taxon[],
  opts: { size?: number; perFamily?: number; goals?: Goal[] } = {},
): string[] {
  const size = opts.size ?? 6;
  const perFamily = opts.perFamily ?? 2;
  const byId = new Map(taxa.map((t) => [t.id, t]));
  const pool = ranked.filter((c) => c.status === 'ELIGIBLE' && byId.has(c.taxonId));
  const chosen: Candidate[] = [];
  const families = new Map<string, number>();
  const goalsCovered = new Set<string>();
  const groupsCovered = new Set<string>();
  while (chosen.length < size) {
    let best: { c: Candidate; gain: number } | null = null;
    for (const c of pool) {
      if (chosen.includes(c)) continue;
      const t = byId.get(c.taxonId);
      if (!t || (families.get(t.family) ?? 0) >= perFamily) continue;
      const newGoals = Object.entries(c.scoreParts).filter(
        ([k, v]) => k !== 'effort' && k !== 'light' && v >= 0.6 && !goalsCovered.has(k),
      ).length;
      const group = trait(t, 'useGroup') ?? 'other';
      const gain = (c.score ?? 0) / 100 + 0.15 * newGoals + (groupsCovered.has(group) ? 0 : 0.1);
      if (
        !best ||
        gain > best.gain + 1e-9 ||
        (Math.abs(gain - best.gain) <= 1e-9 && c.taxonId < best.c.taxonId)
      )
        best = { c, gain };
    }
    if (!best) break;
    const t = byId.get(best.c.taxonId);
    if (!t) break;
    chosen.push(best.c);
    families.set(t.family, (families.get(t.family) ?? 0) + 1);
    groupsCovered.add(trait(t, 'useGroup') ?? 'other');
    for (const [k, v] of Object.entries(best.c.scoreParts)) if (v >= 0.6) goalsCovered.add(k);
  }
  return chosen.map((c) => c.taxonId);
}

// ---------------------------------------------------------------- climate from manual answers

export type FrostAnswer = 'none' | 'light' | 'hard';

/**
 * Coarse climate facts from the manual questions (providers down or location skipped). Values are
 * deliberately conservative and labelled `manual` everywhere they are shown.
 */
export function manualClimate(frost: FrostAnswer | null, hotSummers: boolean | null): ClimateFacts {
  if (frost === null) return { extremeMinC: null, basis: null, seasonDays: null, hotSummers };
  const table: Record<FrostAnswer, [number, number]> = { none: [2, 365], light: [-6, 220], hard: [-20, 150] };
  const [extremeMinC, seasonDays] = table[frost];
  return { extremeMinC, basis: 'manual', seasonDays, hotSummers };
}
