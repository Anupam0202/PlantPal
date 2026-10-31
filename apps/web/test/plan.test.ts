// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { climateFactsOf, contextOf, inputsHash, reasonText, zoneFactsOf } from '../src/features/plan/engine';
import { planMessagesEn } from '../src/features/plan/messages';

const zone = {
  kind: 'balcony' as const,
  covered: false,
  areaM2: 2,
  sun: null,
  indoorLight: null,
  clearanceCm: null,
  maxContainerL: 20,
};

describe('plan engine glue', () => {
  it('keeps 0 hours as 0 and missing sun as unknown', () => {
    expect(zoneFactsOf(zone).sunMonthly).toBeNull();
    const dark = zoneFactsOf({
      ...zone,
      sun: {
        method: 'class',
        facingDeg: null,
        overhangDeg: null,
        across: null,
        horizon: null,
        quick: null,
        monthlyHours: new Array(12).fill(0),
        year: 2026,
        computedAt: 0,
      },
    });
    expect(dark.sunMonthly).toEqual(new Array(12).fill(0));
  });

  it('treats indoor zones as covered and containers, yards as ground', () => {
    expect(zoneFactsOf({ ...zone, kind: 'indoor', indoorLight: 'medium' })).toMatchObject({
      indoor: true,
      covered: true,
      containers: true,
    });
    expect(zoneFactsOf({ ...zone, kind: 'yard' }).containers).toBe(false);
  });

  it('prefers measured climate, falls back to manual answers, else unknown', () => {
    expect(climateFactsOf(null, null).extremeMinC).toBeNull();
    expect(climateFactsOf(null, { frost: 'hard', hotSummers: false, monsoon: null })).toMatchObject({
      basis: 'manual',
      extremeMinC: -20,
    });
  });

  it('hashes inputs stably and writes reasons in plain language', () => {
    const ctx = contextOf({
      lat: 18.5,
      region: { countryCode: 'IN', admin1: null, l3: null },
      profile: null,
      zone,
      climate: climateFactsOf(null, null),
      month: 3,
    });
    expect(inputsHash(ctx)).toBe(inputsHash({ ...ctx }));
    expect(inputsHash(ctx)).not.toBe(inputsHash({ ...ctx, goals: ['food'] }));
    const m = planMessagesEn;
    expect(
      reasonText(
        { rule: 'E4', outcome: 'exclude', code: 'tooLittleSun', params: { need: 6, have: 0 } },
        m,
        'en',
      ),
    ).toBe('Needs 6 h of direct sun; this spot gets about 0 h.');
    expect(
      reasonText(
        { rule: 'E1', outcome: 'exclude', code: 'invasiveListed', params: { region: 'IN' } },
        m,
        'en',
      ),
    ).toBe('Listed as invasive in India. Not recommended for planting there.');
  });
});
