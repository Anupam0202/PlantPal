import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  GOALS,
  buildStarterSet,
  directSunOnDate,
  evaluate,
  manualClimate,
  rankCandidates,
  spotFromAnswers,
  sunProfile,
  type EligibilityContext,
  type Goal,
} from '@plantpal/domain';
import { SEED_PACK, taxonById } from '../src';

const taxa = SEED_PACK.taxa;
const T = (id: string) => {
  const t = taxonById(id);
  if (!t) throw new Error(`missing ${id}`);
  return t;
};

function ctx(
  over: Omit<Partial<EligibilityContext>, 'zone'> & { zone?: Partial<EligibilityContext['zone']> },
): EligibilityContext {
  return {
    lat: 18.52,
    region: { countryCode: 'IN', l3: null },
    household: { cats: false, dogs: false, children: false },
    showToxicWithWarning: false,
    climate: manualClimate('none', true),
    water: { access: 'tap', minutesPerWeek: 60 },
    goals: ['food'],
    containerMarginC: 5,
    month: 9,
    ...over,
    zone: {
      indoor: false,
      covered: false,
      containers: true,
      rooftop: false,
      sunMonthly: new Array(12).fill(8),
      indoorLight: null,
      areaM2: 4,
      clearanceCm: null,
      maxContainerL: null,
      ...over.zone,
    },
  };
}

const statusOf = (id: string, c: EligibilityContext) => evaluate(T(id), c).status;

describe('E1 legal / invasive', () => {
  it('excludes Lantana in India with its source, but not in Great Britain', () => {
    const india = evaluate(T('lantana-camara'), ctx({}));
    expect(india.status).toBe('EXCLUDED');
    expect(india.findings.find((f) => f.rule === 'E1')).toMatchObject({
      code: 'invasiveListed',
      sourceId: 'griis-in',
    });
    const gb = evaluate(T('lantana-camara'), ctx({ lat: 51.5, region: { countryCode: 'GB', l3: null } }));
    expect(gb.findings.some((f) => f.rule === 'E1')).toBe(false);
  });

  it('monotonic safety: no preference makes an invasive plant eligible', () => {
    fc.assert(
      fc.property(
        fc.subarray([...GOALS] as Goal[], { maxLength: 3 }),
        fc.boolean(),
        fc.integer({ min: 0, max: 600 }),
        fc.dictionary(fc.constantFrom(...GOALS), fc.double({ min: 0, max: 10, noNaN: true })),
        (goals, warn, minutes, weights) => {
          const c = ctx({
            goals,
            showToxicWithWarning: warn,
            water: { access: 'tap', minutesPerWeek: minutes },
            weights,
          });
          const r = evaluate(T('lantana-camara'), c);
          expect(r.status).toBe('EXCLUDED');
          expect(r.score).toBeNull();
        },
      ),
    );
  });
});

describe('E2 household safety', () => {
  it('excludes a lily for a household with a cat, citing the source', () => {
    const r = evaluate(
      T('lilium-longiflorum'),
      ctx({ household: { cats: true, dogs: false, children: false } }),
    );
    expect(r.status).toBe('EXCLUDED');
    expect(r.findings.find((f) => f.rule === 'E2')).toMatchObject({
      code: 'toxicTo',
      sourceId: 'aspca-apcc',
    });
  });

  it('lets the user opt in to seeing it with a warning', () => {
    const r = evaluate(
      T('lilium-longiflorum'),
      ctx({
        household: { cats: true, dogs: false, children: false },
        showToxicWithWarning: true,
        lat: 51.5,
        region: { countryCode: 'GB', l3: null },
      }),
    );
    expect(r.flags).toContain('TOXIC_WARNING');
    expect(r.status).not.toBe('EXCLUDED');
  });

  it('flags unknown toxicity for children instead of calling it safe (S10)', () => {
    const r = evaluate(T('zinnia-elegans'), ctx({ household: { cats: false, dogs: false, children: true } }));
    expect(r.flags).toContain('NEEDS_REVIEW');
    expect(r.status).toBe('ELIGIBLE');
  });
});

describe('E3 physical fit', () => {
  it('excludes plants taller than the clearance and pots that do not fit', () => {
    expect(statusOf('citrus-limon', ctx({ zone: { clearanceCm: 100 } }))).toBe('EXCLUDED');
    expect(statusOf('cucurbita-pepo-zucchini', ctx({ zone: { maxContainerL: 20 } }))).toBe('EXCLUDED');
    expect(statusOf('ocimum-basilicum', ctx({ zone: { maxContainerL: 20, clearanceCm: 100 } }))).toBe(
      'ELIGIBLE',
    );
  });

  it('warns about heavy pots on a roof without certifying anything (S13)', () => {
    const r = evaluate(T('citrus-limon'), ctx({ zone: { rooftop: true } }));
    expect(r.findings.find((f) => f.code === 'heavyOnRoof')?.outcome).toBe('tradeoff');
  });
});

