import { describe, expect, it } from 'vitest';
import { matchSpecimens, parseQuickCapture } from '../src/quickCapture';

const specimens = [
  { id: 'a', displayName: 'Tomato' },
  { id: 'b', displayName: 'Basil' },
  { id: 'c', displayName: 'Curry leaf' },
];

describe('quick capture parser', () => {
  it('reads watering with litres or millilitres', () => {
    expect(parseQuickCapture('watered tomatoes 2 l', specimens)).toEqual([
      {
        type: 'care',
        kind: 'water',
        specimenIds: ['a'],
        plantText: 'tomatoes',
        amountMl: 2000,
        text: 'watered tomatoes 2 l',
      },
    ]);
    expect(parseQuickCapture('water basil 250ml', specimens)[0]).toMatchObject({
      kind: 'water',
      amountMl: 250,
      specimenIds: ['b'],
    });
    expect(parseQuickCapture('watered the curry leaf', specimens)[0]).toMatchObject({
      amountMl: null,
      specimenIds: ['c'],
    });
  });

  it('reads harvests without converting counts to mass', () => {
    expect(parseQuickCapture('harvested 300 g basil', specimens)[0]).toMatchObject({
      type: 'harvest',
      massG: 300,
      count: null,
    });
    expect(parseQuickCapture('picked 6 tomatoes', specimens)[0]).toMatchObject({
      type: 'harvest',
      massG: null,
      count: null,
    });
    expect(parseQuickCapture('harvested 2 bunches basil', specimens)[0]).toMatchObject({
      count: 2,
      countLabel: 'bunch',
    });
    expect(parseQuickCapture('harvested 1.5 kg tomato', specimens)[0]).toMatchObject({ massG: 1500 });
  });

  it('splits several clauses and falls back to notes', () => {
    const r = parseQuickCapture('fed the tomato; pruned basil, saw 3 bees on lavender', specimens);
    expect(r.map((p) => (p.type === 'care' ? p.kind : p.type))).toEqual(['feed', 'prune', 'note']);
  });

  it('matches whole words only', () => {
    expect(matchSpecimens('basilisk sighting', specimens)).toEqual([]);
    expect(matchSpecimens('Curry leaves look yellow', specimens)).toEqual(['c']);
  });
});
