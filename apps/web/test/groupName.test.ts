import { describe, expect, it } from 'vitest';
import { catalogs, groupName } from '../src/features/nature/messages';

describe('visit record groups by name', () => {
  it('names pollinator groups, sighting groups, phases and birds in each language', () => {
    expect(groupName(catalogs.en, 'bumblebees')).toBe('Bumblebees');
    expect(groupName(catalogs.en, 'butterfly-moth')).toBe('Butterfly or moth');
    expect(groupName(catalogs.en, 'flower')).toBe('Flowers');
    expect(groupName(catalogs.en, 'bird')).toBe('Bird');
    expect(groupName(catalogs.hi, 'butterfly-moth')).toBe('तितली या पतंगा');
    expect(groupName(catalogs.es, 'hoverflies')).toBe('Sírfidos');
  });

  it('keeps a name it does not know as it is', () => {
    expect(groupName(catalogs.en, 'House sparrow')).toBe('House sparrow');
  });
});
