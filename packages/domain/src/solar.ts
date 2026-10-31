/**
 * Solar geometry after the NOAA Solar Calculator (Meeus). Accurate to about a minute for sunrise and
 * sunset between ±72° latitude. Pure functions of an instant and a position: no network needed.
 */
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

interface SunCore {
  declination: number;
  eqOfTimeMin: number;
}

function sunCore(epochMs: number): SunCore {
  const jd = epochMs / 86_400_000 + 2440587.5;
  const jc = (jd - 2451545) / 36525;
  const l0 = (280.46646 + jc * (36000.76983 + jc * 0.0003032)) % 360;
  const m = 357.52911 + jc * (35999.05029 - 0.0001537 * jc);
  const e = 0.016708634 - jc * (0.000042037 + 0.0000001267 * jc);
  const c =
    Math.sin(rad(m)) * (1.914602 - jc * (0.004817 + 0.000014 * jc)) +
    Math.sin(rad(2 * m)) * (0.019993 - 0.000101 * jc) +
    Math.sin(rad(3 * m)) * 0.000289;
  const trueLong = l0 + c;
  const omega = 125.04 - 1934.136 * jc;
  const appLong = trueLong - 0.00569 - 0.00478 * Math.sin(rad(omega));
  const meanObliq = 23 + (26 + (21.448 - jc * (46.815 + jc * (0.00059 - jc * 0.001813))) / 60) / 60;
  const obliq = meanObliq + 0.00256 * Math.cos(rad(omega));
  const declination = deg(Math.asin(Math.sin(rad(obliq)) * Math.sin(rad(appLong))));
  const y = Math.tan(rad(obliq / 2)) ** 2;
  const eqOfTimeMin =
    4 *
    deg(
      y * Math.sin(2 * rad(l0)) -
        2 * e * Math.sin(rad(m)) +
        4 * e * y * Math.sin(rad(m)) * Math.cos(2 * rad(l0)) -
        0.5 * y * y * Math.sin(4 * rad(l0)) -
        1.25 * e * e * Math.sin(2 * rad(m)),
    );
  return { declination, eqOfTimeMin };
}

export interface SunPosition {
  /** Degrees above the horizon, corrected for atmospheric refraction. */
  elevation: number;
  /** Degrees clockwise from true north. */
  azimuth: number;
  declination: number;
}

export function sunPosition(epochMs: number, lat: number, lon: number): SunPosition {
  const { declination, eqOfTimeMin } = sunCore(epochMs);
  const d = new Date(epochMs);
  const utcMin =
    d.getUTCHours() * 60 + d.getUTCMinutes() + d.getUTCSeconds() / 60 + d.getUTCMilliseconds() / 60000;
  const tst = (((utcMin + eqOfTimeMin + 4 * lon) % 1440) + 1440) % 1440;
  const ha = tst / 4 < 0 ? tst / 4 + 180 : tst / 4 - 180;
  const cosZen =
    Math.sin(rad(lat)) * Math.sin(rad(declination)) +
    Math.cos(rad(lat)) * Math.cos(rad(declination)) * Math.cos(rad(ha));
  const zenith = deg(Math.acos(Math.min(1, Math.max(-1, cosZen))));
  const elev = 90 - zenith;
  // Refraction (NOAA approximation).
  let refr = 0;
  if (elev <= 85) {
    const te = Math.tan(rad(elev));
    if (elev > 5) refr = 58.1 / te - 0.07 / te ** 3 + 0.000086 / te ** 5;
    else if (elev > -0.575) refr = 1735 + elev * (-518.2 + elev * (103.4 + elev * (-12.79 + elev * 0.711)));
    else refr = -20.772 / te;
    refr /= 3600;
  }
  const azDen = Math.cos(rad(lat)) * Math.sin(rad(zenith));
  let azimuth: number;
  if (Math.abs(azDen) < 1e-9) azimuth = lat > 0 ? 180 : 0;
  else {
    const azRad = (Math.sin(rad(lat)) * Math.cos(rad(zenith)) - Math.sin(rad(declination))) / azDen;
    const a = deg(Math.acos(Math.min(1, Math.max(-1, azRad))));
    azimuth = ha > 0 ? (a + 180) % 360 : (540 - a) % 360;
  }
  return { elevation: elev + refr, azimuth, declination };
}

