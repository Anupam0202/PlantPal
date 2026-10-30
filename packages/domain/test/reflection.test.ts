import { describe, expect, it } from 'vitest';
import { lastWeek, summarizeWeek, summaryText, weekStart } from '../src';

describe('weekly reflection summary (F8)', () => {
  it('finds last Monday–Sunday in the garden’s dates', () => {
    expect(weekStart('2026-10-30')).toBe('2026-10-26'); // a Friday
    expect(weekStart('2026-10-26')).toBe('2026-10-26');
    expect(lastWeek('2026-10-30')).toEqual({ from: '2026-10-19', to: '2026-10-25', thisWeek: '2026-10-26' });
    // Across a year boundary.
    expect(lastWeek('2027-01-01')).toEqual({ from: '2026-12-21', to: '2026-12-27', thisWeek: '2026-12-28' });
  });

  it('counts only last week’s records and never converts counts to mass', () => {
    const s = summarizeWeek(
      {
        care: [
          { kind: 'water', on: '2026-10-20' },
          { kind: 'water', on: '2026-10-21' },
          { kind: 'feed', on: '2026-10-25' },
          { kind: 'water', on: '2026-10-26' },
        ],
        notes: [{ title: 'Basil flowering', on: '2026-10-22' }],
        visits: [{ protocol: 'fit', on: '2026-10-19' }],
        harvests: [
          { massG: 300, count: null, on: '2026-10-24' },
          { massG: null, count: 3, on: '2026-10-24' },
        ],
      },
      '2026-10-19',
      '2026-10-25',
    );
    expect(s).toMatchObject({
      care: 3,
      careByKind: { water: 2, feed: 1 },
      visits: 1,
      harvests: 2,
      harvestG: 300,
      quiet: false,
    });
    expect(summaryText(s)).toBe(
      'Care logged 3 times (water 2, feed 1). 1 journal notes: Basil flowering. 1 nature visits. 2 harvests (0.3 kg weighed).',
    );
  });

  it('calls a quiet week quiet, without blame', () => {
    const s = summarizeWeek({ care: [], notes: [], visits: [], harvests: [] }, '2026-10-19', '2026-10-25');
    expect(s.quiet).toBe(true);
    expect(summaryText(s)).toBe('Nothing logged last week.');
  });
});
