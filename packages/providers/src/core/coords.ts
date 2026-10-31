/** Rounds a coordinate to a grid step (degrees). Coarser rounding improves privacy and cache hits. */
export function roundTo(value: number, step: number): number {
  const r = Math.round(value / step) * step;
  return Number(r.toFixed(4)) + 0; // normalise -0
}

export function roundCoords(lat: number, lon: number, step: number): { lat: number; lon: number } {
  return { lat: roundTo(lat, step), lon: roundTo(((lon + 540) % 360) - 180, step) };
}

export function isValidCoords(lat: unknown, lon: unknown): lat is number {
  return (
    typeof lat === 'number' &&
    typeof lon === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lon) <= 180
  );
}

/**
 * Hemisphere-correct coordinate text (L12): `18.52° N, 73.86° E`, `33.87° S, 151.21° E`.
 * `decimals` defaults to 2 (≈ 1 km), enough to recognise a place without pinpointing a home.
 */
export function formatCoordinates(lat: number, lon: number, decimals = 2): string {
  const ns = lat < 0 ? 'S' : 'N';
  const ew = lon < 0 ? 'W' : 'E';
  return `${Math.abs(lat).toFixed(decimals)}° ${ns}, ${Math.abs(lon).toFixed(decimals)}° ${ew}`;
}
