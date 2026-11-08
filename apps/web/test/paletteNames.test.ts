import { describe, expect, it } from 'vitest';
import { catalogs as account } from '../src/features/account/messages';
import { catalogs as care } from '../src/features/care/messages';
import { catalogs as learn } from '../src/features/learn/messages';
import { catalogs as maps } from '../src/features/maps/messages';
import { catalogs as nature } from '../src/features/nature/messages';
import { catalogs as plan } from '../src/features/plan/messages';
import { en } from '../src/i18n/en';
import { es } from '../src/i18n/es';
import { hi } from '../src/i18n/hi';

/**
 * The command palette keeps its own copy of page names, so opening it does not load every section's
 * text up front. Each copy must read exactly as the page's own title does, in every language.
 */
describe('command palette page names', () => {
  for (const [lang, app] of Object.entries({ en, hi, es }) as Array<[keyof typeof plan, typeof en]>) {
    it(`match the pages' own titles in ${lang}`, () => {
      const n = nature[lang];
      expect(app.palette.pages).toEqual({
        sun: plan[lang].sun.title,
        calendar: care[lang].calendar.title,
        climate: care[lang].climate.title,
        count: n.fit.title,
        birds: n.birds.title,
        sighting: n.sighting.title,
        phenology: n.phenology.title,
        natureLog: n.log.title,
        bloom: n.bloom.title,
        lens: n.lens.title,
        nearby: n.nearby.title,
        corridor: maps[lang].corridor.title,
        impact: n.impact.title,
        stamps: learn[lang].stamps.title,
        story: n.story.title,
        learn: learn[lang].learn.title,
        account: account[lang].account.title,
      });
    });
  }
});
