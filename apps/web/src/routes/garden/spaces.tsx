import { createFileRoute, Link } from '@tanstack/react-router';
import {
  Badge,
  Button,
  buttonClasses,
  Card,
  Dialog,
  EmptyState,
  IconButton,
  SeedlingIllustration,
} from '@plantpal/ui';
import type { Container, Zone } from '@plantpal/schemas';
import { degreesToCompass } from '@plantpal/domain';
import { Pencil, Plus, Trash2, Umbrella } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Page } from '../../app/Page';
import {
  createContainer,
  createZone,
  deleteContainer,
  deleteZone,
  updateContainer,
  updateZone,
} from '../../data/commands';
import { useActiveGarden, useContainers, useSpecimens, useZones } from '../../data/queries';
import { reportError } from '../../features/garden/errors';
import { useUnits } from '../../features/garden/format';
import { GardenHeader } from '../../features/garden/GardenHeader';
import { GardenLoading, NoGarden } from '../../features/garden/NoGarden';
import { ContainerDialog, ZoneDialog } from '../../features/garden/SpaceForms';
import { useT } from '../../i18n';

export const Route = createFileRoute('/garden/spaces')({
  component: SpacesPage,
});

type Editing =
  | { kind: 'zone'; zone?: Zone }
  | { kind: 'container'; zoneId: string; container?: Container }
  | { kind: 'delete-zone'; zone: Zone }
  | { kind: 'delete-container'; container: Container }
  | null;

