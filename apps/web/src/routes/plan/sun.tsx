import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { lightClass } from '@plantpal/domain';
import type { ZoneSun } from '@plantpal/schemas';
import { buttonClasses, EmptyState, PageHeader, SelectField, SunPathIcon } from '@plantpal/ui';
import { useState } from 'react';
import { toast } from 'sonner';
import { Page } from '../../app/Page';
import { updateZone } from '../../data/commands';
import { useActiveGarden, useZones } from '../../data/queries';
import { GardenLoading, NoGarden } from '../../features/garden/NoGarden';
import { reportError } from '../../features/garden/errors';
import { usePlanT } from '../../features/plan/messages';
import { SunFinder } from '../../features/sun/SunFinder';
import { useT } from '../../i18n';

export const Route = createFileRoute('/plan/sun')({
  validateSearch: (s: Record<string, unknown>): { zone?: string } =>
    typeof s.zone === 'string' && s.zone.length <= 40 ? { zone: s.zone } : {},
  component: SunPage,
});

function SunPage() {
  const t = useT();
  const m = usePlanT();
  const navigate = useNavigate();
  const { zone: zoneParam } = Route.useSearch();
  const { garden } = useActiveGarden();
  const zones = useZones(garden?.id);
  const [saving, setSaving] = useState(false);

  if (garden === undefined || (garden && zones === undefined))
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
  const zone = zones?.find((z) => z.id === zoneParam) ?? zones?.[0] ?? null;
  const place = garden.place;
  const base =
    place && place.lat !== null && place.lon !== null
      ? { lat: place.lat, lon: place.lon, timeZone: garden.timezone }
      : null;
  const hemisphere = garden.hemisphere ?? (place?.lat != null && place.lat < 0 ? 'south' : 'north');

  const save = async (sun: ZoneSun) => {
    if (!zone) return;
    setSaving(true);
    try {
      const mean = sun.monthlyHours.reduce((a, b) => a + b, 0) / 12;
      await updateZone(zone.id, zone.version, { sun, light: lightClass(mean) });
      toast.success(m.sun.saved);
    } catch (e) {
      reportError(t, e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Page width="wide">
      <PageHeader title={m.sun.title} description={m.sun.description} />
      {!zone ? (
        <EmptyState
          className="mt-8"
          illustration={<SunPathIcon className="size-16 text-pollen-700" />}
          title={m.sun.noZones}
          action={
            <Link to="/garden/spaces" className={buttonClasses('primary')}>
              {t.space.add}
            </Link>
          }
        />
      ) : (
        <div className="mt-6 flex flex-col gap-6">
          {zones && zones.length > 1 && (
            <SelectField
              label={m.sun.zone}
              className="max-w-xs"
              value={zone.id}
              onValueChange={(id) => void navigate({ to: '/plan/sun', search: { zone: id }, replace: true })}
              options={zones.map((z) => ({ value: z.id, label: z.name }))}
            />
          )}
          <SunFinder
            key={zone.id}
            base={base}
            hemisphere={hemisphere}
            initial={zone.sun}
            onSave={(s) => void save(s)}
            saving={saving}
          />
        </div>
      )}
    </Page>
  );
}
