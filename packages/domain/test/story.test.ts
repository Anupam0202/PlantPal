import { describe, expect, it } from 'vitest';
import { gardenStory } from '../src';

describe('Garden Story (§6.14)', () => {
  it('tells one year from the records, keeping weights and counts apart', () => {
    const s = gardenStory({
      year: 2026,
      plantings: [
        { name: 'Basil', plantedOn: '2026-03-02' },
        { name: 'Old rose', plantedOn: '2024-05-01' },
        { name: 'Tomato', plantedOn: '2026-02-10' },
        { name: 'Unknown date', plantedOn: null },
      ],
      harvests: [
        { name: 'Tomato', massG: 800, count: null, countLabel: null, on: '2026-07-01' },
        { name: 'tomato ', massG: 400, count: null, countLabel: null, on: '2026-07-09' },
        { name: 'Chilli', massG: null, count: 12, countLabel: 'chillies', on: '2026-08-01' },
        { name: 'Tomato', massG: 999, count: null, countLabel: null, on: '2025-07-01' },
      ],
      visits: [
        {
          protocol: 'fit-count',
          on: '2026-05-01',
          records: [
            { group: 'bees', taxonName: null, count: 4, state: 'YES' },
            { group: 'hoverflies', taxonName: null, count: 0, state: 'NO' },
          ],
        },
        {
          protocol: 'sighting',
          on: '2026-06-01',
          records: [{ group: 'birds', taxonName: 'Purple sunbird', count: 1, state: 'YES' }],
        },
        {
          protocol: 'phenology',
          on: '2026-06-02',
          records: [{ group: 'flower', taxonName: null, count: null, state: 'YES' }],
        },
      ],
      rain: [
        { on: '2026-07-01', litres: 12.4 },
        { on: '2025-07-01', litres: 100 },
      ],
      photos: [
        { id: 'a', on: '2026-03-05' },
        { id: 'b', on: '2026-03-20' },
        { id: 'c', on: '2026-06-01' },
      ],
    });
    expect(s.firstPlantings.map((p) => p.name)).toEqual(['Tomato', 'Basil']);
    expect(s.harvests).toEqual([
      { name: 'Tomato', massG: 1200, count: 0, countLabel: null },
      { name: 'Chilli', massG: 0, count: 12, countLabel: 'chillies' },
    ]);
    expect(s.visits).toBe(3);
    expect(s.visitors).toEqual([
      { group: 'bees', individuals: 4 },
      { group: 'birds', individuals: 1 },
    ]);
    expect(s.named).toEqual(['Purple sunbird']);
    expect(s.rainLitres).toBe(12);
    expect(s.photos).toEqual(['a', 'c']);
    expect(s.empty).toBe(false);
  });

  it('says when a year has nothing to tell', () => {
    const s = gardenStory({ year: 2026, plantings: [], harvests: [], visits: [], rain: [], photos: [] });
    expect(s.empty).toBe(true);
  });
});
