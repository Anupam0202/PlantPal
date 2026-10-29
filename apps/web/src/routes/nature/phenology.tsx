import { CHECK_STATES, PHENOPHASES, type CheckState, type Phenophase } from '@plantpal/schemas';
import { Button, Card, EmptyState, PageHeader, SegmentedControl } from '@plantpal/ui';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { toast } from 'sonner';
import { Page } from '../../app/Page';
import { clockNow } from '../../lib/clock';
import { logVisit } from '../../data/commands';
import { useActiveGarden, useSpecimens } from '../../data/queries';
import { reportError } from '../../features/garden/errors';
import { GardenLoading, NoGarden } from '../../features/garden/NoGarden';
import { useNatureT } from '../../features/nature/messages';
import { useT } from '../../i18n';

export const Route = createFileRoute('/nature/phenology')({
  component: Phenology,
});

type Answers = Record<string, Partial<Record<Phenophase, CheckState>>>;

/**
 * Four-state phenology checks (S2): every phenophase of a checked plant is stored, including
 * `NOT_CHECKED`, so "not looked at" is never read as "absent".
 */
function Phenology() {
  const t = useT();
  const m = useNatureT();
  const navigate = useNavigate();
  const { garden } = useActiveGarden();
  const specimens = useSpecimens(garden?.id);
  const [answers, setAnswers] = useState<Answers>({});
  const [busy, setBusy] = useState(false);

  if (garden === undefined || specimens === undefined)
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
    (s) => s.deletedAt === null && (s.status === 'active' || s.status === 'dormant'),
  );
  const checked = plants.filter((p) =>
    Object.values(answers[p.id] ?? {}).some((v) => v && v !== 'NOT_CHECKED'),
  );

  const save = async () => {
    if (checked.length === 0) {
      toast.error(m.phenology.nothing);
      return;
    }
    setBusy(true);
    try {
      const at = clockNow();
      for (const p of checked)
        await logVisit({
          gardenId: garden.id,
          protocol: 'phenology',
          startedAt: at,
          plannedS: 0,
          durationS: 0,
          specimenId: p.id,
          zoneId: p.zoneId,
          targetTaxonId: p.catalogTaxonId ?? null,
          targetName: p.displayName,
          records: PHENOPHASES.map((ph) => ({
            group: ph,
            taxonName: null,
            count: null,
            state: answers[p.id]?.[ph] ?? 'NOT_CHECKED',
            identityConfidence: null,
            behaviour: null,
          })),
        });
      toast.success(m.phenology.saved(checked.length));
      await navigate({ to: '/nature/log' });
    } catch (e) {
      reportError(t, e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page>
      <PageHeader title={m.phenology.title} description={m.phenology.intro} />
      {plants.length === 0 ? (
        <EmptyState className="mt-8" title={m.phenology.noPlants} />
      ) : (
        <div className="mt-6 flex flex-col gap-4">
          {plants.map((p) => (
            <Card
              key={p.id}
              as="section"
              aria-label={p.displayName}
              className="flex flex-col gap-3"
              data-testid="pheno-plant"
            >
              <p className="font-medium text-ink">{p.displayName}</p>
              {PHENOPHASES.map((ph) => (
                <div key={ph} className="flex flex-col gap-1">
                  <span className="text-body-s text-muted">{m.phases[ph]}</span>
                  <SegmentedControl<CheckState>
                    label={`${p.displayName}: ${m.phases[ph]}`}
                    value={answers[p.id]?.[ph] ?? 'NOT_CHECKED'}
                    onValueChange={(v) => setAnswers((a) => ({ ...a, [p.id]: { ...a[p.id], [ph]: v } }))}
                    options={CHECK_STATES.map((s) => ({ value: s, label: m.states[s] }))}
                  />
                </div>
              ))}
            </Card>
          ))}
          <Button className="self-start" onClick={() => void save()} disabled={busy}>
            {m.phenology.save}
          </Button>
        </div>
      )}
    </Page>
  );
}
