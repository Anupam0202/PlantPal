import { describe, expect, it } from 'vitest';
import { ancestorsOf, descendantsOf, germinationRate } from '../src/lineage';

const plant = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  displayName: id,
  parentSpecimenId: null as string | null,
  seedLotId: null as string | null,
  origin: 'nursery' as const,
  deletedAt: null as number | null,
  ...over,
});
const lot = (id: string, specimenId: string | null, over: Record<string, unknown> = {}) => ({
  id,
  name: id,
  specimenId,
  deletedAt: null as number | null,
  ...over,
});

// Grandma tomato → saved lot L1 → two seedlings; one seedling → cutting; the cutting → lot L2 → plant.
const plants = [
  plant('grandma'),
  plant('seedling-a', { seedLotId: 'L1', origin: 'seed' }),
  plant('seedling-b', { seedLotId: 'L1', origin: 'seed' }),
  plant('cutting', { parentSpecimenId: 'seedling-a', origin: 'cutting' }),
  plant('third-gen', { seedLotId: 'L2', origin: 'seed' }),
  plant('gone', { seedLotId: 'L1', deletedAt: 1 }),
];
const lots = [lot('L1', 'grandma'), lot('L2', 'cutting'), lot('bought', null)];

describe('propagation lineage', () => {
  it('walks ancestors through seed lots and cuttings, oldest first', () => {
    expect(ancestorsOf('third-gen', plants, lots).map((r) => `${r.kind}:${r.id}`)).toEqual([
      'plant:grandma',
      'lot:L1',
      'plant:seedling-a',
      'plant:cutting',
      'lot:L2',
    ]);
    expect(ancestorsOf('grandma', plants, lots)).toEqual([]);
  });

  it('builds the family tree below a plant, leaving out deleted records', () => {
    const tree = descendantsOf({ kind: 'plant', id: 'grandma' }, plants, lots);
    const flat = (n: NonNullable<typeof tree>, depth = 0): string[] => [
      `${'  '.repeat(depth)}${n.kind}:${n.id}`,
      ...n.children.flatMap((c) => flat(c, depth + 1)),
    ];
    expect(flat(tree!)).toEqual([
      'plant:grandma',
      '  lot:L1',
      '    plant:seedling-a',
      '      plant:cutting',
      '        lot:L2',
      '          plant:third-gen',
      '    plant:seedling-b',
    ]);
  });

  it('stops on loops instead of running forever', () => {
    const loopy = [plant('x', { parentSpecimenId: 'y' }), plant('y', { parentSpecimenId: 'x' })];
    expect(ancestorsOf('x', loopy, []).map((r) => r.id)).toEqual(['y']);
    expect(descendantsOf({ kind: 'plant', id: 'x' }, loopy, [])?.children[0]?.children).toEqual([]);
  });

  it('reports germination as sprouted out of sown, or unknown before any test', () => {
    expect(germinationRate([])).toBeNull();
    expect(
      germinationRate([
        { testedOn: '2026-03-01', sown: 10, sprouted: 7, days: 6 },
        { testedOn: '2026-09-01', sown: 10, sprouted: 5, days: null },
      ]),
    ).toBeCloseTo(0.6);
  });
});
