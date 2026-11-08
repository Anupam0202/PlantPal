import { describe, expect, it } from 'vitest';
import { HEALTH_CHECK_TITLE_PREFIX } from '../src/data/titles';
import { careTitle, catalogs } from '../src/features/care/messages';

describe('care task names', () => {
  it('names a health follow-up in the chosen language', () => {
    const title = `${HEALTH_CHECK_TITLE_PREFIX}Yellow leaves`;
    expect(careTitle(catalogs.en, 'custom', title)).toBe('Health check: Yellow leaves');
    expect(careTitle(catalogs.hi, 'custom', title)).toBe('स्वास्थ्य जाँच: Yellow leaves');
    expect(careTitle(catalogs.es, 'custom', title)).toBe('Revisión de salud: Yellow leaves');
  });

  it('keeps a reminder’s own title and names other tasks by their kind', () => {
    expect(careTitle(catalogs.hi, 'custom', 'Repot the fern')).toBe('Repot the fern');
    expect(careTitle(catalogs.es, 'custom', null)).toBe(catalogs.es.kinds.custom);
    expect(careTitle(catalogs.es, 'water', 'Water')).toBe(catalogs.es.kinds.water);
    expect(careTitle(catalogs.hi, 'check-water', null)).toBe(catalogs.hi.kinds['check-water']);
  });
});
