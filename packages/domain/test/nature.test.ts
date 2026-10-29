import type { Harvest, NatureVisit, PantryItem, VisitRecord } from '@plantpal/schemas';
import { describe, expect, it } from 'vitest';
import {
  bloomWheel,
  canMovePantry,
  compatibility,
  darwinCoreCsv,
  deterministicId,
  fitWeatherOk,
  harvestTotals,
  impactLedger,
  isComplete,
  pantryTotals,
  rotateMonth,
  taxaObserved,
  trendFor,
  dueSoon,
  visitTotals,
  type BloomInput,
} from '../src';

const T0 = Date.UTC(2026, 5, 10, 9, 0);
const id = (s: string) => deterministicId(T0, s);

const rec = (
  group: string,
  count: number | null,
  state: VisitRecord['state'] = 'YES',
  over: Partial<VisitRecord> = {},
): VisitRecord => ({
  group,
  taxonName: null,
  count,
  state,
  identityConfidence: 'confident',
  behaviour: null,
  ...over,
});

function visit(over: Partial<NatureVisit> = {}): NatureVisit {
  return {
    id: id(`v${Math.random()}`),
    workspaceId: id('ws'),
    gardenId: id('g'),
    opId: id(`op${Math.random()}`),
    createdAt: T0,
    deletedAt: null,
    protocol: 'fit-count',
    startedAt: T0,
    occurredOn: '2026-06-10',
    plannedS: 600,
    durationS: 600,
    zoneId: null,
    specimenId: null,
    targetTaxonId: 'lavandula-angustifolia',
    targetName: 'Lavender',
    patchFlowerCount: 40,
    weather: { temperatureC: 21, sky: 'sunny', wind: 'light', evidence: 'MEASURED' },
    observerCount: 1,
    records: [rec('bumblebees', 3), rec('honeybees', 0, 'NO'), rec('hoverflies', 1)],
    notes: '',
    mediaIds: [],
    ...over,
  };
}

describe('nature visits: four states and totals (S2)', () => {
  it('counts confident YES records; NO is a zero; NOT_CHECKED is left out; UNCERTAIN is kept aside', () => {
    const t = visitTotals(
      visit({
        records: [
          rec('bumblebees', 3),
          rec('honeybees', 0, 'NO'),
          rec('wasps', null, 'NOT_CHECKED'),
          rec('hoverflies', 2, 'UNCERTAIN'),
          rec('beetles', 1, 'YES', { identityConfidence: 'unsure' }),
        ],
      }),
    );
    expect(t.byGroup).toEqual({ bumblebees: 3, honeybees: 0, hoverflies: 0, beetles: 0 });
    expect('wasps' in t.byGroup).toBe(false);
    expect(t.total).toBe(3);
    expect(t.uncertain).toBe(3);
    expect(t.per100Flowers).toBe(7.5);
  });

  it('a zero count is data', () => {
    const t = visitTotals(visit({ records: [rec('bumblebees', 0, 'NO'), rec('honeybees', 0, 'NO')] }));
    expect(t.total).toBe(0);
    expect(t.byGroup).toEqual({ bumblebees: 0, honeybees: 0 });
  });

  it('follows the PoMS weather guidance: 13 °C in sun, 15 °C when cloudy, unknown when not recorded', () => {
    expect(fitWeatherOk({ temperatureC: 13, sky: 'sunny', wind: 'light', evidence: 'MEASURED' })).toBe(true);
    expect(fitWeatherOk({ temperatureC: 14, sky: 'overcast', wind: 'light', evidence: 'MEASURED' })).toBe(
      false,
    );
    expect(fitWeatherOk({ temperatureC: 15, sky: 'partly-cloudy', wind: 'calm', evidence: 'MEASURED' })).toBe(
      true,
    );
    expect(fitWeatherOk({ temperatureC: 25, sky: 'sunny', wind: 'strong', evidence: 'MEASURED' })).toBe(
      false,
    );
    expect(fitWeatherOk({ temperatureC: null, sky: 'sunny', wind: null, evidence: 'MEASURED' })).toBeNull();
    expect(fitWeatherOk(null)).toBeNull();
  });
});

