import { describe, expect, it } from 'vitest';
import { SEED_PACK, taxonById, traitOf, validateCatalog } from '../src';

describe('seed catalogue', () => {
  it('passes validation', () => {
    expect(validateCatalog(SEED_PACK)).toEqual([]);
  });

  it('covers the groups a small-space gardener needs', () => {
    const groups = new Set(SEED_PACK.taxa.map((t) => traitOf(t, 'useGroup')));
    for (const g of ['herb', 'leafy', 'fruiting', 'root', 'fruit', 'flower', 'foliage', 'houseplant'])
      expect(groups.has(g as never), g).toBe(true);
    expect(SEED_PACK.taxa.length).toBeGreaterThanOrEqual(60);
  });

  it('marks every draft as needing review and never guesses GBIF keys', () => {
    for (const t of SEED_PACK.taxa) {
      expect(t.gbifKey).toBeNull();
      for (const a of t.traits) {
        expect(a.review).toBe('needs_review');
        expect(a.evidence).toBe('AI_DRAFT');
      }
    }
  });

  it('records toxicity only from the cited ASPCA source (S10)', () => {
    const cited = SEED_PACK.taxa.flatMap((t) => t.toxicity);
    expect(cited.length).toBeGreaterThan(0);
    for (const x of cited) {
      expect(x.sourceId).toBe('aspca-apcc');
      expect(x.group).not.toBe('people');
    }
    const lily = taxonById('lilium-longiflorum');
    expect(lily?.toxicity.find((x) => x.group === 'cats')?.status).toBe('TOXIC');
    // Unknown stays unknown: no assertion is made for plants we have no source for.
    expect(taxonById('zamioculcas-zamiifolia')?.toxicity).toEqual([]);
  });

  it('lists Lantana camara as invasive in India and Australia from cited lists', () => {
    const lantana = taxonById('lantana-camara');
    const regions = lantana?.regions.filter((r) => r.status === 'INVASIVE_LISTED').map((r) => r.region);
    expect(regions).toEqual(['IN', 'AU']);
    expect(lantana?.regions.every((r) => r.evidence === 'OFFICIAL')).toBe(true);
  });

  it('keeps zero and unknown apart in traits', () => {
    const fern = taxonById('nephrolepis-exaltata');
    expect(fern && traitOf(fern, 'sunHours')).toEqual({ min: 0, max: 2 });
    // Foliage plants have no days-to-maturity: null, not 0.
    expect(fern && traitOf(fern, 'daysToMaturity')).toBeNull();
  });
});

describe('validateCatalog', () => {
  const base = structuredClone(SEED_PACK);
  const first = () => {
    const pack = structuredClone(base);
    return { pack, taxon: pack.taxa[0]! };
  };

  it('rejects a numeric trait without its unit', () => {
    const { pack, taxon } = first();
    const a = taxon.traits.find((x) => x.trait === 'minTempC')!;
    a.unit = null;
    expect(validateCatalog(pack).map((i) => i.message)).toContain('minTempC needs unit °C');
  });

  it('rejects an unknown source and a malformed value', () => {
    const { pack, taxon } = first();
    taxon.traits[0]!.sourceId = 'made-up';
    taxon.traits.find((x) => x.trait === 'heightCm')!.value = { min: 50, max: 10 };
    const msgs = validateCatalog(pack).map((i) => i.message);
    expect(msgs).toContain('unknown source made-up');
    expect(msgs.some((m) => m.startsWith('heightCm:'))).toBe(true);
  });

  it('rejects AI-drafted toxicity and invasive status', () => {
    const { pack, taxon } = first();
    taxon.toxicity.push({
      group: 'cats',
      status: 'NON_TOXIC_LISTED',
      evidence: 'AI_DRAFT',
      sourceId: 'plantpal-draft',
      review: 'needs_review',
    });
    taxon.regions.push({
      region: 'GB',
      status: 'INVASIVE_LISTED',
      evidence: 'AI_DRAFT',
      sourceId: 'plantpal-draft',
      review: 'needs_review',
    });
    const msgs = validateCatalog(pack).map((i) => i.message);
    expect(msgs).toContain('toxicity needs a cited expert or official source');
    expect(msgs).toContain('invasive listings need a cited list, not a draft');
  });

  it('rejects missing traits and duplicates', () => {
    const { pack, taxon } = first();
    taxon.traits = taxon.traits.filter((x) => x.trait !== 'waterNeed');
    pack.taxa.push(structuredClone(pack.taxa[1]!));
    const msgs = validateCatalog(pack).map((i) => i.message);
    expect(msgs).toContain('missing trait waterNeed');
    expect(msgs).toContain('duplicate taxon id');
  });

  it('reports schema errors with a path', () => {
    const issues = validateCatalog({ id: 'x', version: '1', sources: [], taxa: [{ id: 'Bad Id' }] });
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0]?.path).toMatch(/^taxa\.0/);
  });
});
