import { ancestorsOf, descendantsOf, type LineageNode, type LineageRef } from '@plantpal/domain';
import type { Specimen } from '@plantpal/schemas';
import { buttonClasses, Card } from '@plantpal/ui';
import { Link } from '@tanstack/react-router';
import { ChevronRight, Sprout } from 'lucide-react';
import { useLineage } from '../../data/queries';
import { useSeedT } from './seedMessages';

function RefLink({ r }: { r: LineageRef }) {
  const s = useSeedT();
  const label = `${r.kind === 'lot' ? `${s.lot}: ` : ''}${r.name}`;
  return r.kind === 'plant' ? (
    <Link to="/garden/plants/$specimenId" params={{ specimenId: r.id }} className="text-accent-ink underline">
      {label}
    </Link>
  ) : (
    <Link to="/garden/seeds/$lotId" params={{ lotId: r.id }} className="text-accent-ink underline">
      {label}
    </Link>
  );
}

function Branch({ node }: { node: LineageNode }) {
  return (
    <ul className="ml-4 flex flex-col gap-1 border-l border-line pl-3">
      {node.children.map((c) => (
        <li key={`${c.kind}:${c.id}`}>
          <RefLink r={c} />
          {c.children.length > 0 && <Branch node={c} />}
        </li>
      ))}
    </ul>
  );
}

/** Where a plant came from (seed lots, cuttings) and what grew from it (§6.13). */
export function FamilyTree({ specimen }: { specimen: Specimen }) {
  const s = useSeedT();
  const lineage = useLineage(specimen.gardenId);
  if (!lineage) return null;
  const ancestors = ancestorsOf(specimen.id, lineage.plants, lineage.lots);
  const tree = descendantsOf({ kind: 'plant', id: specimen.id }, lineage.plants, lineage.lots);
  const empty = ancestors.length === 0 && (tree?.children.length ?? 0) === 0;
  return (
    <Card padding="md">
      <h2 className="mb-1 text-body-s font-semibold text-ink">{s.family}</h2>
      <p className="mb-3 text-caption text-muted">{s.familyIntro}</p>
      {empty && <p className="text-body-s text-muted">{s.noFamily}</p>}
      {ancestors.length > 0 && (
        <nav aria-label={s.ancestors} className="mb-3 text-body-s">
          <ol className="flex flex-wrap items-center gap-1">
            {ancestors.map((a) => (
              <li key={`${a.kind}:${a.id}`} className="flex items-center gap-1">
                <RefLink r={a} />
                <ChevronRight className="size-3 text-muted" aria-hidden="true" />
              </li>
            ))}
            <li aria-current="page" className="font-medium text-ink">
              {specimen.displayName}
            </li>
          </ol>
        </nav>
      )}
      {tree && tree.children.length > 0 && (
        <div className="text-body-s">
          <h3 className="text-caption font-semibold text-muted">{s.descendants}</h3>
          <Branch node={tree} />
        </div>
      )}
      <Link
        to="/garden/seeds"
        search={{ from: specimen.id }}
        className={`${buttonClasses('soft', 'sm')} mt-3`}
      >
        <Sprout className="size-4" aria-hidden="true" />
        {s.saveSeeds}
      </Link>
    </Card>
  );
}
