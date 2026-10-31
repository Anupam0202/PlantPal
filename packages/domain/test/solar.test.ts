import { describe, expect, it } from 'vitest';
import { moonPhase, skyPhase, sunPosition, sunTimes } from '../src/solar';

const min = 60_000;
const near = (a: number | null, b: number, tolMin = 3) => {
  expect(a).not.toBeNull();
  expect(Math.abs((a ?? 0) - b)).toBeLessThan(tolMin * min);
};

describe('solar geometry (NOAA)', () => {
  it('matches published sunrise and sunset times', () => {
    // Pune, 28 Oct 2026: sunrise ≈ 06:35, sunset ≈ 18:04 IST (NOAA calculator).
    const pune = sunTimes(Date.parse('2026-10-28T12:00:00+05:30'), 18.5204, 73.8567);
    near(pune.sunrise, Date.parse('2026-10-28T06:35:00+05:30'), 4);
    near(pune.sunset, Date.parse('2026-10-28T18:04:00+05:30'), 4);
    // London, 21 Jun 2026: sunrise ≈ 04:43, sunset ≈ 21:21 BST.
    const london = sunTimes(Date.parse('2026-06-21T12:00:00+01:00'), 51.5074, -0.1278);
    near(london.sunrise, Date.parse('2026-06-21T04:43:00+01:00'));
    near(london.sunset, Date.parse('2026-06-21T21:21:00+01:00'));
    expect(london.dayLengthS / 3600).toBeGreaterThan(16.5);
    // Sydney, 21 Jun 2026 (southern winter): sunrise ≈ 07:00, sunset ≈ 16:54 AEST.
    const sydney = sunTimes(Date.parse('2026-06-21T12:00:00+10:00'), -33.8688, 151.2093);
    near(sydney.sunrise, Date.parse('2026-06-21T07:00:00+10:00'), 4);
    near(sydney.sunset, Date.parse('2026-06-21T16:54:00+10:00'), 4);
  });

  it('handles polar day and night', () => {
    expect(sunTimes(Date.parse('2026-06-21T12:00:00+02:00'), 69.6492, 18.9553).polar).toBe('day');
    expect(sunTimes(Date.parse('2026-12-21T12:00:00+01:00'), 69.6492, 18.9553).polar).toBe('night');
  });

  it('gives the sun high in the south at northern noon and in the north at southern noon', () => {
    const north = sunPosition(Date.parse('2026-06-21T13:02:00+01:00'), 51.5, -0.13);
    expect(north.elevation).toBeGreaterThan(60);
    expect(Math.abs(north.azimuth - 180)).toBeLessThan(10);
    const south = sunPosition(Date.parse('2026-06-21T11:57:00+10:00'), -33.87, 151.21);
    expect(south.elevation).toBeGreaterThan(30);
    expect(Math.min(south.azimuth, 360 - south.azimuth)).toBeLessThan(10);
    expect(sunPosition(Date.parse('2026-06-21T00:00:00+01:00'), 51.5, -0.13).elevation).toBeLessThan(0);
  });

  it('maps elevation to sky phases', () => {
    expect(skyPhase(-20, true)).toBe('night');
    expect(skyPhase(-2, true)).toBe('dawn');
    expect(skyPhase(-2, false)).toBe('dusk');
    expect(skyPhase(4, false)).toBe('golden');
    expect(skyPhase(30, false)).toBe('day');
  });
});

describe('moon phase', () => {
  it('finds full and new moons within about a day', () => {
    // Full moon 26 Oct 2026; new moon 9 Nov 2026.
    expect(moonPhase(Date.parse('2026-10-26T04:00:00Z')).illumination).toBeGreaterThan(0.95);
    expect(moonPhase(Date.parse('2026-11-09T07:00:00Z')).illumination).toBeLessThan(0.05);
    expect(moonPhase(Date.parse('2026-10-26T04:00:00Z')).name).toBe('full');
  });
});
