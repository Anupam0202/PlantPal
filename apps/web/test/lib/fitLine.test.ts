import { describe, expect, it } from 'vitest';
import { fitLine, graphemes } from '../../src/lib/fitLine';

/** Ten pixels a letter, as a stand-in for a canvas. */
const measure = (line: string) => graphemes(line).length * 10;

describe('fitting a line to a width', () => {
  it('leaves a line that fits as it is', () => {
    expect(fitLine(measure, 200, (g) => `2026 in ${g}`, 'Balcony')).toBe('2026 in Balcony');
  });

  it('shortens only the garden name, so the year still shows in Hindi', () => {
    const name = 'छत पर बना हमारा बहुत बड़ा बगीचा';
    const line = fitLine(measure, 200, (g) => `${g} में 2026`, name);
    expect(line.endsWith('… में 2026')).toBe(true);
    expect(measure(line)).toBeLessThanOrEqual(200);
    // What is left of the name is whole letters from its start.
    const kept = line.slice(0, line.indexOf('…'));
    expect(name.startsWith(kept)).toBe(true);
    expect(graphemes(name).join('').startsWith(graphemes(kept).join(''))).toBe(true);
  });

  it('never splits a letter from its vowel sign', () => {
    expect(graphemes('कि')).toEqual(['कि']);
    // Each cut ends on a whole letter: the vowel sign ि stays with क.
    for (let max = 30; max <= 120; max += 10) {
      const line = fitLine(measure, max, (g) => g, 'किताबें किसान');
      const kept = line.replace('…', '');
      expect(kept.endsWith('क')).toBe(false);
      expect(measure(line)).toBeLessThanOrEqual(max);
    }
  });

  it('keeps the fixed words even when nothing of the name fits', () => {
    expect(fitLine(measure, 90, (g) => `${g} in 2026`, 'Rooftop garden')).toBe('… in 2026');
  });
});
