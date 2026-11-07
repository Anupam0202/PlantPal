import { describe, expect, it } from 'vitest';
import { catalogs as ai } from '../src/ai/messages';
import { catalogs as aiSettings } from '../src/ai/settingsMessages';
import { catalogs as account } from '../src/features/account/messages';
import { catalogs as care } from '../src/features/care/messages';
import { catalogs as copilot } from '../src/features/copilot/messages';
import { catalogs as designer } from '../src/features/designer/messages';
import { catalogs as seeds } from '../src/features/garden/seedMessages';
import { catalogs as health } from '../src/features/health/messages';
import { catalogs as learn } from '../src/features/learn/messages';
import { catalogs as maps } from '../src/features/maps/messages';
import { catalogs as nature } from '../src/features/nature/messages';
import { catalogs as plan } from '../src/features/plan/messages';
import { catalogs as species } from '../src/features/species/messages';
import { en } from '../src/i18n/en';
import { es } from '../src/i18n/es';
import { hi } from '../src/i18n/hi';

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

/**
 * Every catalog a person can reach today. Accounts beyond signing in, and the community, need the
 * PlantPal server, so only the sign-in part of the account catalog is checked.
 */
const catalogs: Record<string, Record<'en' | 'hi' | 'es', object>> = {
  app: { en, hi, es },
  ai,
  aiSettings,
  account: { en: account.en.account, hi: account.hi.account, es: account.es.account },
  care,
  copilot,
  designer,
  seeds,
  health,
  learn,
  maps,
  nature,
  plan,
  species,
};

/** Words spelled the same in the other language, so the English copy is right. */
const sameWord: Record<string, { hi?: string[]; es?: string[] }> = {
  app: {
    hi: ['appName'],
    es: ['appName', 'space.material', 'labels.material.metal', 'settings.imperial'],
  },
  aiSettings: { es: ['roles.embed'] },
  care: { es: ['climate.koppenGroups.A', 'climate.koppenGroups.D', 'climate.koppenGroups.E'] },
  plan: { es: ['seed.minutesOptions.15', 'seed.minutesOptions.30', 'plan.title'] },
};

describe('Hindi and Spanish copy', () => {
  for (const [name, c] of Object.entries(catalogs)) {
    it(`${name}: no string is left in English`, () => {
      const left = (lang: 'hi' | 'es') =>
        untranslated(c.en, c[lang]).filter((k) => !sameWord[name]?.[lang]?.includes(k));
      expect(left('hi')).toEqual([]);
      expect(left('es')).toEqual([]);
    });
  }
});
