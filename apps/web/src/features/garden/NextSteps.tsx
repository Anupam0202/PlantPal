import { Link } from '@tanstack/react-router';
import type { Garden } from '@plantpal/schemas';
import { Card } from '@plantpal/ui';
import { ChevronRight, MapPin, Search, Sprout as SproutIcon, Sun } from 'lucide-react';
import type { ReactNode } from 'react';
import { usePlanItems, usePlans, useSpecimens, useZones } from '../../data/queries';
import { useFormat, useT } from '../../i18n';

interface Step {
  key: string;
  icon: ReactNode;
  text: string;
  link: ReactNode;
}

const linkClass =
  'flex min-h-12 items-center gap-3 rounded-md px-2 py-2 text-body-s text-ink hover:bg-sunken focus-visible:outline-2 focus-visible:outline-focus';

/** "Your next three steps" (§7 W1 step 9): derived from the saved plan, the spaces and the garden. */
export function NextSteps({ garden }: { garden: Garden }) {
  const t = useT();
  const fmt = useFormat();
  const specimens = useSpecimens(garden.id);
  const zones = useZones(garden.id);
  const plans = usePlans(garden.id);
  const items = usePlanItems(garden.id);
  if (!specimens || !zones || !plans || !items) return null;

  const planned = specimens.filter((s) => s.status === 'planned');
  const laterMonth = (specimenId: string) => {
    const item = items.find((i) => i.specimenId === specimenId);
    const f = item?.findings.find((x) => x.code === 'plantLater');
    return f && typeof f.params?.month === 'number' ? f.params.month : null;
  };
  const now = planned.filter((s) => laterMonth(s.id) === null);
  const later = planned
    .map((s) => ({ s, month: laterMonth(s.id) }))
    .filter((x): x is { s: (typeof planned)[number]; month: number } => x.month !== null);
  const names = (list: typeof planned) => {
    const shown = list.slice(0, 2).map((s) => s.displayName);
    const rest = list.length - shown.length;
    // "A, B and 2 more" rather than "A and B and 2 more".
    return rest > 0 ? t.today.andMore(shown.join(', '), rest) : fmt.list(shown);
  };
  const unknownLight = zones.filter((z) => !z.sun && !z.indoorLight);
  const steps: Step[] = [];

  if (now.length > 0)
    steps.push({
      key: 'plant',
      icon: <SproutIcon className="size-5 text-accent-ink" aria-hidden="true" />,
      text: t.today.stepPlantNow(names(now)),
      link: '/garden',
    });
  for (const z of unknownLight.slice(0, 2))
    steps.push({
      key: `light-${z.id}`,
      icon: <Sun className="size-5 text-pollen-700" aria-hidden="true" />,
      text: t.today.stepMeasure(z.name),
      link: z.id,
    });
  if (!garden.place?.lat)
    steps.push({
      key: 'location',
      icon: <MapPin className="size-5 text-info" aria-hidden="true" />,
      text: t.today.stepLocation,
      link: '/garden/edit',
    });
  const first = later[0];
  if (first)
    steps.push({
      key: 'later',
      icon: <SproutIcon className="size-5 text-muted" aria-hidden="true" />,
      text: t.today.stepPlantLater(
        first.s.displayName,
        fmt.date(new Date(Date.UTC(2026, first.month, 15)), { month: 'long' }),
      ),
      link: '/garden',
    });
  if (plans.length === 0)
    steps.push({
      key: 'plan',
      icon: <Search className="size-5 text-accent-ink" aria-hidden="true" />,
      text: t.today.stepFindPlants,
      link: '/plan',
    });

  return (
    <Card padding="md" className="flex flex-col gap-2" data-testid="next-steps">
      <h2 className="font-display text-h3 text-ink">{t.today.stepsTitle}</h2>
      {steps.length === 0 ? (
        <p className="text-body-s text-muted">{t.today.stepsDone}</p>
      ) : (
        <ol className="flex flex-col">
          {steps.slice(0, 3).map((s) => {
            const body = (
              <>
                {s.icon}
                <span className="flex-1">{s.text}</span>
                <ChevronRight className="size-4 text-subtle" aria-hidden="true" />
              </>
            );
            return (
              <li key={s.key}>
                {s.key.startsWith('light-') ? (
                  <Link to="/plan/sun" search={{ zone: String(s.link) }} className={linkClass}>
                    {body}
                  </Link>
                ) : s.link === '/garden/edit' ? (
                  <Link to="/garden/edit" className={linkClass}>
                    {body}
                  </Link>
                ) : s.link === '/plan' ? (
                  <Link to="/plan" className={linkClass}>
                    {body}
                  </Link>
                ) : (
                  <Link to="/garden" className={linkClass}>
                    {body}
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}
