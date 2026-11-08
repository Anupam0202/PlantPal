import { trait } from '@plantpal/domain';
import type { Specimen } from '@plantpal/schemas';
import { Button, CheckboxField, EmptyState, Notice, Section, SegmentedControl } from '@plantpal/ui';
import { createFileRoute } from '@tanstack/react-router';
import { Printer, Tag } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Page } from '../../app/Page';
import { useActiveGarden, useSpecimens } from '../../data/queries';
import { reportError } from '../../features/garden/errors';
import { GardenHeader } from '../../features/garden/GardenHeader';
import { GardenLoading, NoGarden } from '../../features/garden/NoGarden';
import { taxonById } from '../../features/plan/engine';
import { useLabelT, type LabelMessages } from '../../features/labels/messages';
import type { LabelSize } from '../../features/labels/render';
import { useFormat, useT } from '../../i18n';
import { downloadBlob } from '../../lib/download';

export const Route = createFileRoute('/garden/labels')({
  component: LabelsPage,
});

/** Three care basics from cited catalogue traits; nothing when the plant is not in the catalogue. */
function basicsOf(s: Specimen, m: LabelMessages): string[] {
  const t = s.catalogTaxonId ? taxonById(s.catalogTaxonId) : null;
  if (!t) return [];
  const sun = trait(t, 'sunHours');
  const water = trait(t, 'waterNeed');
  const height = trait(t, 'heightCm');
  return [
    sun ? m.sun(sun.min === sun.max ? String(sun.min) : `${sun.min}–${sun.max}`) : null,
    water ? m.water(m.levels[water]) : null,
    height ? m.height(height.max) : null,
  ].filter((x): x is string => Boolean(x));
}

function LabelsPage() {
  const t = useT();
  const m = useLabelT();
  const fmt = useFormat();
  const { garden, gardens } = useActiveGarden();
  const specimens = useSpecimens(garden?.id);
  const [size, setSize] = useState<LabelSize>('front');
  const [skip, setSkip] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  if (garden === undefined || gardens === undefined || !specimens)
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
  const plants = specimens.filter(
    (p) => p.deletedAt === null && (p.status === 'active' || p.status === 'planned'),
  );
  const chosen = plants.filter((p) => !skip.has(p.id));

  const make = async () => {
    setBusy(true);
    try {
      const { labelsPdf } = await import('../../features/labels/render');
      const blob = await labelsPdf(
        chosen.map((p) => ({
          name: p.displayName,
          scientificName: p.scientificName,
          plantedOn: p.plantedOn
            ? m.planted(fmt.date(new Date(`${p.plantedOn}T12:00:00Z`), { dateStyle: 'medium' }))
            : null,
          basics: basicsOf(p, m),
          url: `${location.origin}/garden/plants/${p.id}`,
        })),
        size,
      );
      downloadBlob(blob, `plantpal-labels-${size}.pdf`);
      toast.success(m.ready(chosen.length));
    } catch (e) {
      reportError(t, e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page>
      <GardenHeader garden={garden} gardens={gardens} />
      <div className="mt-6 flex flex-col gap-6">
        <Section title={m.title} headingLevel={2}>
          <p className="text-body-s text-muted">{m.intro}</p>
          {plants.length === 0 ? (
            <EmptyState
              illustration={<Tag className="size-14" strokeWidth={1.25} aria-hidden="true" />}
              title={m.empty}
              description={m.emptyBody}
            />
          ) : (
            <>
              <SegmentedControl<LabelSize>
                label={m.size}
                value={size}
                onValueChange={setSize}
                options={[
                  { value: 'front', label: m.sizes.front },
                  { value: 'stake', label: m.sizes.stake },
                ]}
              />
              <p className="text-caption text-muted">{m.sizeNotes[size]}</p>
              <fieldset className="flex flex-col">
                <legend className="mb-1 text-body-s font-medium text-ink">{m.plants}</legend>
                {plants.map((p) => (
                  <CheckboxField
                    key={p.id}
                    label={p.displayName}
                    checked={!skip.has(p.id)}
                    onCheckedChange={(on) =>
                      setSkip((s) => {
                        const next = new Set(s);
                        if (on) next.delete(p.id);
                        else next.add(p.id);
                        return next;
                      })
                    }
                  />
                ))}
              </fieldset>
              <Notice>{m.qrNote}</Notice>
              <div>
                <Button
                  loading={busy}
                  disabled={chosen.length === 0}
                  icon={<Printer className="size-4" aria-hidden="true" />}
                  onClick={() => void make()}
                >
                  {m.make}
                </Button>
              </div>
            </>
          )}
        </Section>
      </div>
    </Page>
  );
}
