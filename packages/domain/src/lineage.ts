import type { GerminationTest, SeedLot, Specimen } from '@plantpal/schemas';

/** Propagation lineage (§6.13): plant → seed lot or cutting → new plants, as a family tree. */

export type LineageRef = { kind: 'plant' | 'lot'; id: string; name: string };
export interface LineageNode extends LineageRef {
  children: LineageNode[];
}

type PlantLike = Pick<
  Specimen,
  'id' | 'displayName' | 'parentSpecimenId' | 'seedLotId' | 'origin' | 'deletedAt'
>;
type LotLike = Pick<SeedLot, 'id' | 'name' | 'specimenId' | 'deletedAt'>;

/** Sprouted out of sown across every test; null until something was tested. */
export function germinationRate(tests: readonly GerminationTest[]): number | null {
  const sown = tests.reduce((n, t) => n + t.sown, 0);
  return sown === 0 ? null : tests.reduce((n, t) => n + t.sprouted, 0) / sown;
}

/**
 * Ancestors of a plant, oldest first: through the seed lot it grew from (and the plant that lot was
 * saved from), or its parent plant for cuttings and divisions. Stops on a loop or a missing link.
 */
export function ancestorsOf(
  plantId: string,
  plants: readonly PlantLike[],
  lots: readonly LotLike[],
): LineageRef[] {
  const plant = new Map(plants.map((p) => [p.id, p]));
  const lot = new Map(lots.map((l) => [l.id, l]));
  const out: LineageRef[] = [];
  const seen = new Set<string>([`plant:${plantId}`]);
  let cur = plant.get(plantId);
  while (cur) {
    const viaLot = cur.seedLotId ? lot.get(cur.seedLotId) : undefined;
    if (viaLot) {
      if (seen.has(`lot:${viaLot.id}`)) break;
      seen.add(`lot:${viaLot.id}`);
      out.push({ kind: 'lot', id: viaLot.id, name: viaLot.name });
      cur = viaLot.specimenId ? plant.get(viaLot.specimenId) : undefined;
    } else cur = cur.parentSpecimenId ? plant.get(cur.parentSpecimenId) : undefined;
    if (!cur || seen.has(`plant:${cur.id}`)) break;
    seen.add(`plant:${cur.id}`);
    out.push({ kind: 'plant', id: cur.id, name: cur.displayName });
  }
  return out.reverse();
}

/** Everything descended from a plant or a seed lot, as a tree (deleted records left out). */
export function descendantsOf(
  root: { kind: 'plant' | 'lot'; id: string },
  plants: readonly PlantLike[],
  lots: readonly LotLike[],
): LineageNode | null {
  const alivePlants = plants.filter((p) => p.deletedAt === null);
  const aliveLots = lots.filter((l) => l.deletedAt === null);
  const seen = new Set<string>();
  const build = (kind: 'plant' | 'lot', id: string): LineageNode | null => {
    const key = `${kind}:${id}`;
    if (seen.has(key)) return null;
    seen.add(key);
    if (kind === 'plant') {
      const p = alivePlants.find((x) => x.id === id);
      if (!p) return null;
      const children = [
        ...aliveLots.filter((l) => l.specimenId === id).map((l) => build('lot', l.id)),
        // Cuttings and divisions point straight at their parent plant.
        ...alivePlants
          .filter((c) => c.parentSpecimenId === id && !c.seedLotId)
          .map((c) => build('plant', c.id)),
      ];
      return {
        kind,
        id,
        name: p.displayName,
        children: children.filter((c): c is LineageNode => c !== null),
      };
    }
    const l = aliveLots.find((x) => x.id === id);
    if (!l) return null;
    const children = alivePlants.filter((c) => c.seedLotId === id).map((c) => build('plant', c.id));
    return { kind, id, name: l.name, children: children.filter((c): c is LineageNode => c !== null) };
  };
  return build(root.kind, root.id);
}
