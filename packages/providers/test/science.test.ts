import { describe, expect, it } from 'vitest';
import { climateDeltas, hardiness, monthlyNormals } from '@plantpal/domain';
import {
  archiveUrl,
  CLIMATE_MODELS,
  climateUrl,
  fixtures,
  nearbyUrl,
  parseArchive,
  parseClimate,
  parseNearby,
} from '../src';

describe('Open-Meteo historical contract', () => {
  it('requests 1991–2020 daily extremes and precipitation', () => {
    const u = new URL(archiveUrl(51.5, -0.1));
    expect(u.searchParams.get('start_date')).toBe('1991-01-01');
    expect(u.searchParams.get('end_date')).toBe('2020-12-31');
    expect(u.searchParams.get('daily')).toBe('temperature_2m_max,temperature_2m_min,precipitation_sum');
  });

  it('parses into a series that feeds normals and hardiness', () => {
    const s = parseArchive(fixtures.dailyFixture({ from: 1991, to: 2020 }));
    expect(s.dates).toHaveLength(10958);
    const n = monthlyNormals(s, 1991, 2020);
    expect(n.coverage).toBe(1);
    expect(hardiness(s, 1991, 2020)?.zone).toBeTruthy();
  });

  it('rejects unexpected units', () => {
    expect(() => parseArchive(fixtures.dailyFixture({ from: 2000, to: 2000, units: '°F' }))).toThrow(/°F/);
  });
});

describe('Open-Meteo climate contract', () => {
  it('never requests years outside 1950–2050 and sends no scenario', () => {
    expect(() => climateUrl(51.5, -0.1, 2071, 2090)).toThrow(RangeError);
    const u = new URL(climateUrl(51.5, -0.1));
    expect(u.searchParams.get('models')?.split(',')).toEqual([...CLIMATE_MODELS]);
    expect([...u.searchParams.keys()].some((k) => /scenario|ssp/i.test(k))).toBe(false);
  });

  it('splits models and computes same-model deltas', () => {
    const models = ['CMCC_CM2_VHR4', 'MRI_AGCM3_2_S'] as const;
    const json = fixtures.dailyFixture({ from: 1991, to: 2050, models, warmingPerDecade: 0.3 });
    const series = parseClimate(json, models);
    expect(series.map((s) => s.model)).toEqual([...models]);
    const d = climateDeltas(series);
    // 0.3 °C per decade from 1991 to the 2031–2050 window, the same for both models (offsets cancel).
    expect(d.dTmeanC?.min).toBeCloseTo(d.dTmeanC?.max ?? 0, 1);
    expect(d.dTmeanC?.median).toBeGreaterThan(1);
    expect(d.dTmeanC?.median).toBeLessThan(1.6);
  });
});

describe('GBIF nearby occurrences contract', () => {
  it('uses a true radius and open licences, not a rectangle', () => {
    const u = new URL(nearbyUrl(18.5, 73.85, 5, 'plants'));
    expect(u.searchParams.get('geoDistance')).toBe('18.5,73.85,5km');
    expect(u.searchParams.get('kingdomKey')).toBe('6');
    expect(u.searchParams.getAll('license')).toEqual(['CC0_1_0', 'CC_BY_4_0']);
    expect(u.searchParams.has('decimalLatitude')).toBe(false);
  });

  it('keeps records, taxa and native status apart', () => {
    const n = parseNearby(fixtures.gbifNearbyFixture, { radiusKm: 5, kingdom: 'plants' });
    expect(n.records).toBe(18342);
    expect(n.taxa).toBe(4);
    expect(n.taxaCapped).toBe(false);
    expect(n.nativeStatus).toBe('not-from-occurrences');
    expect(n.topTaxa[0]).toEqual({ speciesKey: 2480528, records: 1204 });
  });
});
