import { describe, expect, it } from 'vitest';
import { catalogs as copilot } from '../src/features/copilot/messages';
import { catalogs as designer } from '../src/features/designer/messages';
import { catalogs as species } from '../src/features/species/messages';

/** Every string leaf of a message catalog, by its dotted path. */
function leaves(o: object, path = ''): Array<[string, string]> {
  return Object.entries(o).flatMap(([k, v]): Array<[string, string]> =>
    typeof v === 'string'
      ? [[`${path}${k}`, v]]
      : v && typeof v === 'object'
        ? leaves(v, `${path}${k}.`)
        : [],
  );
}

/** Strings that are words (not symbols like "x (m)") and were copied from English unchanged. */
function untranslated(en: object, other: object): string[] {
  const english = new Map(leaves(en));
  return leaves(other)
    .filter(([k, v]) => /[a-z]{3}/.test(v) && english.get(k) === v)
    .map(([k]) => k);
}

describe('Hindi and Spanish copy', () => {
  for (const [name, c] of Object.entries({ copilot, designer, species })) {
    it(`${name}: no string is left in English`, () => {
      expect(untranslated(c.en, c.hi)).toEqual([]);
      expect(untranslated(c.en, c.es)).toEqual([]);
    });
  }
});