function SpacesPage() {
  const t = useT();
  const u = useUnits();
  const { garden, gardens } = useActiveGarden();
  const zones = useZones(garden?.id);
  const containers = useContainers(garden?.id);
  const specimens = useSpecimens(garden?.id);
  const [editing, setEditing] = useState<Editing>(null);
  const close = () => setEditing(null);

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

  const plantsIn = (zoneId: string) =>
    (specimens ?? []).filter((s) => s.zoneId === zoneId && !s.holding).length;

  return (
    <Page>
      <GardenHeader
        garden={garden}
        gardens={gardens}
        actions={
          <Button onClick={() => setEditing({ kind: 'zone' })}>
            <Plus className="size-4" aria-hidden="true" />
            {t.space.add}
          </Button>
        }
      />
      <p className="mt-4 max-w-prose text-body-s text-muted">{t.space.description}</p>

      {zones && zones.length === 0 ? (
        <EmptyState
          className="mt-8"
          illustration={<SeedlingIllustration />}
          title={t.space.emptyTitle}
          description={t.space.emptyBody}
          action={
            <Button size="lg" onClick={() => setEditing({ kind: 'zone' })}>
              {t.space.add}
            </Button>
          }
        />
      ) : (
        <ul className="mt-6 grid gap-4 lg:grid-cols-2">
          {(zones ?? []).map((zone) => {
            const zc = (containers ?? []).filter((c) => c.zoneId === zone.id);
            return (
              <Card as="li" key={zone.id} padding="md" className="flex flex-col gap-3">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <h2 className="font-display text-h3 text-ink">{zone.name}</h2>
                    <p className="text-body-s text-muted">{t.labels.zoneKind[zone.kind]}</p>
                  </div>
                  <IconButton
                    label={`${t.space.edit}: ${zone.name}`}
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setEditing({ kind: 'zone', zone })}
                  >
                    <Pencil className="size-4" aria-hidden="true" />
                  </IconButton>
                  <IconButton
                    label={`${t.common.delete}: ${zone.name}`}
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setEditing({ kind: 'delete-zone', zone })}
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                  </IconButton>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {zone.light && <Badge tone="pollen">{t.labels.light[zone.light]}</Badge>}
                  {zone.orientationDeg !== null && (
                    <Badge>{`${t.space.facing} ${degreesToCompass(zone.orientationDeg)}`}</Badge>
                  )}
                  {zone.covered === true && (
                    <Badge icon={<Umbrella className="size-3.5" aria-hidden="true" />}>
                      {t.space.coveredBadge}
                    </Badge>
                  )}
                  {zone.wind && <Badge>{t.labels.wind[zone.wind]}</Badge>}
                  {zone.drainage && <Badge>{t.labels.drainage[zone.drainage]}</Badge>}
                  {zone.areaM2 !== null && <Badge>{u.area(zone.areaM2)}</Badge>}
                  <Badge tone="accent">{t.space.plantsHere(plantsIn(zone.id))}</Badge>
                </div>
                {zone.notes && <p className="text-body-s text-ink">{zone.notes}</p>}
                <div className="border-t border-line pt-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <h3 className="text-body-s font-semibold text-ink">{t.space.containers}</h3>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditing({ kind: 'container', zoneId: zone.id })}
                    >
                      <Plus className="size-4" aria-hidden="true" />
                      {t.space.addContainer}
                    </Button>
                  </div>
                  {zc.length === 0 ? (
                    <p className="text-body-s text-muted">{t.space.noContainers}</p>
                  ) : (
                    <ul className="flex flex-col divide-y divide-line">
                      {zc.map((c) => (
                        <li key={c.id} className="flex items-center gap-2 py-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-body-s font-medium text-ink">{c.name}</p>
                            <p className="text-caption text-muted">
                              {[
                                t.labels.shape[c.shape],
                                c.volumeL !== null ? u.volumeL(c.volumeL) : null,
                                c.material ? t.labels.material[c.material] : null,
                              ]
                                .filter(Boolean)
                                .join(' · ')}
                            </p>
                          </div>
                          <IconButton
                            label={`${t.space.editContainer}: ${c.name}`}
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => setEditing({ kind: 'container', zoneId: zone.id, container: c })}
                          >
                            <Pencil className="size-4" aria-hidden="true" />
                          </IconButton>
                          <IconButton
                            label={`${t.common.delete}: ${c.name}`}
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => setEditing({ kind: 'delete-container', container: c })}
                          >
                            <Trash2 className="size-4" aria-hidden="true" />
                          </IconButton>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <Link
                  to="/garden/plants/new"
                  search={{ zoneId: zone.id }}
                  className={buttonClasses('soft', 'sm', 'self-start')}
                >
                  <Plus className="size-4" aria-hidden="true" />
                  {t.garden.addPlant}
                </Link>
              </Card>
            );
          })}
        </ul>
      )}

      {editing?.kind === 'zone' && (
        <ZoneDialog
          open
          onOpenChange={(o) => !o && close()}
          initial={editing.zone}
          onSubmit={async (input) => {
            try {
              if (editing.zone) await updateZone(editing.zone.id, editing.zone.version, input);
              else await createZone(garden.id, input);
              toast.success(t.garden.saved);
            } catch (e) {
              reportError(t, e);
              throw e;
            }
          }}
        />
      )}
      {editing?.kind === 'container' && (
        <ContainerDialog
          open
          onOpenChange={(o) => !o && close()}
          initial={editing.container}
          onSubmit={async (input) => {
            try {
              if (editing.container)
                await updateContainer(editing.container.id, editing.container.version, input);
              else await createContainer(editing.zoneId, input);
              toast.success(t.garden.saved);
            } catch (e) {
              reportError(t, e);
              throw e;
            }
          }}
        />
      )}
      {(editing?.kind === 'delete-zone' || editing?.kind === 'delete-container') && (
        <Dialog
          open
          onOpenChange={(o) => !o && close()}
          size="sm"
          title={editing.kind === 'delete-zone' ? t.space.deleteTitle : t.space.deleteContainerTitle}
          description={editing.kind === 'delete-zone' ? t.space.deleteBody : t.space.deleteContainerBody}
          footer={
            <>
              <Button variant="ghost" onClick={close}>
                {t.common.cancel}
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  const run =
                    editing.kind === 'delete-zone'
                      ? deleteZone(editing.zone.id, editing.zone.version)
                      : deleteContainer(editing.container.id, editing.container.version);
                  void run.then(close).catch((e: unknown) => reportError(t, e));
                }}
              >
                {t.common.delete}
              </Button>
            </>
          }
        />
      )}
    </Page>
  );
}
