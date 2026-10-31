import { NEARBY_GROUPS, type NearbyGroup } from '@plantpal/schemas';
import {
  Button,
  Card,
  FreshnessPill,
  Notice,
  PageHeader,
  SegmentedControl,
  Skeleton,
  TaxonName,
} from '@plantpal/ui';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { Page } from '../../app/Page';
import { useActiveGarden } from '../../data/queries';
import { gardenCoords, useNearbyRecords, useNearbySpecies, type Coords } from '../../env/hooks';
import { GardenLoading, NoGarden } from '../../features/garden/NoGarden';
import { useNatureT } from '../../features/nature/messages';
import { useFormat } from '../../i18n';

export const Route = createFileRoute('/nature/nearby')({
  component: Nearby,
});

const RADII = ['1', '2', '5'] as const;

function SpeciesGroup({ c, radius, group }: { c: Coords; radius: number; group: NearbyGroup }) {
  const m = useNatureT();
  const fmt = useFormat();
  const q = useNearbySpecies(c, radius, group);
  return (
    <Card
      as="section"
      aria-label={m.nearby.groups[group]}
      className="flex flex-col gap-2"
      data-testid={`nearby-${group}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold text-ink">{m.nearby.groups[group]}</h2>
        {q.data && <FreshnessPill at={q.data.provenance.retrievedAt} stale={q.data.provenance.stale} />}
      </div>
      {q.isPending ? (
        <Skeleton className="h-16" />
      ) : q.isError ? (
        <div className="flex items-center gap-2 text-body-s text-muted">
          {m.nearby.failed}
          <Button size="sm" variant="ghost" onClick={() => void q.refetch()}>
            {m.nearby.retry}
          </Button>
        </div>
      ) : (
        <>
          <p className="text-body-s text-muted">{m.nearby.species(q.data.totalTaxa)}</p>
          <ul className="flex flex-col gap-1 text-body-s">
            {q.data.species.slice(0, 12).map((s) => (
              <li key={s.taxonId} className="flex flex-wrap items-baseline justify-between gap-2">
                <span>
                  {s.commonName && <span className="text-ink">{s.commonName} · </span>}
                  <TaxonName scientificName={s.name} className="text-muted" />
                </span>
                <span className="tabular text-caption text-muted">
                  {m.nearby.observations(s.observations)}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-caption text-muted">
            {q.data.provenance.attribution}
            {q.data.provenance.demo ? ' · Demo data' : ''} · {fmt.number(radius)} km
          </p>
        </>
      )}
    </Card>
  );
}

function Records({ c, radius }: { c: Coords; radius: number }) {
  const m = useNatureT();
  const plants = useNearbyRecords(c, radius, 'plants');
  const animals = useNearbyRecords(c, radius, 'animals');
  const line = (q: typeof plants) =>
    q.data
      ? m.nearby.gbifLine(q.data.records, `${q.data.taxa}${q.data.taxaCapped ? '+' : ''}`)
      : q.isError
        ? m.nearby.failed
        : '…';
  return (
    <Card
      as="section"
      aria-label={m.nearby.gbif}
      className="flex flex-col gap-1 text-body-s"
      data-testid="nearby-gbif"
    >
      <h2 className="font-semibold text-ink">{m.nearby.gbif}</h2>
      <p>
        {m.nearby.kingdoms.plants}: {line(plants)}
      </p>
      <p>
        {m.nearby.kingdoms.animals}: {line(animals)}
      </p>
      <p className="text-caption text-muted">{m.nearby.gbifLicence}</p>
    </Card>
  );
}

function Nearby() {
  const m = useNatureT();
  const { garden } = useActiveGarden();
  const [radius, setRadius] = useState<(typeof RADII)[number]>('2');
  if (garden === undefined)
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
      <PageHeader title={m.nearby.title} description={m.nearby.intro} />
      {!c ? (
        <Notice className="mt-4" tone="warning">
          {m.nearby.needLocation}
        </Notice>
      ) : (
        <>
          <div className="mt-4 flex flex-col gap-1">
            <span className="text-body-s font-medium text-ink">{m.nearby.radius}</span>
            <SegmentedControl<(typeof RADII)[number]>
              label={m.nearby.radius}
              value={radius}
              onValueChange={setRadius}
              options={RADII.map((r) => ({ value: r, label: `${r} km` }))}
            />
            <p className="text-caption text-muted">{m.nearby.privacy}</p>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {NEARBY_GROUPS.map((g) => (
              <SpeciesGroup key={g} c={c} radius={Number(radius)} group={g} />
            ))}
            <Records c={c} radius={Number(radius)} />
          </div>
        </>
      )}
    </Page>
  );
}
