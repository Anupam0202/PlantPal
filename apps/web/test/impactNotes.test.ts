import { describe, expect, it } from 'vitest';
import { catalogs } from '../src/features/nature/messages';

describe('impact ledger notes', () => {
  it('use the singular for one container or one plant', () => {
    expect(catalogs.en.impact.notes.substrate(1)).toMatch(/^1 container with/);
    expect(catalogs.en.impact.notes.substrate(3)).toMatch(/^3 containers with/);
    expect(catalogs.en.impact.notes.spread('0.2', '0.4', 1)).toMatch(/; 1 plant$/);
    expect(catalogs.en.impact.notes.spread('0.2', '0.4', 2)).toMatch(/; 2 plants$/);
    expect(catalogs.es.impact.notes.substrate(1)).toMatch(/^1 maceta con/);
    expect(catalogs.es.impact.notes.substrate(2)).toMatch(/^2 macetas con/);
    expect(catalogs.es.impact.notes.spread('0,2', '0,4', 1)).toMatch(/; 1 planta$/);
    expect(catalogs.es.impact.notes.spread('0,2', '0,4', 4)).toMatch(/; 4 plantas$/);
  });
});