export interface SunTimes {
  sunrise: number | null;
  sunset: number | null;
  solarNoon: number;
  /** Seconds of daylight; 0 in polar night, 86 400 in polar day. */
  dayLengthS: number;
  polar: 'day' | 'night' | null;
}

/**
 * Sunrise, sunset and solar noon for the UTC calendar day containing `dayStartUtcMs`'s local noon.
 * Pass the instant of local noon for the garden-local date to get that date's events.
 */
export function sunTimes(localNoonMs: number, lat: number, lon: number): SunTimes {
  const dayStart = Date.UTC(
    new Date(localNoonMs).getUTCFullYear(),
    new Date(localNoonMs).getUTCMonth(),
    new Date(localNoonMs).getUTCDate(),
  );
  const noonFor = (eq: number) => dayStart + (720 - 4 * lon - eq) * 60_000;
  // Two passes: evaluate the sun at the approximate solar noon of the day.
  let core = sunCore(localNoonMs);
  let noon = noonFor(core.eqOfTimeMin);
  core = sunCore(noon);
  noon = noonFor(core.eqOfTimeMin);
  // Keep solar noon within ±12 h of the requested instant (handles dates near the antimeridian).
  while (noon - localNoonMs > 12 * 3600_000) noon -= 86_400_000;
  while (localNoonMs - noon > 12 * 3600_000) noon += 86_400_000;
  core = sunCore(noon);
  const cosHa =
    Math.cos(rad(90.833)) / (Math.cos(rad(lat)) * Math.cos(rad(core.declination))) -
    Math.tan(rad(lat)) * Math.tan(rad(core.declination));
  if (cosHa > 1) return { sunrise: null, sunset: null, solarNoon: noon, dayLengthS: 0, polar: 'night' };
  if (cosHa < -1) return { sunrise: null, sunset: null, solarNoon: noon, dayLengthS: 86_400, polar: 'day' };
  const haMin = deg(Math.acos(cosHa)) * 4;
  return {
    sunrise: Math.round(noon - haMin * 60_000),
    sunset: Math.round(noon + haMin * 60_000),
    solarNoon: Math.round(noon),
    dayLengthS: Math.round(haMin * 2 * 60),
    polar: null,
  };
}

export type SkyPhase = 'night' | 'twilight' | 'dawn' | 'golden' | 'day' | 'dusk';

/** Sky phase from solar elevation and whether the sun is rising (for the Living Sky gradient). */
export function skyPhase(elevation: number, rising: boolean): SkyPhase {
  if (elevation < -12) return 'night';
  if (elevation < -4) return 'twilight';
  if (elevation < 1) return rising ? 'dawn' : 'dusk';
  if (elevation < 8) return 'golden';
  return 'day';
}

export type MoonPhaseName =
  | 'new'
  | 'waxing-crescent'
  | 'first-quarter'
  | 'waxing-gibbous'
  | 'full'
  | 'waning-gibbous'
  | 'last-quarter'
  | 'waning-crescent';

/** Mean lunar phase (accurate to within about a day): age fraction 0 = new, 0.5 = full. */
export function moonPhase(epochMs: number): { fraction: number; illumination: number; name: MoonPhaseName } {
  const synodic = 29.530588853;
  const jd = epochMs / 86_400_000 + 2440587.5;
  const fraction = ((((jd - 2451550.1) / synodic) % 1) + 1) % 1;
  const illumination = (1 - Math.cos(2 * Math.PI * fraction)) / 2;
  const names: MoonPhaseName[] = [
    'new',
    'waxing-crescent',
    'first-quarter',
    'waxing-gibbous',
    'full',
    'waning-gibbous',
    'last-quarter',
    'waning-crescent',
  ];
  const name = names[Math.floor(((fraction + 1 / 16) % 1) * 8)] ?? 'new';
  return { fraction, illumination, name };
}
