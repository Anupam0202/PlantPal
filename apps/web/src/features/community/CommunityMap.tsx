import { EmptyState, Spinner } from '@plantpal/ui';
import { useQuery } from '@tanstack/react-query';
import { Map as MapIcon } from 'lucide-react';
import { community } from '../../community/api';
import { useFormat } from '../../i18n';
import { LazyMap } from '../maps/LazyMap';
import { useMapT } from '../maps/messages';

/**
 * Active growers per H3 resolution-7 cell in my area. The server hides cells with fewer than five
 * contributors (k-anonymity, §19); this view adds nothing about any one person and never shows
 * anyone's own location.
 */
export function CommunityMap() {
  const m = useMapT();
  const fmt = useFormat();
  const q = useQuery({
    queryKey: ['community-content', 'map'],
    queryFn: async () => {
      const data = await community.map();
      if (data.cells.length === 0) return { ...data, view: null };
      const geo = await import('../maps/geo');
      const centre = await geo.cellCenter(data.area);
      const rows = await Promise.all(
        data.cells.map(async (c) => {
          const at = await geo.cellCenter(c.cell);
          const metres = geo.metresBetween(centre, at);
          const bearing = (Math.atan2(at[0] - centre[0], at[1] - centre[1]) * 180) / Math.PI;
          return { ...c, metres, octant: Math.round(((bearing + 360) % 360) / 45) % 8 };
        }),
      );
      const hexes = await geo.hexFeatures(data.cells.map((c) => ({ cell: c.cell, value: c.contributors })));
      return { ...data, view: { centre, rows: rows.sort((a, b) => b.contributors - a.contributors), hexes } };
    },
  });
  if (q.isPending) return <Spinner />;
  const view = q.data?.view;
  if (!view)
    return (
      <EmptyState
        illustration={<MapIcon className="size-14" strokeWidth={1.25} aria-hidden="true" />}
        title={m.community.empty}
        description={m.community.emptyBody}
      />
    );
  const most = Math.max(...view.rows.map((r) => r.contributors));
  return (
    <div className="flex flex-col gap-3">
      <p className="text-body-s text-muted">{m.community.intro}</p>
      <LazyMap
        label={m.community.mapLabel}
        center={view.centre}
        zoom={10}
        hexes={view.hexes}
        maxValue={most}
        basemapMissing={m.basemapMissing}
        unavailable={m.unavailable}
      />
      <ul className="flex flex-col gap-1 text-body-s" data-testid="community-cells">
        {view.rows.map((r) => (
          <li key={r.cell} className="flex flex-wrap justify-between gap-2 border-b border-line py-1">
            <span className="text-ink">
              {r.metres < 1000
                ? m.community.centre
                : m.community.where(
                    `${fmt.number(r.metres / 1000, 0)} km`,
                    m.community.directions[r.octant]!,
                  )}
            </span>
            <span className="text-muted">{m.community.growers(r.contributors)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
