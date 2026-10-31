import { addDays, impactLedger, nativeStatusOf, todayIn, type LedgerRow } from '@plantpal/domain';
import { Badge, Card, PageHeader, SegmentedControl } from '@plantpal/ui';
import { createFileRoute } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { Page } from '../../app/Page';
import {
  useActiveGarden,
  useContainers,
  useGardenCareEvents,
  useHarvests,
  useNatureVisits,
  usePantry,
  useSpecimens,
} from '../../data/queries';
import { GardenLoading, NoGarden } from '../../features/garden/NoGarden';
import { gardenBloomWheel } from '../../features/nature/bloomData';
import { useNatureT } from '../../features/nature/messages';
import { taxonById } from '../../features/plan/engine';
import { useFormat } from '../../i18n';

export const Route = createFileRoute('/nature/impact')({
  component: Impact,
});

type Period = 'year' | 'last12' | 'all';

function Impact() {
  const m = useNatureT();
  const fmt = useFormat();
  const { garden } = useActiveGarden();
  const id = garden?.id;
  const harvests = useHarvests(id);
  const care = useGardenCareEvents(id);
  const pantry = usePantry(id);
  const visits = useNatureVisits(id);
  const specimens = useSpecimens(id);
  const containers = useContainers(id);
  const [period, setPeriod] = useState<Period>('year');

  const rows = useMemo((): LedgerRow[] | null => {
    if (!garden || !harvests || !care || !pantry || !visits || !specimens || !containers) return null;
    const today = todayIn(garden.timezone);
    const from =
      period === 'year'
        ? `${today.slice(0, 4)}-01-01`
        : period === 'last12'
          ? addDays(today, -365)
          : '0000-01-01';
    const region = { countryCode: garden.region?.countryCode ?? null, l3: garden.region?.l3 ?? null };
    const wheel = gardenBloomWheel(garden, specimens, visits);
    return impactLedger({
      period: { from, to: today },
      harvests,
      careEvents: care,
      pantry,
      visits,
      specimens,
      containers,
      taxonOf: (s) => (s.catalogTaxonId ? (taxonById(s.catalogTaxonId) ?? null) : null),
      nativeStatus: (t) => (region.countryCode || region.l3 ? nativeStatusOf(t, region) : 'UNKNOWN'),
      forageMonths: wheel.plants.length ? 12 - wheel.gaps.length - wheel.unknown.length : null,
    });
  }, [garden, harvests, care, pantry, visits, specimens, containers, period]);

  if (garden === undefined || (garden && !rows))
    return (
      <Page>
        <GardenLoading />
      </Page>
    );
  if (garden === null || !rows)
    return (
      <Page>
        <NoGarden />
      </Page>
    );

  const value = (r: LedgerRow) => {
    if (r.value === null) return r.metric === 'carbon' ? m.impact.notEstimated : m.impact.unknown;
    const unit = r.label ?? (r.unit === 'count' ? '' : r.unit);
    const digits = Number.isInteger(r.value) ? 0 : Math.abs(r.value) < 10 ? 2 : 1;
    return `${fmt.number(r.value, digits)}${unit ? ` ${unit}` : ''}`;
  };

  return (
    <Page>
      <PageHeader title={m.impact.title} description={m.impact.intro} />
      <div className="mt-4 flex flex-col gap-1">
        <span className="text-body-s font-medium text-ink">{m.impact.period}</span>
        <SegmentedControl<Period>
          label={m.impact.period}
          value={period}
          onValueChange={setPeriod}
          options={(['year', 'last12', 'all'] as const).map((p) => ({
            value: p,
            label: m.impact.periods[p],
          }))}
        />
      </div>
      {}
      <Card
        padding="none"
        className="mt-4 overflow-x-auto"
        role="region"
        aria-label={m.impact.title}
        tabIndex={0}
      >
        <table className="w-full text-left text-body-s" data-testid="ledger">
          <thead>
            <tr className="text-muted">
              <th scope="col" className="p-3 font-medium">
                {m.impact.metric}
              </th>
              <th scope="col" className="p-3 text-right font-medium">
                {m.impact.value}
              </th>
              <th scope="col" className="p-3 font-medium">
                {m.impact.method}
              </th>
              <th scope="col" className="p-3 font-medium">
                {m.impact.source}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr
                key={`${r.metric}-${r.label ?? i}`}
                className="border-t border-line align-top"
                data-metric={r.metric}
              >
                <th scope="row" className="p-3 font-normal text-ink">
                  {m.impact.metrics[r.metric]}
                </th>
                <td className="tabular p-3 text-right text-ink">{value(r)}</td>
                <td className="p-3">
                  <Badge tone={r.method === 'ESTIMATED' ? 'warning' : 'neutral'}>
                    {m.impact.methods[r.method]}
                  </Badge>
                </td>
                <td className="p-3 text-caption text-muted">
                  {r.source === 'Your records' ? m.impact.sources.own : r.source}
                  {r.uncertainty ? ` · ${r.uncertainty}` : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <p className="mt-3 text-caption text-muted">{m.impact.carbonNote}</p>
    </Page>
  );
}
