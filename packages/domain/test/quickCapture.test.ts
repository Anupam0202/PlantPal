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

describe('AI proposals map onto the review list', () => {
  it('normalises litres, keeps nulls and turns tasks into to-dos', async () => {
    const { captureFromAi } = await import('../src/quickCapture');
    expect(
      captureFromAi({
        type: 'careEvent',
        specimenId: 's1',
        kind: 'water',
        amount: { value: 1.5, unit: 'l' },
        when: 'now',
        sourceSpan: 'watered 1.5 l',
      }),
    ).toEqual({
      type: 'care',
      kind: 'water',
      specimenIds: ['s1'],
      plantText: null,
      amountMl: 1500,
      text: 'watered 1.5 l',
    });
    expect(
      captureFromAi({
        type: 'careEvent',
        specimenId: null,
        kind: 'feed',
        amount: null,
        when: 'earlierToday',
        sourceSpan: 'fed',
      }),
    ).toMatchObject({
      specimenIds: [],
      amountMl: null,
    });
    expect(
      captureFromAi({
        type: 'task',
        specimenId: 's2',
        title: 'Repot mint',
        dueOn: '2026-11-01',
        sourceSpan: 'repot mint',
      }),
    ).toEqual({
      type: 'task',
      specimenIds: ['s2'],
      title: 'Repot mint',
      dueOn: '2026-11-01',
      text: 'repot mint',
    });
    expect(
      captureFromAi({
        type: 'observation',
        specimenId: null,
        kind: 'visitor',
        text: 'Bees seen',
        count: 0,
        sourceSpan: '0 bees',
      }),
    ).toEqual({
      type: 'note',
      specimenIds: [],
      text: 'Bees seen (0)',
    });
  });
});

describe('reader safety (CodeQL)', () => {
  it('stays fast on long runs of digits and still reads amounts', () => {
    const start = performance.now();
    parseQuickCapture(`watered basil ${'9'.repeat(5000)}`, []);
    parseQuickCapture(`watered ${'9.'.repeat(3000)}x`, []);
    expect(performance.now() - start).toBeLessThan(200);
    const [p] = parseQuickCapture('watered tomato 1,5 l', [{ id: 'a', displayName: 'Tomato' }]);
    expect(p).toMatchObject({ type: 'care', amountMl: 1500, specimenIds: ['a'] });
    const [q] = parseQuickCapture('watered tomato 250ml', [{ id: 'a', displayName: 'Tomato' }]);
    expect(q).toMatchObject({ amountMl: 250 });
  });
});