describe('E4 light', () => {
  it('light 0 is preserved: full-sun plants are excluded, shade plants are not (L21)', () => {
    const dark = ctx({ zone: { sunMonthly: new Array(12).fill(0) } });
    const r = evaluate(T('solanum-lycopersicum-cherry'), dark);
    expect(r.status).toBe('EXCLUDED');
    expect(r.findings.find((f) => f.rule === 'E4')).toMatchObject({
      code: 'tooLittleSun',
      params: { need: 6, have: 0 },
    });
    // Shade-tolerant plants are not excluded by light (other rules may still apply).
    const pothos = evaluate(T('epipremnum-aureum'), dark);
    expect(pothos.findings.some((f) => f.rule === 'E4' && f.outcome === 'exclude')).toBe(false);
  });

  it('unknown light never passes as a fact', () => {
    const r = evaluate(T('ocimum-basilicum'), ctx({ zone: { sunMonthly: null } }));
    expect(r.status).toBe('NEEDS_INPUT');
    expect(r.score).toBeNull();
  });

  it('indoors uses the window class', () => {
    const lowWindow = ctx({ zone: { indoor: true, sunMonthly: null, indoorLight: 'low' } });
    expect(statusOf('dracaena-trifasciata', lowWindow)).toBe('ELIGIBLE');
    expect(statusOf('monstera-deliciosa', lowWindow)).toBe('EXCLUDED');
    expect(statusOf('solanum-lycopersicum-cherry', lowWindow)).toBe('EXCLUDED');
  });
});

describe('E5 temperature', () => {
  it('applies the container margin to perennials', () => {
    const c = (margin: number) =>
      ctx({
        climate: { extremeMinC: -8, basis: 'measured', seasonDays: 200, hotSummers: false },
        containerMarginC: margin,
        lat: 45,
      });
    expect(statusOf('salvia-rosmarinus', c(0))).toBe('ELIGIBLE');
    expect(statusOf('salvia-rosmarinus', c(5))).toBe('EXCLUDED');
  });

  it('unknown climate asks for input rather than guessing', () => {
    const r = evaluate(T('salvia-rosmarinus'), ctx({ climate: manualClimate(null, null) }));
    expect(r.status).toBe('NEEDS_INPUT');
  });

  it('a short season excludes slow warm-season annuals', () => {
    const short = ctx({
      lat: 60,
      climate: { extremeMinC: -25, basis: 'measured', seasonDays: 50, hotSummers: false },
    });
    expect(statusOf('solanum-melongena', short)).toBe('EXCLUDED');
    expect(statusOf('raphanus-sativus', short)).toBe('ELIGIBLE');
  });
});

describe('E6 water and E7 timing', () => {
  it('a covered zone with only rain water needs a water plan (S5)', () => {
    const r = evaluate(
      T('ocimum-basilicum'),
      ctx({ zone: { covered: true }, water: { access: 'rain', minutesPerWeek: 60 } }),
    );
    expect(r.findings.find((f) => f.rule === 'E6')?.code).toBe('noWaterSource');
    expect(r.status).toBe('NEEDS_INPUT');
  });

  it('timing is advice, not exclusion', () => {
    // Pune in May: cool-season crops wait for the next window.
    const r = evaluate(T('spinacia-oleracea'), ctx({ month: 4 }));
    expect(r.status).toBe('ELIGIBLE');
    expect(r.timing).toEqual({ sowNow: false, nextMonth: 8 });
  });
});