describe('trend validity gate (S8)', () => {
  const day = 86_400_000;
  const series = [0, 7, 14].map((d) =>
    visit({ startedAt: T0 + d * day, occurredOn: `2026-06-${String(10 + d).padStart(2, '0')}` }),
  );

  it('three compatible complete counts make a trend', () => {
    const t = trendFor(series);
    expect(t.valid).toBe(true);
    if (t.valid) expect(t.points.map((p) => p.total)).toEqual([4, 4, 4]);
  });

  it('explains why visits cannot be compared', () => {
    const ref = series[2]!;
    expect(compatibility(ref, visit({ protocol: 'bird-count', plannedS: 300, durationS: 300 }))).toContain(
      'protocol',
    );
    expect(compatibility(ref, visit({ targetTaxonId: null, targetName: 'Marigold' }))).toContain('target');
    expect(compatibility(ref, visit({ occurredOn: '2026-09-01' }))).toContain('season');
    expect(
      compatibility(
        ref,
        visit({ weather: { temperatureC: 12, sky: 'overcast', wind: null, evidence: 'MEASURED' } }),
      ),
    ).toContain('weather-band');
    expect(compatibility(ref, visit({ weather: null }))).toContain('weather-missing');
    expect(compatibility(ref, visit({ durationS: 420 }))).toContain('incomplete');
    expect(compatibility(ref, visit({ patchFlowerCount: null }))).toContain('flowers-missing');
    // The season window wraps around the new year.
    expect(
      compatibility(visit({ occurredOn: '2026-12-28' }), visit({ occurredOn: '2027-01-05' })),
    ).not.toContain('season');
  });

  it('two compatible visits and one hot-day visit is not a trend', () => {
    const hot = visit({
      startedAt: T0 + 20 * day,
      occurredOn: '2026-06-30',
      weather: { temperatureC: 33, sky: 'sunny', wind: 'light', evidence: 'MEASURED' },
    });
    const t = trendFor([series[0]!, series[1]!, hot]);
    expect(t.valid).toBe(false);
    if (!t.valid) expect(t.reasons['weather-band']).toBe(2);
  });

  it('a count stopped early is saved but never anchors a trend', () => {
    const short = visit({ startedAt: T0 + 30 * day, occurredOn: '2026-06-20', durationS: 300 });
    expect(isComplete(short)).toBe(false);
    expect(trendFor([...series, short]).valid).toBe(false);
  });

  it('taxa observed counts names, not individuals', () => {
    const v = visit({
      protocol: 'bird-count',
      records: [
        rec('bird', 5, 'YES', { taxonName: 'House sparrow' }),
        rec('bird', 1, 'YES', { taxonName: 'house  Sparrow' }),
        rec('bird', 2, 'UNCERTAIN', { taxonName: 'Common myna' }),
      ],
    });
    expect(taxaObserved([v])).toEqual(['house sparrow']);
  });
});

