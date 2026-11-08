import { describe, expect, it } from 'vitest';
import { catalogs as ai } from '../src/ai/messages';
import { catalogs as care } from '../src/features/care/messages';
import { catalogs as nature } from '../src/features/nature/messages';
import { catalogs as species } from '../src/features/species/messages';
import { en } from '../src/i18n/en';
import { es } from '../src/i18n/es';
import { hi } from '../src/i18n/hi';

describe('a count of one reads in the singular', () => {
  it('in Hindi', () => {
    expect(hi.garden.plantCount(1)).toBe('1 पौधा');
    expect(hi.garden.plantCount(3)).toBe('3 पौधे');
    expect(hi.garden.activeCount(1)).toBe('1 बढ़ रहा है');
    expect(hi.space.plantsHere(1)).toBe('1 पौधा');
    expect(hi.data.imported(1)).toBe('1 रिकॉर्ड आयात हुआ');
    expect(care.hi.missed(1)).toBe('1 छूटा कार्य');
    expect(care.hi.missed(2)).toBe('2 छूटे कार्य');
    expect(nature.hi.story.card.plantings(1)).toBe('1 नया पौधा लगाया');
    expect(nature.hi.story.card.plantings(4)).toBe('4 नए पौधे लगाए');
    expect(nature.hi.log.uncertain(1)).toBe('1 पक्का नहीं');
    expect(nature.hi.nearby.species(1)).toBe('शोध-स्तर के रिकॉर्ड वाली 1 प्रजाति');
    expect(nature.hi.harvest.useSoonBody(1)).toContain('1 चीज़ की');
    expect(ai.hi.explain.dropped(1)).toMatch(/^1 AI सुझाव छोड़ा गया/);
    expect(ai.hi.cap.body(1)).toContain('1 AI अनुरोध की सीमा');
    expect(species.hi.dropped(1)).toBe('1 सुझाव GBIF में नहीं मिला और छोड़ दिया गया।');
  });

  it('in English and Spanish', () => {
    expect(en.data.imported(1)).toBe('Imported 1 record');
    expect(en.data.imported(5)).toBe('Imported 5 records');
    expect(es.data.imported(1)).toBe('1 registro importado');
    expect(nature.en.fit.total(1)).toBe('1 insect');
    expect(nature.en.nearby.observations(1)).toBe('1 record');
    expect(nature.es.nearby.observations(1)).toBe('1 registro');
    expect(nature.es.nearby.species(1)).toMatch(/^1 especie con/);
    expect(nature.en.harvest.useSoonBody(1)).toBe('1 item in your pantry reaches its use-by date soon.');
    expect(nature.es.harvest.useSoonBody(1)).toMatch(/^1 producto de tu despensa llega/);
    expect(ai.en.cap.body(1)).toContain('a soft cap of 1 AI request a day');
    expect(ai.es.cap.body(1)).toContain('un límite de 1 solicitud de IA');
    expect(ai.es.explain.dropped(1)).toMatch(/^1 sugerencia de IA se omitió/);
  });
});
