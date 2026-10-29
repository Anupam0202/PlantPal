import { HealthTriage, type HealthQuestionnaire } from '@plantpal/schemas';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { HEALTH_CHANGES, HEALTH_ONSETS, HEALTH_SIGNS, HEALTH_SPREAD, SOIL_CHECKS } from '@plantpal/schemas';
import { adviceServices, followUpDates, rulesTriage, type HealthContext } from '../src/health';

const ctx: HealthContext = {
  sunHours: 4,
  container: true,
  maxTempC: 30,
  minTempC: 18,
  wateringsLast14: 5,
  covered: true,
};
const q = (over: Partial<HealthQuestionnaire>): HealthQuestionnaire => ({
  onset: 'gradual',
  signs: [],
  where: null,
  spread: 'one-plant',
  changes: [],
  soil: null,
  notes: '',
  ...over,
});
const top = (t: ReturnType<typeof rulesTriage>) => t.candidates[0];

describe('rules triage (F4 fallback)', () => {
  it('wet soil + drooping + yellow lower leaves → too much water, LIKELY', () => {
    const t = rulesTriage(q({ signs: ['drooping-wet-soil', 'yellow-lower'], soil: 'wet' }), ctx);
    expect(top(t)).toMatchObject({
      category: 'abiotic',
      name: 'Too much water (roots short of air)',
      likelihood: 'LIKELY',
    });
    expect(t.immediateSafeSteps.join(' ')).toMatch(/Stop watering/);
  });

  it('dry soil + wilting → too little water, LIKELY; wet soil counts against it', () => {
    expect(top(rulesTriage(q({ signs: ['wilting'], soil: 'dry' }), ctx))).toMatchObject({
      name: 'Too little water',
      likelihood: 'LIKELY',
    });
    const wet = rulesTriage(q({ signs: ['wilting'], soil: 'wet', changes: ['watered-less'] }), ctx);
    expect(wet.candidates.find((c) => c.name === 'Too little water')?.evidenceAgainst).toContain(
      'Soil is wet at 2 cm',
    );
  });

  it('moved into sun + bleached patches → sun scorch; repotted + wilting → transplant shock', () => {
    expect(
      rulesTriage(q({ signs: ['pale-bleached'], changes: ['moved'] }), ctx).candidates.map((c) => c.name),
    ).toContain('Sun scorch');
    expect(
      top(rulesTriage(q({ signs: ['wilting'], changes: ['repotted'], onset: 'sudden' }), ctx)),
    ).toMatchObject({
      name: 'Transplant shock',
      likelihood: 'LIKELY',
    });
  });

  it('pests and diseases are candidates only, with beneficial look-alikes noted', () => {
    const t = rulesTriage(q({ signs: ['sticky-or-webbing', 'white-powder'] }), ctx);
    const pest = t.candidates.find((c) => c.category === 'pest');
    expect(pest?.checksToConfirm.join(' ')).toMatch(/Ladybird larvae/);
    expect(t.candidates.find((c) => c.category === 'disease')?.likelihood).toBe('POSSIBLE');
  });

  it('spreading disease or a mushy stem escalates; nothing selected abstains', () => {
    expect(rulesTriage(q({ signs: ['brown-spots'], spread: 'spreading-fast' }), ctx).escalate.needed).toBe(
      true,
    );
    expect(rulesTriage(q({ signs: ['mushy-stem'], soil: 'wet' }), ctx).escalate.needed).toBe(true);
    const none = rulesTriage(q({}), ctx);
    expect(none.candidates).toEqual([]);
    expect(none.abstainReason).toMatch(/No signs/);
  });

  it('always matches the AI schema, never uses percentages, never more than 6 candidates (property)', () => {
    fc.assert(
      fc.property(
        fc.record({
          onset: fc.constantFrom(...HEALTH_ONSETS),
          signs: fc.subarray([...HEALTH_SIGNS]),
          where: fc.constant(null),
          spread: fc.constantFrom(...HEALTH_SPREAD),
          changes: fc.subarray([...HEALTH_CHANGES]),
          soil: fc.constantFrom(null, ...SOIL_CHECKS),
          notes: fc.constant(''),
        }),
        fc.option(fc.integer({ min: -5, max: 45 }), { nil: null }),
        (questionnaire, temp) => {
          const t = rulesTriage(questionnaire, {
            ...ctx,
            maxTempC: temp,
            minTempC: temp === null ? null : temp - 10,
          });
          expect(HealthTriage.safeParse(t).success).toBe(true);
          expect(t.candidates.length).toBeLessThanOrEqual(6);
          expect(JSON.stringify(t)).not.toMatch(/\d\s?%/);
          // Likelihood is sorted: LIKELY before POSSIBLE before UNLIKELY.
          const ranks = t.candidates.map((c) => ['LIKELY', 'POSSIBLE', 'UNLIKELY'].indexOf(c.likelihood));
          expect([...ranks].sort((a, b) => a - b)).toEqual(ranks);
        },
      ),
    );
  });
});

describe('follow-ups and advice', () => {
  it('follow-up dates are garden-local days after opening, deduplicated and sorted', () => {
    expect(followUpDates('2026-12-30', [7, 3, 3])).toEqual(['2027-01-02', '2027-01-06']);
  });
  it('advice services are region-keyed with a general fallback', () => {
    expect(adviceServices('IN')[0]?.name).toMatch(/Krishi Vigyan Kendra/);
    expect(adviceServices(null).length).toBeGreaterThanOrEqual(1);
  });
});
