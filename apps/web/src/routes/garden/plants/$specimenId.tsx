import { createFileRoute, Link } from '@tanstack/react-router';
import {
  Badge,
  Button,
  buttonClasses,
  Card,
  EmptyState,
  ErrorState,
  PageHeader,
  Section,
  Sheet,
  TaxonName,
} from '@plantpal/ui';
import { Archive, ArchiveRestore, ChevronLeft, NotebookPen, Pencil } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Page } from '../../../app/Page';
import { setSpecimenStatus, updateSpecimen } from '../../../data/commands';
import {
  useContainers,
  useGarden,
  useSpecimen,
  useSpecimens,
  useTimeline,
  useZones,
  useMedia,
} from '../../../data/queries';
import { CarePanel } from '../../../features/care/CarePanel';
import { PlantHealth } from '../../../features/health/PlantHealth';
import { reportError } from '../../../features/garden/errors';
import { FamilyTree } from '../../../features/garden/FamilyTree';
import { useLocalDayLabel } from '../../../features/garden/format';
import { MediaThumb } from '../../../features/garden/Media';
import { GardenLoading } from '../../../features/garden/NoGarden';
import { STATUS_TONE } from '../../../features/garden/PlantCard';
import { PlantForm, specimenInputOf } from '../../../features/garden/PlantForm';
import { Timeline } from '../../../features/garden/Timeline';
import { useT } from '../../../i18n';
import { useCapture } from '../../../state/capture';

export const Route = createFileRoute('/garden/plants/$specimenId')({
  component: PlantPage,
});

function PlantPage() {
  const t = useT();
  const { specimenId } = Route.useParams();
  const specimen = useSpecimen(specimenId);
  const garden = useGarden(specimen?.gardenId);
  const zones = useZones(specimen?.gardenId);
  const containers = useContainers(specimen?.gardenId);
  const specimens = useSpecimens(specimen?.gardenId);
  const items = useTimeline({ specimenId });
  const cover = useMedia(specimen?.coverMediaId ? [specimen.coverMediaId] : []);
  const openCapture = useCapture((s) => s.openCapture);
  const [editing, setEditing] = useState(false);
  const dayLabel = useLocalDayLabel(garden?.timezone);

  if (specimen === undefined || (specimen && garden === undefined))
    return (
      <Page>
        <GardenLoading />
      </Page>
    );
  if (specimen === null || !garden)
    return (
      <Page>
        <ErrorState
          title={t.plant.notFound}
          message=""
          secondaryAction={
            <Link to="/garden" className={buttonClasses('secondary')}>
              {t.nav.garden}
            </Link>
          }
        />
      </Page>
    );

  const zone = zones?.find((z) => z.id === specimen.zoneId);
  const container = containers?.find((c) => c.id === specimen.containerId);
  const parent = specimens?.find((s) => s.id === specimen.parentSpecimenId);
  const archived = specimen.status === 'archived';
  const name = specimen.holding ? t.garden.unlinked : specimen.displayName;

  const toggleArchive = async () => {
    try {
      await setSpecimenStatus(specimen.id, specimen.version, archived ? 'active' : 'archived', null);
      toast.success(archived ? t.plant.restored : t.plant.archived);
    } catch (e) {
      reportError(t, e);
    }
  };

  const facts: Array<[string, string]> = [
    [t.plant.space, zone?.name ?? t.garden.noZone],
    ...(container ? ([[t.plant.container, container.name]] as Array<[string, string]>) : []),
    ...(specimen.plantedOn
      ? ([[t.plant.plantedOn, dayLabel(specimen.plantedOn)]] as Array<[string, string]>)
      : []),
    [t.plant.origin, t.labels.origin[specimen.origin]],
    [t.plant.identity, t.labels.identity[specimen.identityLevel]],
    ...(parent ? ([[t.plant.parent, parent.displayName]] as Array<[string, string]>) : []),
  ];

  return (
    <Page>
      <Link
        to="/garden"
        className="mb-3 inline-flex items-center gap-1 text-body-s text-muted hover:text-ink"
      >
        <ChevronLeft className="size-4" aria-hidden="true" />
        {t.nav.garden}
      </Link>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:gap-10">
        <div className="flex flex-col gap-4">
          {cover && cover[0] ? (
            <MediaThumb media={cover[0]} size="lg" className="rounded-lg shadow-1" />
          ) : null}
          <PageHeader
            eyebrow={garden.name}
            title={name}
            description={
              specimen.scientificName ? (
                <TaxonName
                  scientificName={specimen.scientificName}
                  cultivar={specimen.cultivar ?? undefined}
                />
              ) : undefined
            }
          />
          <div className="flex flex-wrap gap-2">
            <Badge tone={STATUS_TONE[specimen.status]}>{t.labels.status[specimen.status]}</Badge>
            {specimen.source?.kind === 'legacy-v3' && <Badge tone="dusk">{t.plant.fromLegacy}</Badge>}
          </div>
          {specimen.holding && <p className="text-body-s text-muted">{t.garden.holdingHint}</p>}
          <div className="flex flex-wrap gap-2">
            {!specimen.holding && (
              <Button onClick={() => openCapture({ specimenIds: [specimen.id] })}>
                <NotebookPen className="size-4" aria-hidden="true" />
                {t.plant.logCare}
              </Button>
            )}
            <Button variant="secondary" onClick={() => setEditing(true)}>
              <Pencil className="size-4" aria-hidden="true" />
              {t.common.edit}
            </Button>
            {!specimen.holding && (
              <Button variant="ghost" onClick={() => void toggleArchive()}>
                {archived ? (
                  <ArchiveRestore className="size-4" aria-hidden="true" />
                ) : (
                  <Archive className="size-4" aria-hidden="true" />
                )}
                {archived ? t.plant.restore : t.plant.archive}
              </Button>
            )}
          </div>
          <Card padding="md">
            <h2 className="mb-3 text-body-s font-semibold text-ink">{t.plant.details}</h2>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-body-s">
              {facts.map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-muted">{k}</dt>
                  <dd className="text-ink">{v}</dd>
                </div>
              ))}
            </dl>
            {specimen.statusReason && (
              <p className="mt-3 text-body-s text-muted">
                {t.plant.statusReason}: {specimen.statusReason}
              </p>
            )}
            {specimen.notes && (
              <p className="mt-3 text-body-s whitespace-pre-line text-ink">{specimen.notes}</p>
            )}
          </Card>
          <CarePanel specimen={specimen} garden={garden} />
          <FamilyTree specimen={specimen} />
          <PlantHealth specimen={specimen} />
        </div>
        <Section title={t.plant.timeline} headingLevel={2}>
          {items && items.length === 0 ? (
            <EmptyState title={t.journal.emptyTitle} description={t.plant.noHistory} />
          ) : (
            <Timeline items={items ?? []} timeZone={garden.timezone} showPlant={false} />
          )}
        </Section>
      </div>

      <Sheet open={editing} onOpenChange={setEditing} title={t.plant.edit} side="right">
        {editing && zones && containers && specimens && (
          <PlantForm
            gardenId={garden.id}
            timeZone={garden.timezone}
            zones={zones}
            containers={containers}
            specimens={specimens}
            initial={specimen}
            submitLabel={t.common.save}
            onCancel={() => setEditing(false)}
            onSubmit={async (value) => {
              try {
                await updateSpecimen(specimen.id, specimen.version, specimenInputOf(value));
                toast.success(t.garden.saved);
                setEditing(false);
              } catch (e) {
                reportError(t, e);
              }
            }}
          />
        )}
      </Sheet>
    </Page>
  );
}
