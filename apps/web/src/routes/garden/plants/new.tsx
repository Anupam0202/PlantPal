import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { Card, PageHeader } from '@plantpal/ui';
import { toast } from 'sonner';
import { Page } from '../../../app/Page';
import { createSpecimen, deleteMedia, linkMedia, updateSpecimen } from '../../../data/commands';
import { useActiveGarden, useContainers, useSeedLot, useSpecimens, useZones } from '../../../data/queries';
import { requestPersistence } from '../../../data/storage';
import { reportError } from '../../../features/garden/errors';
import { GardenLoading, NoGarden } from '../../../features/garden/NoGarden';
import { PlantForm, specimenInputOf } from '../../../features/garden/PlantForm';
import { useT } from '../../../i18n';

export const Route = createFileRoute('/garden/plants/new')({
  validateSearch: (search: Record<string, unknown>): { zoneId?: string; seedLotId?: string } => ({
    ...(typeof search.zoneId === 'string' ? { zoneId: search.zoneId } : {}),
    ...(typeof search.seedLotId === 'string' ? { seedLotId: search.seedLotId } : {}),
  }),
  component: NewPlant,
});

function NewPlant() {
  const t = useT();
  const navigate = useNavigate();
  const { zoneId, seedLotId } = Route.useSearch();
  const lot = useSeedLot(seedLotId);
  const { garden } = useActiveGarden();
  const zones = useZones(garden?.id);
  const containers = useContainers(garden?.id);
  const specimens = useSpecimens(garden?.id);

  if (garden === undefined || !zones || !containers || !specimens || (seedLotId && lot === undefined))
    return (
      <Page width="narrow">
        <GardenLoading />
      </Page>
    );
  if (garden === null)
    return (
      <Page width="narrow">
        <NoGarden />
      </Page>
    );

  return (
    <Page width="narrow">
      <PageHeader title={t.plant.add} eyebrow={garden.name} />
      <Card className="mt-6" padding="lg">
        <PlantForm
          gardenId={garden.id}
          timeZone={garden.timezone}
          zones={zones}
          containers={containers}
          specimens={specimens}
          initialZoneId={zoneId}
          seedLot={lot && lot.deletedAt === null ? lot : undefined}
          countryCode={garden.region?.countryCode ?? null}
          submitLabel={t.plant.add}
          onCancel={() => void navigate({ to: '/garden' })}
          onSubmit={async (value) => {
            const { mediaIds } = value;
            try {
              const firstPlant = specimens.filter((s) => !s.holding).length === 0;
              const s = await createSpecimen(garden.id, specimenInputOf(value));
              if (mediaIds[0]) {
                await linkMedia(mediaIds, { entity: 'specimen', id: s.id });
                await updateSpecimen(s.id, s.version, { coverMediaId: mediaIds[0] });
              }
              toast.success(t.plant.created);
              if (firstPlant) {
                toast(t.storage.persistTitle, {
                  description: t.storage.persistBody,
                  duration: 12000,
                  action: { label: t.storage.persistAction, onClick: () => void requestPersistence() },
                });
              }
              await navigate({ to: '/garden/plants/$specimenId', params: { specimenId: s.id } });
            } catch (e) {
              for (const id of mediaIds) void deleteMedia(id);
              reportError(t, e);
            }
          }}
        />
      </Card>
    </Page>
  );
}
