import type { LayoutBody } from '@plantpal/schemas';
import {
  Button,
  Card,
  EmptyState,
  MagnifierLeafIllustration,
  NumberInput,
  PageHeader,
  Section,
  SelectField,
  TextField,
} from '@plantpal/ui';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { LayoutDashboard } from 'lucide-react';
import { useState } from 'react';
import { Page } from '../../../app/Page';
import { createLayout } from '../../../data/commands';
import { useActiveGarden, useLayouts, useZones } from '../../../data/queries';
import { reportError } from '../../../features/garden/errors';
import { GardenLoading, NoGarden } from '../../../features/garden/NoGarden';
import { useDesignerT } from '../../../features/designer/messages';
import { useFormat, useT } from '../../../i18n';

export const Route = createFileRoute('/plan/design/')({
  component: DesignList,
});

const NONE = '__none';

function DesignList() {
  const t = useT();
  const m = useDesignerT();
  const fmt = useFormat();
  const navigate = useNavigate();
  const { garden } = useActiveGarden();
  const zones = useZones(garden?.id);
  const layouts = useLayouts(garden?.id);
  const [name, setName] = useState('');
  const [zoneId, setZoneId] = useState(NONE);
  const [w, setW] = useState<number | null>(3);
  const [dpt, setDpt] = useState<number | null>(1.5);
  const [up, setUp] = useState('0');
  const [busy, setBusy] = useState(false);

  if (garden === undefined || !zones || !layouts)
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

  const create = async () => {
    const zone = zones.find((z) => z.id === zoneId) ?? null;
    const width = Math.max(0.5, Math.min(100, w ?? 3));
    const depth = Math.max(0.5, Math.min(100, dpt ?? 1.5));
    const body: LayoutBody = {
      name: name.trim() || zone?.name || m.title,
      frame: { frame: 'local-metric', unit: 'm', origin: [0, 0], rotationDeg: Number(up) },
      outline: [
        [0, 0],
        [width, 0],
        [width, depth],
        [0, depth],
      ],
      items: [],
    };
    setBusy(true);
    try {
      const l = await createLayout(garden.id, { zoneId: zone?.id ?? null, body });
      await navigate({ to: '/plan/design/$layoutId', params: { layoutId: l.id } });
    } catch (e) {
      reportError(t, e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page>
      <PageHeader title={m.title} description={m.description} />
      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div>
          {layouts.length === 0 ? (
            <EmptyState
              illustration={<MagnifierLeafIllustration />}
              title={m.noLayouts}
              description={m.noLayoutsBody}
            />
          ) : (
            <ul className="flex flex-col gap-2" data-testid="layouts">
              {layouts.map((l) => (
                <li key={l.id}>
                  <Link
                    to="/plan/design/$layoutId"
                    params={{ layoutId: l.id }}
                    className="flex items-center gap-3 rounded-lg border border-line bg-surface p-4 shadow-1 hover:bg-sunken"
                  >
                    <LayoutDashboard className="size-5 text-accent-ink" aria-hidden="true" />
                    <span className="flex-1">
                      <span className="block font-medium text-ink">{l.name}</span>
                      <span className="block text-caption text-muted">
                        {zones.find((z) => z.id === l.zoneId)?.name ?? m.noSpace} ·{' '}
                        {m.updated(fmt.date(new Date(l.updatedAt)))}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
        <Section title={m.newLayout} headingLevel={2}>
          <Card className="flex flex-col gap-4">
            <TextField label={m.name} value={name} onValueChange={setName} maxLength={120} />
            <SelectField<string>
              label={m.space}
              value={zoneId}
              onValueChange={setZoneId}
              options={[
                { value: NONE, label: m.noSpace },
                ...zones.map((z) => ({ value: z.id, label: z.name })),
              ]}
            />
            <div className="grid grid-cols-2 gap-3">
              <NumberInput label={m.widthM} value={w} onValueChange={setW} min={0.5} max={100} step={0.1} />
              <NumberInput
                label={m.depthM}
                value={dpt}
                onValueChange={setDpt}
                min={0.5}
                max={100}
                step={0.1}
              />
            </div>
            <SelectField<string>
              label={m.up}
              value={up}
              onValueChange={setUp}
              options={m.bearings.map((b, i) => ({ value: String(i * 45), label: b }))}
            />
            <Button onClick={() => void create()} disabled={busy}>
              {m.create}
            </Button>
          </Card>
        </Section>
      </div>
    </Page>
  );
}
