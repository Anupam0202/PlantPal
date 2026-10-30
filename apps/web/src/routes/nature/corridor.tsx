import type { GreenSpace } from '@plantpal/schemas';
import { Badge, Button, Card, FreshnessPill, Notice, PageHeader, Skeleton } from '@plantpal/ui';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { Page } from '../../app/Page';
import { useActiveGarden } from '../../data/queries';
import { gardenCoords } from '../../env/hooks';
import { GardenLoading, NoGarden } from '../../features/garden/NoGarden';
import { coarseCell } from '../../features/community/hooks';
import { LazyMap } from '../../features/maps/LazyMap';
import { useMapT } from '../../features/maps/messages';
import { useFormat } from '../../i18n';
import { accountsUnavailable, call } from '../../sync/api';

const OSM_COPYRIGHT = 'https://www.openstreetmap.org/copyright';

export const Route = createFileRoute('/nature/corridor')({
  component: Corridor,
});

function Corridor() {
  const m = useMapT();
  const { garden, gardens } = useActiveGarden();
  if (garden === undefined || gardens === undefined)
    return (
      <Page>
        <GardenLoading />
      </Page>
    );
  if (garden === null)
    return (
      <Page>
        <NoGarden />
      </Page>
    );
  const c = gardenCoords(garden);
  return (
    <Page>
      <PageHeader title={m.corridor.title} description={m.corridor.intro} />
      <div className="mt-6 flex flex-col gap-4">
        {c ? (
          <CorridorBody gardenKey={`${garden.id}:${garden.version}`} lat={c.lat} lon={c.lon} />
        ) : (
          <Notice>
            {m.corridor.needLocation}{' '}
            <Link to="/garden/edit" className="font-medium text-accent-ink underline">
              {m.corridor.addLocation}
            </Link>
          </Notice>
        )}
      </div>
    </Page>
  );
}

function CorridorBody({ gardenKey, lat, lon }: { gardenKey: string; lat: number; lon: number }) {
  const m = useMapT();
  const fmt = useFormat();
  // The coarse tile is computed here; only its id goes to the server (which asks OpenStreetMap).
  const tile = useQuery({
    // Keyed by garden, never by coordinates (precise positions stay out of caches).
    queryKey: ['coarse-cell', gardenKey],
    queryFn: () => coarseCell(lat, lon),
    staleTime: Infinity,
  });
  const green = useQuery({
    queryKey: ['green-space', tile.data],
    enabled: Boolean(tile.data),
    retry: false,
    staleTime: 24 * 3_600_000,
    queryFn: () => call<GreenSpace>('GET', `/api/v1/env/green-space?cell=${encodeURIComponent(tile.data!)}`),
  });
  const view = useQuery({
    queryKey: ['green-view', gardenKey, green.data?.provenance.retrievedAt],
    enabled: Boolean(green.data),
    staleTime: Infinity,
    queryFn: async () => {
      const geo = await import('../../features/maps/geo');
      const g = green.data!;
      const here: [number, number] = [lon, lat];
      const shares = await geo.greenShares(g.tile, g.areas);
      return {
        here,
        nearest: geo.nearestAreas(here, g.areas),
        share: Math.round((shares.reduce((t, s) => t + s.value, 0) / shares.length) * 100),
        hexes: await geo.hexFeatures(shares),
      };
    },
  });

  if (green.isError)
    return accountsUnavailable(green.error) ? (
      <Notice>{m.corridor.needServer}</Notice>
    ) : (
      <Notice
        tone="warning"
        action={
          <Button size="sm" variant="ghost" onClick={() => void green.refetch()}>
            {m.corridor.retry}
          </Button>
        }
      >
        {m.corridor.failed}
      </Notice>
    );
  if (!view.data || !green.data)
    return (
      <div className="flex flex-col gap-3" role="status" aria-label={m.corridor.loading}>
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-80 w-full" />
      </div>
    );

  const g = green.data;
  const { nearest, share, hexes, here } = view.data;
  const first = nearest[0];
  const distance = (metres: number) =>
    metres < 1000
      ? `${fmt.number(Math.max(10, Math.round(metres / 10) * 10))} m`
      : `${fmt.number(metres / 1000, 1)} km`;
  const headline =
    !first || first.metres > 1500
      ? m.corridor.none
      : first.metres === 0
        ? m.corridor.inside(m.corridor.kinds[first.area.kind])
        : m.corridor.steppingStone(distance(first.metres), m.corridor.kinds[first.area.kind]);

  return (
    <>
      <Card className="flex flex-col gap-2">
        <p className="text-body font-medium text-ink" data-testid="corridor-headline">
          {headline}
        </p>
        <p className="text-body-s text-muted">{m.corridor.share(share)}</p>
        <div className="flex flex-wrap items-center gap-2">
          <FreshnessPill at={g.provenance.retrievedAt} stale={g.provenance.stale} />
          {g.provenance.demo && <Badge tone="warning">Demo data</Badge>}
        </div>
      </Card>
      <LazyMap
        key={`${g.tile}:${g.provenance.retrievedAt}`}
        label={m.corridor.mapLabel}
        center={here}
        zoom={13.5}
        hexes={hexes}
        maxValue={1}
        point={here}
        basemapMissing={m.basemapMissing}
        unavailable={m.unavailable}
      />
      <p className="text-caption text-muted">{m.corridor.legend}</p>
      <section aria-labelledby="nearest-green" className="flex flex-col gap-2">
        <h2 id="nearest-green" className="text-h3 text-ink">
          {m.corridor.nearest}
        </h2>
        <ul className="flex flex-col gap-1 text-body-s">
          {nearest
            .filter((n) => n.metres <= 1500)
            .map((n) => (
              <li key={n.area.id} className="flex flex-wrap justify-between gap-2 border-b border-line py-1">
                <span className="text-ink">
                  {n.area.name ?? m.corridor.unnamed} · {m.corridor.kinds[n.area.kind]}
                </span>
                <span className="text-muted">
                  {n.metres === 0 ? m.corridor.here : m.corridor.away(distance(n.metres))}
                </span>
              </li>
            ))}
        </ul>
        {g.truncated && <p className="text-caption text-muted">{m.corridor.truncated}</p>}
      </section>
      <div className="flex flex-col gap-1 text-caption text-muted">
        <p>{m.corridor.honesty}</p>
        <p>{m.corridor.privacy}</p>
        <p>
          {g.provenance.attribution} ·{' '}
          <a href={OSM_COPYRIGHT} className="underline" target="_blank" rel="noreferrer">
            {g.provenance.licence}
          </a>
        </p>
      </div>
    </>
  );
}
