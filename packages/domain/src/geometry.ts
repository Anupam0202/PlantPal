import type { ContainerDims, ContainerShape } from '@plantpal/schemas';

/** Scales `width × height` to fit inside `max` on the long edge, never upscaling. */
export function fitWithin(width: number, height: number, max: number): { width: number; height: number } {
  if (width <= 0 || height <= 0) throw new RangeError('Image dimensions must be positive');
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/**
 * Approximate container volume in litres from inside dimensions, or `null` when the needed
 * dimensions are missing. Round pots are treated as cylinders (a slight overestimate for tapered pots).
 */
export function containerVolumeL(shape: ContainerShape, dims: ContainerDims): number | null {
  const { diameterCm, lengthCm, widthCm, depthCm } = dims;
  if (!depthCm) return null;
  let cm3: number | null = null;
  if ((shape === 'round' || shape === 'grow-bag' || shape === 'hanging') && diameterCm) {
    cm3 = Math.PI * (diameterCm / 2) ** 2 * depthCm;
  } else if (lengthCm && widthCm) {
    cm3 = lengthCm * widthCm * depthCm;
  } else if (shape === 'square' && lengthCm) {
    cm3 = lengthCm * lengthCm * depthCm;
  }
  return cm3 === null ? null : Math.round((cm3 / 1000) * 10) / 10;
}

export const COMPASS_8 = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;
export type Compass8 = (typeof COMPASS_8)[number];

export function compassToDegrees(c: Compass8): number {
  return COMPASS_8.indexOf(c) * 45;
}

export function degreesToCompass(deg: number): Compass8 {
  const i = Math.round((((deg % 360) + 360) % 360) / 45) % 8;
  return COMPASS_8[i] ?? 'N';
}
