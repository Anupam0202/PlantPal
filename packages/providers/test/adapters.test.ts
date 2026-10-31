import { describe, expect, it } from 'vitest';
import { AirQuality, Elevation, Forecast, PlaceSearch, SolarClimatology } from '@plantpal/schemas';
import {
  fixtures,
  forecastUrl,
  nearestValid,
  parseAir,
  parseElevation,
  parseForecast,
  parsePlaces,
  parseSolarClimatology,
} from '../src';

const retrievedAt = '2026-10-28T08:50:00.000Z';
const ctx = { lat: 18.5, lon: 73.85, retrievedAt };
const at = (iso: string) => Date.parse(iso);

describe('Open-Meteo forecast contract', () => {
  it('requests metric units, auto time zone and every variable PlantPal uses', () => {
    const u = new URL(forecastUrl(18.5, 73.85));
    expect(u.origin + u.pathname).toBe('https://api.open-meteo.com/v1/forecast');
    expect(u.searchParams.get('timezone')).toBe('auto');
    expect(u.searchParams.get('hourly')).toContain('et0_fao_evapotranspiration');
    expect(u.searchParams.get('hourly')).toContain('vapour_pressure_deficit');
    expect(u.searchParams.get('daily')).toContain('sunshine_duration');
  });

  it('normalises into facts with provenance and validates against the schema', () => {
    const f = parseForecast(fixtures.forecastFixture(), { ...ctx, now: at('2026-10-28T14:15:00+05:30') });
    expect(Forecast.safeParse(f).success).toBe(true);
    expect(f.current.temperatureC).toMatchObject({
      unit: '°C',
      evidence: 'MODELLED',
      phenomenonTime: '2026-10-28T14:15:00+05:30',
      stale: false,
    });
    expect(f.provenance).toMatchObject({
      provider: 'open-meteo-forecast',
      licence: expect.stringContaining('CC BY 4.0'),
      demo: false,
    });
    expect(f.hourly.time[0]).toBe('2026-10-28T00:00:00+05:30');
    expect(f.daily.sunrise[0]).toBe('2026-10-28T06:38:00+05:30');
    expect(f.daily.date).toHaveLength(7);
  });

  it('uses the nearest valid hour for hourly-only values, never the last element or zero', () => {
    const raw = fixtures.forecastFixture({ nullSoilAfterHour: 13 });
    const f = parseForecast(raw, { ...ctx, now: at('2026-10-28T14:15:00+05:30') });
    // Hours 13+ are missing, so the nearest valid soil value is 12:00 (within 3 h), not the last element.
    expect(f.current.soilTemperature6cmC.phenomenonTime).toBe('2026-10-28T12:00:00+05:30');
    expect(f.current.soilTemperature6cmC.value).not.toBeNull();
    const later = parseForecast(raw, { ...ctx, now: at('2026-10-29T14:00:00+05:30') });
    expect(later.current.soilTemperature6cmC.value).toBeNull();
    expect(
      nearestValid(['2026-01-01T00:00', '2026-01-01T01:00'], [null, null], at('2026-01-01T00:30:00Z'), 0)
        .value,
    ).toBeNull();
  });

  it('keeps missing current values unknown', () => {
    const raw = fixtures.forecastFixture();
    const broken = {
      ...raw,
      current: { ...raw.current, relative_humidity_2m: null, wind_gusts_10m: undefined },
    };
    const f = parseForecast(broken, { ...ctx, now: at('2026-10-28T14:15:00+05:30') });
    expect(f.current.humidityPct.value).toBeNull();
    expect(f.current.windGustsKmh.value).toBeNull();
  });

  it('rejects responses in unexpected units or shapes', () => {
    expect(() =>
      parseForecast(fixtures.forecastFixture({ units: { temperature_2m: '°F' } }), { ...ctx, now: 0 }),
    ).toThrow(/°F/);
    expect(() => parseForecast({ hello: 'world' }, { ...ctx, now: 0 })).toThrow(/Unexpected/);
  });
});

describe('Open-Meteo air quality contract', () => {
  it('parses pollutants and says pollen is not covered outside Europe', () => {
    const a = parseAir(fixtures.airFixture(), ctx);
    expect(AirQuality.safeParse(a).success).toBe(true);
    expect(a.usAqi.value).toBe(87);
    expect(a.pm25.unit).toBe('μg/m³');
    expect(a.pollenCovered).toBe(false);
    expect(a.pollen.grass.value).toBeNull();
    expect(parseAir(fixtures.airFixture({ europe: true }), ctx).pollenCovered).toBe(true);
  });
});

describe('elevation, geocoding and NASA POWER contracts', () => {
  it('a missing elevation is unknown, not 0 m', () => {
    expect(parseElevation(fixtures.elevationFixture(559), ctx).elevationM.value).toBe(559);
    const e = parseElevation(fixtures.elevationFixture(null), ctx);
    expect(e.elevationM.value).toBeNull();
    expect(Elevation.safeParse(e).success).toBe(true);
  });

  it('parses places in both hemispheres and tolerates no results', () => {
    const p = parsePlaces(fixtures.geocodingFixture, { retrievedAt });
    expect(PlaceSearch.safeParse(p).success).toBe(true);
    expect(p.results[1]).toMatchObject({
      name: 'Sydney',
      lat: -33.86785,
      countryCode: 'AU',
      timezone: 'Australia/Sydney',
    });
    expect(parsePlaces({ generationtime_ms: 1 }, { retrievedAt }).results).toEqual([]);
  });

  it('parses POWER climatology, drops fill values and converts kWh', () => {
    const s = parseSolarClimatology(fixtures.solarFixture({ fillJan: true }), ctx);
    expect(SolarClimatology.safeParse(s).success).toBe(true);
    expect(s.allSkyMJm2Day[0]).toBeNull();
    expect(s.allSkyMJm2Day[5]).toBe(16.9);
    expect(s.period).toBe('2001–2020');
    const kwh = parseSolarClimatology(fixtures.solarFixture({ units: 'kW-hr/m^2/day' }), ctx);
    expect(kwh.allSkyMJm2Day[1]).toBeCloseTo(22.3 * 3.6, 3);
  });
});
