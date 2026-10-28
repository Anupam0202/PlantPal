import { describe, expect, it } from 'vitest';
import { parseOklch } from '../src/color';

describe('parseOklch', () => {
  it('reads plain, percentage, degree and alpha forms', () => {
    expect(parseOklch('oklch(0.5 0.1 120)')).toEqual({ l: 0.5, c: 0.1, h: 120, alpha: 1 });
    expect(parseOklch('OKLCH(50% 0.1 120deg / 40%)')).toEqual({ l: 0.5, c: 0.1, h: 120, alpha: 0.4 });
    expect(parseOklch('  oklch( .62  0.015 140 /0.5 ) ')).toEqual({ l: 0.62, c: 0.015, h: 140, alpha: 0.5 });
  });

  it('rejects malformed input', () => {
    for (const bad of [
      'rgb(0 0 0)',
      'oklch(0.5 0.1)',
      'oklch(0.5 0.1 1 2)',
      'oklch(a b c)',
      'oklch(0.5 0.1 120',
      'oklch(1 1 1 / 1 / 1)',
    ]) {
      expect(() => parseOklch(bad), bad).toThrow();
    }
  });

  it('stays linear on long adversarial input', () => {
    const evil = 'oklch(1' + ' '.repeat(200_000) + 'x';
    const t = performance.now();
    expect(() => parseOklch(evil)).toThrow();
    expect(performance.now() - t).toBeLessThan(200);
  });
});
