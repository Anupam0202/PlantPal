import type { Taxon } from '@plantpal/schemas';
import { describe, expect, it } from 'vitest';
import { bloomWheel, gapFillers, lensReport, rotateMonth, trait } from '@plantpal/domain';
import { SEED_PACK, taxonById } from '../src';

const T = (id: string) => {
  const t = taxonById(id);
  if (!t) throw new Error(`missing ${id}`);
  return t;
};
const IN = { countryCode: 'IN', l3: null };

describe('Native & Invasive Lens (§6.3 acceptance)', () => {
  const conflict: Taxon = {
    ...T('ocimum-tenuiflorum'),
    id: 'conflict-fixture',
    regions: [
      {
        region: 'IN',
        status: 'NATIVE',
        evidence: 'AI_DRAFT',
        sourceId: 'plantpal-draft',
        review: 'needs_review',
      },
      {
        region: 'IN',
        status: 'INTRODUCED',
        evidence: 'OFFICIAL',
        sourceId: 'griis-in',
        review: 'needs_review',
      },
    ],
  };
  const { entries, counts } = lensReport(
    [
      { id: 'a', name: 'Tulsi', taxon: T('ocimum-tenuiflorum'), identityLevel: 'cultivar' },
      { id: 'b', name: 'Lantana', taxon: T('lantana-camara'), identityLevel: 'species' },
      { id: 'c', name: 'Two sources', taxon: conflict, identityLevel: 'species' },
      { id: 'd', name: 'Basil', taxon: T('ocimum-basilicum'), identityLevel: 'species' },
      { id: 'e', name: 'Mystery pot', taxon: null, identityLevel: 'unknown' },
    ],
    IN,
  );
  const by = (id: string) => entries.find((e) => e.id === id)!;

  it('a known native, with the cultivar note', () => {
    expect(by('a').status).toBe('NATIVE');
    expect(by('a').cultivarNote).toBe(true);
  });
  it('a GRIIS-listed invasive (Lantana camara in India) with its source', () => {
    expect(by('b').status).toBe('INVASIVE_LISTED');
    expect(by('b').matrix.map((m) => m.sourceId)).toContain('griis-in');
  });
  it('a conflict shows every source in the matrix', () => {
    expect(by('c').status).toBe('CONFLICT');
    expect(
      by('c')
        .matrix.map((m) => m.status)
        .sort(),
    ).toEqual(['INTRODUCED', 'NATIVE']);
  });
  it('unknown stays unknown, with the reason', () => {
    expect(by('d')).toMatchObject({ status: 'UNKNOWN', unknownReason: 'no-statement' });
    expect(by('e')).toMatchObject({ status: 'UNKNOWN', unknownReason: 'not-linked' });
    expect(counts).toMatchObject({ NATIVE: 1, INVASIVE_LISTED: 1, CONFLICT: 1, UNKNOWN: 2 });
    const none = lensReport([{ id: 'x', name: 'x', taxon: T('lantana-camara'), identityLevel: 'species' }], {
      countryCode: null,
      l3: null,
    });
    expect(none.entries[0]).toMatchObject({ status: 'UNKNOWN', unknownReason: 'no-region' });
  });
});

describe('Bloom Bridge with the catalogue', () => {
  it('every bloomMonths draft is a list of distinct months 1–12', () => {
    const withBloom = SEED_PACK.taxa.filter((t) => trait(t, 'bloomMonths') !== null);
    expect(withBloom.length).toBeGreaterThan(50);
    for (const t of withBloom) {
      const m = trait(t, 'bloomMonths')!;
      expect(new Set(m).size).toBe(m.length);
      expect(m.every((x) => x >= 1 && x <= 12)).toBe(true);
    }
  });

  it('gap fillers bloom in the gap months, feed pollinators and respect the hemisphere', () => {
    const fill = gapFillers(SEED_PACK.taxa, [11, 12], 'south');
    expect(fill.length).toBeGreaterThan(0);
    for (const f of fill) {
      expect(['medium', 'high']).toContain(trait(f.taxon, 'pollinatorValue'));
      const months = trait(f.taxon, 'bloomMonths')!.map((m) => rotateMonth(m, 'south'));
      expect(f.months.every((m) => months.includes(m))).toBe(true);
    }
    expect(gapFillers(SEED_PACK.taxa, [], 'north')).toEqual([]);
  });

  it('a fern is known not to flower, so it never makes a month unknown', () => {
    const w = bloomWheel(
      [
        {
          id: 'f',
          name: 'Boston fern',
          bloomMonths: trait(T('nephrolepis-exaltata'), 'bloomMonths'),
          pollinatorValue: trait(T('nephrolepis-exaltata'), 'pollinatorValue'),
          observed: {},
        },
      ],
      'north',
    );
    expect(w.unknown).toEqual([]);
    expect(w.gaps).toHaveLength(12);
  });
});
