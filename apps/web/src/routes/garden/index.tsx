import { createFileRoute, Link } from '@tanstack/react-router';
import { buttonClasses, Chip, EmptyState, SeedlingIllustration, TextField } from '@plantpal/ui';
import { SPECIMEN_STATUSES, type SpecimenStatus } from '@plantpal/schemas';
import { Plus, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Page } from '../../app/Page';
import { useActiveGarden, useSpecimens, useZones } from '../../data/queries';
import { GardenHeader } from '../../features/garden/GardenHeader';
import { GardenLoading, NoGarden } from '../../features/garden/NoGarden';
import { PlantCard } from '../../features/garden/PlantCard';
import { useT } from '../../i18n';

export const Route = createFileRoute('/garden/')({
  component: GardenIndex,
});

const DEFAULT_FILTER: SpecimenStatus[] = ['active', 'planned', 'dormant'];

function GardenIndex() {
  const t = useT();
  const { garden, gardens } = useActiveGarden();
  const specimens = useSpecimens(garden?.id);
  const zones = useZones(garden?.id);
  const [statuses, setStatuses] = useState<SpecimenStatus[]>(DEFAULT_FILTER);
  const [query, setQuery] = useState('');

  const zoneName = useMemo(() => new Map((zones ?? []).map((z) => [z.id, z.name])), [zones]);
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (specimens ?? []).filter(
      (s) =>
        statuses.includes(s.status) &&
        (!q || s.displayName.toLowerCase().includes(q) || (s.scientificName ?? '').toLowerCase().includes(q)),
    );
  }, [specimens, statuses, query]);
  const present = useMemo(() => new Set((specimens ?? []).map((s) => s.status)), [specimens]);

  if (garden === undefined || gardens === undefined) {
    return (
      <Page>
        <GardenLoading />
      </Page>
    );
  }
  if (garden === null) {
    return (
      <Page>
        <NoGarden />
      </Page>
    );
  }

  const total = (specimens ?? []).filter((s) => !s.holding).length;

  return (
    <Page>
      <GardenHeader
        garden={garden}
        gardens={gardens}
        actions={
          <Link to="/garden/plants/new" className={buttonClasses('primary')}>
            <Plus className="size-4" aria-hidden="true" />
            {t.garden.addPlant}
          </Link>
        }
      />
      {specimens && specimens.length === 0 ? (
        <EmptyState
          className="mt-8"
          illustration={<SeedlingIllustration />}
          title={t.garden.emptyTitle}
          description={t.garden.emptyBody}
          action={
            <Link to="/garden/plants/new" className={buttonClasses('primary', 'lg')}>
              {t.garden.addPlant}
            </Link>
          }
        />
      ) : (
        <div className="mt-6 flex flex-col gap-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <TextField
              label={<span className="sr-only">{t.garden.searchPlants}</span>}
              type="search"
              value={query}
              onValueChange={setQuery}
              placeholder={t.garden.searchPlants}
              suffix={<Search className="size-4" aria-hidden="true" />}
              className="sm:max-w-xs sm:flex-1"
            />
            <p className="text-body-s text-muted" aria-live="polite">
              {t.garden.plantCount(total)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2" role="group" aria-label={t.plant.status}>
            {SPECIMEN_STATUSES.filter((s) => DEFAULT_FILTER.includes(s) || present.has(s)).map((s) => (
              <Chip
                key={s}
                pressed={statuses.includes(s)}
                onPressedChange={(p) => setStatuses((cur) => (p ? [...cur, s] : cur.filter((x) => x !== s)))}
              >
                {t.labels.status[s]}
              </Chip>
            ))}
          </div>
          {visible.length === 0 ? (
            <p className="py-10 text-center text-body text-muted">{t.garden.noMatches}</p>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
              {visible.map((s) => (
                <li key={s.id}>
                  <PlantCard specimen={s} zoneName={s.zoneId ? zoneName.get(s.zoneId) : undefined} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Page>
  );
}