describe('Darwin Core export', () => {
  it('exports presences and absences, skips unchecked, coarsens location and stays formula-safe', () => {
    const csv = darwinCoreCsv(
      [
        visit({
          notes: '',
          targetName: '=HYPERLINK("x")',
          records: [rec('bumblebees', 3), rec('honeybees', 0, 'NO'), rec('wasps', null, 'NOT_CHECKED')],
        }),
      ],
      { lat: 51.50735, lon: -0.12776 },
      (g) => g,
    );
    const lines = csv.trim().split('\r\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain('occurrenceStatus');
    expect(lines[1]).toContain('present');
    expect(lines[2]).toContain('absent');
    expect(csv).toContain('51.51');
    expect(csv).toContain(',-0.13,');
    expect(csv).not.toContain("'-0.13");
    expect(csv).not.toContain('wasps');
    expect(csv).toContain('0.25,square metre');
  });
});

describe('Bloom Bridge', () => {
  const plant = (over: Partial<BloomInput>): BloomInput => ({
    id: 'p',
    name: 'Plant',
    bloomMonths: [6, 7, 8],
    pollinatorValue: 'high',
    observed: {},
    ...over,
  });

  it('rotates reference timing by six months in the southern hemisphere', () => {
    expect([1, 6, 7, 12].map((m) => rotateMonth(m, 'south'))).toEqual([7, 12, 1, 6]);
    expect(rotateMonth(6, 'north')).toBe(6);
    const w = bloomWheel([plant({})], 'south');
    expect(w.plants[0]!.months[12]).toBe('bloom');
    expect(w.plants[0]!.months[1]).toBe('bloom');
    expect(w.plants[0]!.months[6]).toBe('no');
  });

  it('a garden with a known two-month gap shows exactly those gaps', () => {
    const w = bloomWheel(
      [
        plant({ id: 'a', name: 'Spring', bloomMonths: [1, 2, 3, 4, 5, 6] }),
        plant({ id: 'b', name: 'Summer', bloomMonths: [7, 8, 9, 10] }),
      ],
      'north',
    );
    expect(w.gaps).toEqual([11, 12]);
    expect(w.unknown).toEqual([]);
    expect(w.months[7].foragers).toEqual(['Summer']);
  });

  it('missing data makes months unknown, never gaps', () => {
    const w = bloomWheel(
      [plant({ id: 'a', bloomMonths: [6, 7] }), plant({ id: 'b', name: 'Mystery', bloomMonths: null })],
      'north',
    );
    expect(w.gaps).toEqual([]);
    expect(w.unknown).toEqual([1, 2, 3, 4, 5, 8, 9, 10, 11, 12]);
    // Unknown pollinator value while in bloom is also unknown.
    const v = bloomWheel([plant({ pollinatorValue: null })], 'north');
    expect(v.months[6].state).toBe('UNKNOWN');
    expect(v.months[1].state).toBe('GAP');
  });

  it('low-value flowers do not count as forage, and the person’s own checks override the catalogue', () => {
    const low = bloomWheel([plant({ pollinatorValue: 'low' })], 'north');
    expect(low.months[7].state).toBe('GAP');
    const seen = bloomWheel([plant({ observed: { 7: 'NO', 11: 'YES' } })], 'north');
    expect(seen.plants[0]!.months[7]).toBe('no');
    expect(seen.plants[0]!.source[7]).toBe('observed');
    expect(seen.months[11].state).toBe('FORAGE');
  });
});

const harvest = (over: Partial<Harvest>): Harvest => ({
  id: id(`h${Math.random()}`),
  workspaceId: id('ws'),
  gardenId: id('g'),
  opId: id(`hop${Math.random()}`),
  createdAt: T0,
  deletedAt: null,
  specimenId: null,
  plantName: 'Tomato',
  harvestedOn: '2026-07-01',
  dateUncertain: false,
  massG: null,
  count: null,
  countLabel: null,
  original: null,
  quality: null,
  destination: null,
  notes: '',
  source: null,
  ...over,
});

const pantry = (over: Partial<PantryItem>): PantryItem => ({
  id: id(`p${Math.random()}`),
  workspaceId: id('ws'),
  createdAt: T0,
  updatedAt: T0,
  version: 1,
  deletedAt: null,
  gardenId: id('g'),
  harvestId: null,
  specimenId: null,
  name: 'Tomatoes',
  state: 'fresh',
  massG: 500,
  count: null,
  countLabel: null,
  bestBefore: null,
  notes: '',
  history: [],
  ...over,
});

describe('harvest and pantry (S1, L15)', () => {
  it('keeps mass and counts apart and never turns a missing amount into zero grams', () => {
    const t = harvestTotals([
      harvest({ massG: 500 }),
      harvest({ massG: 1250 }),
      harvest({ count: 3, countLabel: 'Bunch' }),
      harvest({ count: 2, countLabel: 'bunch' }),
      harvest({ count: 12, countLabel: 'pieces' }),
      harvest({}),
      harvest({ massG: 9999, deletedAt: T0 }),
    ]);
    expect(t.massG).toBe(1750);
    expect(t.counts).toEqual({ bunch: 5, pieces: 12 });
    expect(t.withoutAmount).toBe(1);
    expect(t.entries).toBe(6);
  });

  it('pantry states: totals per state, final states stay final, use-soon from the person’s dates only', () => {
    const items = [
      pantry({ state: 'fresh', bestBefore: '2026-07-02' }),
      pantry({ state: 'stored', bestBefore: '2026-07-10' }),
      pantry({ state: 'given', massG: 200, bestBefore: '2026-07-01' }),
      pantry({ state: 'fresh', bestBefore: null }),
    ];
    expect(pantryTotals(items).fresh.massG).toBe(1000);
    expect(pantryTotals(items).given.massG).toBe(200);
    expect(canMovePantry('fresh', 'preserved')).toBe(true);
    expect(canMovePantry('composted', 'fresh')).toBe(false);
    expect(dueSoon(items, '2026-07-01').map((i) => i.bestBefore)).toEqual(['2026-07-02']);
  });
});

describe('Impact Ledger v1', () => {
  const ledger = impactLedger({
    period: { from: '2026-01-01', to: '2026-12-31' },
    harvests: [harvest({ massG: 1500 }), harvest({ count: 4, countLabel: 'bunch', destination: 'shared' })],
    careEvents: [],
    pantry: [pantry({ state: 'composted', massG: 300, updatedAt: Date.UTC(2026, 6, 1) })],
    visits: [visit({})],
    specimens: [],
    containers: [],
    taxonOf: () => null,
    nativeStatus: () => 'UNKNOWN',
    forageMonths: null,
  });
  const row = (m: string) => ledger.find((r) => r.metric === m);

  it('every row says how it was obtained', () => {
    for (const r of ledger) expect(['MEASURED', 'ESTIMATED', 'DERIVED']).toContain(r.method);
    expect(row('food-mass')).toMatchObject({ value: 1.5, unit: 'kg', method: 'MEASURED' });
    expect(row('food-count')).toMatchObject({ value: 4, label: 'bunch' });
    expect(row('composted')?.value).toBe(0.3);
    expect(row('nature-minutes')?.value).toBe(10);
  });

  it('unknown stays unknown and carbon has no number (S12, L16)', () => {
    expect(row('peat-free-share')?.value).toBeNull();
    expect(row('canopy-area')?.value).toBeNull();
    expect(row('bloom-months')?.value).toBeNull();
    expect(row('carbon')?.value).toBeNull();
    expect(ledger.filter((r) => /co₂|co2/i.test(r.unit)).every((r) => r.value === null)).toBe(true);
  });
});
