import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { buildStarterSet, GOALS, type Goal } from '@plantpal/domain';
import type { GardenProfile } from '@plantpal/schemas';
import {
  Badge,
  Button,
  buttonClasses,
  Card,
  Chip,
  EmptyState,
  MagnifierLeafIllustration,
  Notice,
  PageHeader,
  Section,
  SelectField,
  Spinner,
} from '@plantpal/ui';
import { Sun } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Page } from '../../app/Page';
import { savePlan, updateGarden } from '../../data/commands';
import { useActiveGarden, usePlanItems, usePlans, useZones } from '../../data/queries';
import { reportError } from '../../features/garden/errors';
import { GardenLoading } from '../../features/garden/NoGarden';
import { ClimateQuestions, EMPTY_MANUAL } from '../../features/plan/ClimateQuestions';
import {
  CATALOG_TAXA,
  CATALOG_VERSION,
  ENGINE_VERSION,
  inputsHash,
  planItemsOf,
  taxonById,
  useCandidates,
} from '../../features/plan/engine';
import { Matches } from '../../features/plan/Matches';
import { usePlanT } from '../../features/plan/messages';
import { usePlanContext } from '../../features/plan/usePlanContext';
import { useFormat, useT } from '../../i18n';

export const Route = createFileRoute('/plan/')({
  validateSearch: (s: Record<string, unknown>): { zone?: string } =>
    typeof s.zone === 'string' && s.zone.length <= 40 ? { zone: s.zone } : {},
  component: PlanPage,
});

const EMPTY_PROFILE: GardenProfile = {
  household: null,
  showToxicWithWarning: false,
  goals: [],
  minutesPerWeek: null,
  waterAccess: null,
  budget: null,
  manualClimate: null,
};