describe('regional fixtures (§17.5)', () => {
  const profile = (
    answers: Parameters<typeof spotFromAnswers>[0],
    place: { lat: number; lon: number; timeZone: string },
  ) => sunProfile(spotFromAnswers(answers, place), 2026, 6).monthlyHours;

  it('Pune west balcony (~4 h): no tomatoes, plenty of herbs and greens, no Lantana', () => {
    const sun = profile(
      { facingDeg: 270, covered: false, across: 'low' },
      { lat: 18.52, lon: 73.86, timeZone: 'Asia/Kolkata' },
    );
    const mean = sun.reduce((a, b) => a + b, 0) / 12;
    expect(mean).toBeGreaterThan(3);
    expect(mean).toBeLessThan(6.5);
    const c = ctx({ zone: { sunMonthly: sun }, goals: ['food', 'pollinators'] });
    const ranked = rankCandidates(taxa, c);
    const eligible = ranked.filter((r) => r.status === 'ELIGIBLE').map((r) => r.taxonId);
    expect(eligible).toContain('mentha-spicata');
    expect(eligible).toContain('coriandrum-sativum');
    expect(eligible).not.toContain('solanum-lycopersicum-cherry');
    expect(eligible).not.toContain('lantana-camara');
    expect(eligible.length).toBeGreaterThanOrEqual(8);
  });

  it('London shady courtyard (~2 h): shade plants, not tomatoes', () => {
    const london = { lat: 51.5, lon: -0.12, timeZone: 'Europe/London' };
    const sun = profile({ facingDeg: 0, covered: false, across: 'low' }, london);
    const c = ctx({
      lat: 51.5,
      region: { countryCode: 'GB', l3: null },
      zone: { sunMonthly: sun, containers: false },
      climate: { extremeMinC: -6, basis: 'measured', seasonDays: 220, hotSummers: false },
      goals: ['beauty', 'native'],
      month: 3,
    });
    const ranked = rankCandidates(taxa, c);
    const status = (id: string) => ranked.find((r) => r.taxonId === id)?.status;
    expect(status('solanum-lycopersicum-cherry')).toBe('EXCLUDED');
    expect(status('primula-vulgaris')).toBe('ELIGIBLE');
    expect(status('heuchera-hybrids')).toBe('ELIGIBLE');
    expect(ranked.find((r) => r.taxonId === 'primula-vulgaris')?.nativeStatus).toBe('NATIVE');
  });

  it('Sydney north-facing (~7 h+): tomatoes fit, Lantana is excluded, local natives rank well', () => {
    const sydney = { lat: -33.87, lon: 151.21, timeZone: 'Australia/Sydney' };
    const sun = profile({ facingDeg: 0, covered: false, across: 'none' }, sydney);
    expect(Math.min(...sun)).toBeGreaterThanOrEqual(6);
    const c = ctx({
      lat: -33.87,
      region: { countryCode: 'AU', l3: 'NSW' },
      zone: { sunMonthly: sun },
      climate: { extremeMinC: 3, basis: 'measured', seasonDays: 365, hotSummers: false },
      goals: ['native', 'pollinators'],
      month: 9,
    });
    const ranked = rankCandidates(taxa, c);
    const status = (id: string) => ranked.find((r) => r.taxonId === id)?.status;
    expect(status('solanum-lycopersicum-cherry')).toBe('ELIGIBLE');
    expect(status('lantana-camara')).toBe('EXCLUDED');
    const top = ranked.slice(0, 5).map((r) => r.taxonId);
    expect(top).toContain('brachyscome-multifida');
  });

  it('Minneapolis rooftop with hard winters: tender perennials out, summer annuals in', () => {
    const mpls = { lat: 44.98, lon: -93.27, timeZone: 'America/Chicago' };
    const sun = profile({ facingDeg: null, covered: false, across: 'none' }, mpls);
    const c = ctx({
      lat: 44.98,
      region: { countryCode: 'US', l3: 'MIN' },
      zone: { sunMonthly: sun, rooftop: true },
      climate: { extremeMinC: -31, basis: 'measured', seasonDays: 155, hotSummers: false },
      goals: ['native', 'food'],
      month: 4,
    });
    const ranked = rankCandidates(taxa, c);
    const status = (id: string) => ranked.find((r) => r.taxonId === id)?.status;
    expect(status('salvia-rosmarinus')).toBe('EXCLUDED');
    expect(status('citrus-limon')).toBe('EXCLUDED');
    expect(status('solanum-lycopersicum-cherry')).toBe('ELIGIBLE');
    expect(status('ocimum-basilicum')).toBe('ELIGIBLE');
    // Native perennials in pots on a roof need the container margin: a draft −35 °C vs −31 − 5 is borderline-out.
    expect(ranked.find((r) => r.taxonId === 'rudbeckia-hirta')?.nativeStatus).toBe('NATIVE');
  });
});

describe('ranking and set builder', () => {
  it('is stable: same inputs, same order, whatever the catalogue order', () => {
    fc.assert(
      fc.property(
        fc.shuffledSubarray(taxa, { minLength: taxa.length, maxLength: taxa.length }),
        (shuffled) => {
          const c = ctx({ goals: ['pollinators', 'food'] });
          expect(rankCandidates(shuffled, c).map((r) => r.taxonId)).toEqual(
            rankCandidates(taxa, c).map((r) => r.taxonId),
          );
        },
      ),
      { numRuns: 25 },
    );
  });

  it('never picks more than two plants from one family, and only eligible ones', () => {
    fc.assert(
      fc.property(
        fc.subarray([...GOALS] as Goal[], { minLength: 1, maxLength: 3 }),
        fc.integer({ min: 1, max: 12 }),
        fc.array(fc.integer({ min: 0, max: 12 }), { minLength: 12, maxLength: 12 }),
        (goals, size, sun) => {
          const ranked = rankCandidates(taxa, ctx({ goals, zone: { sunMonthly: sun } }));
          const set = buildStarterSet(ranked, taxa, { size });
          expect(set.length).toBeLessThanOrEqual(size);
          expect(new Set(set).size).toBe(set.length);
          const families = new Map<string, number>();
          for (const id of set) {
            expect(ranked.find((r) => r.taxonId === id)?.status).toBe('ELIGIBLE');
            const f = T(id).family;
            families.set(f, (families.get(f) ?? 0) + 1);
          }
          for (const n of families.values()) expect(n).toBeLessThanOrEqual(2);
        },
      ),
      { numRuns: 60 },
    );
  });

  it('day-length sanity for the fixtures uses real sun geometry', () => {
    const d = directSunOnDate(
      spotFromAnswers(
        { facingDeg: null, covered: false, across: 'none' },
        { lat: 44.98, lon: -93.27, timeZone: 'America/Chicago' },
      ),
      '2026-06-21',
    );
    expect(d.directHours).toBeGreaterThan(15);
  });
});