function PlanPage() {
  const t = useT();
  const m = usePlanT();
  const fmt = useFormat();
  const navigate = useNavigate();
  const { zone: zoneParam } = Route.useSearch();
  const { garden } = useActiveGarden();
  const zones = useZones(garden?.id);
  const plans = usePlans(garden?.id);
  const items = usePlanItems(garden?.id);
  const zone = zones?.find((z) => z.id === zoneParam) ?? zones?.[0] ?? null;
  const profile = garden?.profile ?? EMPTY_PROFILE;
  const { ctx, climate } = usePlanContext(
    garden ? { ...garden, profile } : { place: null, region: null, timezone: 'UTC', profile },
    zone,
  );
  const candidates = useCandidates(ctx);
  const [chosen, setChosen] = useState<Set<string> | null>(null);
  const [saving, setSaving] = useState(false);

  // Start from the suggested starter set; the user's own picks win once they touch it.
  const suggested = useMemo(
    () => new Set(buildStarterSet(candidates, CATALOG_TAXA, { size: 6, goals: profile.goals })),
    [candidates, profile.goals],
  );
  useEffect(() => setChosen(null), [zone?.id]);
  const selection = chosen ?? suggested;

  if (garden === undefined || (garden && (zones === undefined || plans === undefined)))
    return (
      <Page>
        <GardenLoading />
      </Page>
    );

  if (garden === null)
    return (
      <Page>
        <PageHeader title={m.plan.title} />
        <EmptyState
          className="mt-8"
          illustration={<MagnifierLeafIllustration />}
          title={t.plan.emptyTitle}
          description={m.plan.noGarden}
          action={
            <Link to="/welcome" className={buttonClasses('primary')}>
              {m.plan.startSeed}
            </Link>
          }
        />
      </Page>
    );

  const setProfile = async (patch: Partial<GardenProfile>) => {
    try {
      await updateGarden(garden.id, garden.version, { profile: { ...profile, ...patch } });
    } catch (e) {
      reportError(t, e);
    }
  };

  const toggleGoal = (g: Goal, on: boolean) => {
    const next = on ? [...profile.goals, g].slice(-3) : profile.goals.filter((x) => x !== g);
    void setProfile({ goals: next });
  };

  const save = async () => {
    if (!ctx || !zone) return;
    setSaving(true);
    try {
      const r = await savePlan(
        garden.id,
        {
          name: `${zone.name} · ${fmt.date(new Date(), { day: 'numeric', month: 'short', year: 'numeric' })}`,
          catalogVersion: CATALOG_VERSION,
          engineVersion: ENGINE_VERSION,
          inputsHash: inputsHash({ ...ctx, month: 0 }),
        },
        planItemsOf(candidates, selection, zone.id),
      );
      toast.success(m.plan.saved(r.specimens.length));
    } catch (e) {
      reportError(t, e);
    } finally {
      setSaving(false);
    }
  };

  const household = profile.household ?? { cats: false, dogs: false, children: false };
  const currentHash = ctx ? inputsHash({ ...ctx, month: 0 }) : null;

  return (
    <Page width="wide">
      <PageHeader
        title={m.plan.title}
        description={t.plan.emptyBody}
        actions={
          zone ? (
            <Link to="/plan/sun" search={{ zone: zone.id }} className={buttonClasses('secondary')}>
              <Sun className="size-4" aria-hidden="true" />
              {m.plan.sunFinder}
            </Link>
          ) : null
        }
      />

      {!zone ? (
        <EmptyState
          className="mt-8"
          illustration={<MagnifierLeafIllustration />}
          title={m.sun.noZones}
          action={
            <Link to="/garden/spaces" className={buttonClasses('primary')}>
              {t.space.add}
            </Link>
          }
        />
      ) : (
        <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="flex min-w-0 flex-col gap-6">
            {zones && zones.length > 1 && (
              <SelectField
                label={m.plan.forZone}
                className="max-w-xs"
                value={zone.id}
                onValueChange={(id) => void navigate({ to: '/plan', search: { zone: id }, replace: true })}
                options={zones.map((z) => ({ value: z.id, label: z.name }))}
              />
            )}
            {climate === 'loading' && (
              <p className="flex items-center gap-2 text-body-s text-muted" aria-live="polite">
                <Spinner /> {m.seed.climateLoading}
              </p>
            )}
            {climate === 'measured' && (
              <p className="text-body-s text-muted" aria-live="polite">
                {m.seed.climateUpdated}
              </p>
            )}
            {(climate === 'failed' || climate === 'none') && !profile.manualClimate?.frost && (
              <Notice tone="info" title={m.seed.manualTitle}>
                <p className="mb-3">
                  {climate === 'failed' ? m.seed.climateFailed : m.reason.climateUnknown()}
                </p>
                <ClimateQuestions
                  value={profile.manualClimate ?? EMPTY_MANUAL}
                  onChange={(manualClimate) => void setProfile({ manualClimate })}
                />
              </Notice>
            )}
            {!zone.sun && !zone.indoorLight && (
              <Notice
                tone="warning"
                title={m.reason.lightUnknown()}
                action={
                  <Link to="/plan/sun" search={{ zone: zone.id }} className={buttonClasses('primary', 'sm')}>
                    {m.plan.sunFinder}
                  </Link>
                }
              >
                {m.seed.lightBody}
              </Notice>
            )}
            <Matches
              candidates={candidates}
              chosen={selection}
              onToggle={(id, on) => {
                const next = new Set(selection);
                if (on) next.add(id);
                else next.delete(id);
                setChosen(next);
              }}
            />
          </div>

          <aside className="flex flex-col gap-6">
            <Card className="flex flex-col gap-3 lg:sticky lg:top-6">
              <h2 className="text-h3 text-ink">{m.plan.starterSet(selection.size)}</h2>
              <ul className="flex flex-col gap-1 text-body-s">
                {[...selection].map((id) => {
                  const tx = taxonById(id);
                  return tx ? <li key={id}>{tx.names.en}</li> : null;
                })}
              </ul>
              <Button onClick={() => void save()} disabled={saving || !ctx}>
                {saving ? <Spinner /> : null}
                {m.plan.savePlan}
              </Button>
            </Card>

            <Section title={m.seed.goalsTitle} description={m.seed.goalsBody} headingLevel={3}>
              <div className="flex flex-wrap gap-2">
                {GOALS.map((g) => (
                  <Chip
                    key={g}
                    pressed={profile.goals.includes(g)}
                    onPressedChange={(on) => toggleGoal(g, on)}
                  >
                    {m.seed.goals[g]}
                  </Chip>
                ))}
              </div>
            </Section>
            <Section title={m.seed.household} description={m.seed.householdHint} headingLevel={3}>
              <div className="flex flex-wrap gap-2">
                {(['cats', 'dogs', 'children'] as const).map((k) => (
                  <Chip
                    key={k}
                    pressed={household[k]}
                    onPressedChange={(on) => void setProfile({ household: { ...household, [k]: on } })}
                  >
                    {m.seed[k]}
                  </Chip>
                ))}
              </div>
            </Section>

            <Section title={m.plan.savedPlans} headingLevel={3}>
              {plans && plans.length > 0 ? (
                <ul className="flex flex-col gap-2">
                  {plans.slice(0, 5).map((p) => {
                    const its = items?.filter((i) => i.planId === p.id) ?? [];
                    const outdated =
                      its[0]?.zoneId === zone.id && currentHash !== null && p.inputsHash !== currentHash;
                    return (
                      <li key={p.id} className="text-body-s">
                        <p className="font-medium text-ink">{p.name}</p>
                        <p className="text-caption text-muted">
                          {m.plan.planItems(its.filter((i) => i.chosen).length, its.length)}
                        </p>
                        {outdated && (
                          <Badge tone="warning" className="mt-1">
                            {m.plan.outdated}
                          </Badge>
                        )}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-body-s text-muted">{m.plan.noPlans}</p>
              )}
            </Section>
          </aside>
        </div>
      )}
    </Page>
  );
}
