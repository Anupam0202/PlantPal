import {
  darwinCoreCsv,
  fitWeatherOk,
  isComplete,
  trendFor,
  visitTotals,
  type IncompatibleReason,
} from '@plantpal/domain';
import type { NatureVisit } from '@plantpal/schemas';
import { Badge, Button, Card, EmptyState, PageHeader, Section } from '@plantpal/ui';
import { createFileRoute, Link } from '@tanstack/react-router';
import { Download, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { Page } from '../../app/Page';
import { voidEntry } from '../../data/commands';
import { useActiveGarden, useNatureVisits } from '../../data/queries';
import { reportError } from '../../features/garden/errors';
import { GardenLoading, NoGarden } from '../../features/garden/NoGarden';
import { POMS_URL, useNatureT, type NatureMessages } from '../../features/nature/messages';
import { useFormat, useT } from '../../i18n';
import { downloadBlob } from '../../lib/download';

export const Route = createFileRoute('/nature/log')({
  component: NatureLog,
});

const targetKey = (v: NatureVisit) => v.targetTaxonId ?? v.targetName.trim().toLowerCase();

function groupName(m: NatureMessages, g: string): string {
  return (
    (m.groups as Record<string, string>)[g] ??
    (m.sightingGroups as Record<string, string>)[g] ??
    (m.phases as Record<string, string>)[g] ??
    (g === 'bird' ? m.birds.species : g)
  );
}

function Trend({ visits, m }: { visits: NatureVisit[]; m: NatureMessages }) {
  const fmt = useFormat();
  const t = trendFor(visits);
  const name = visits[0]?.targetName || '—';
  return (
    <Card className="flex flex-col gap-2" data-testid="trend">
      <p className="font-medium text-ink">{m.log.trendFor(name)}</p>
      {t.valid ? (
        <>
          <p className="text-body-s text-muted">{m.log.trendOk}</p>
          <table className="text-body-s">
            <tbody>
              {t.points.map((p) => (
                <tr key={p.visitId} className="border-t border-line">
                  <th scope="row" className="py-1 pr-3 text-left font-normal text-muted">
                    {fmt.date(new Date(`${p.on}T12:00:00Z`))}
                  </th>
                  <td className="tabular py-1 pr-3 text-ink">{m.fit.total(p.total)}</td>
                  <td className="tabular py-1 text-muted">
                    {p.per100Flowers !== null ? m.log.perFlowers(p.per100Flowers) : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : (
        <>
          <p className="text-body-s text-ink">{m.log.noTrend(t.compatible)}</p>
          {Object.keys(t.reasons).length > 0 && (
            <div className="text-caption text-muted">
              <p>{m.log.reasonsTitle}</p>
              <ul className="list-disc pl-5">
                {(Object.entries(t.reasons) as Array<[IncompatibleReason, number]>).map(([r, n]) => (
                  <li key={r}>
                    {m.log.reasons[r]} ({n})
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

function NatureLog() {
  const t = useT();
  const m = useNatureT();
  const fmt = useFormat();
  const { garden } = useActiveGarden();
  const visits = useNatureVisits(garden?.id);

  if (garden === undefined || visits === undefined)
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

  const fit = visits.filter((v) => v.protocol === 'fit-count');
  const byTarget = new Map<string, NatureVisit[]>();
  for (const v of fit) byTarget.set(targetKey(v), [...(byTarget.get(targetKey(v)) ?? []), v]);

  const exportCsv = () => {
    const place =
      garden.place && garden.place.lat !== null && garden.place.lon !== null
        ? { lat: garden.place.lat, lon: garden.place.lon }
        : null;
    const csv = darwinCoreCsv(visits, place, (g) => groupName(m, g));
    downloadBlob(
      new Blob([csv], { type: 'text/csv;charset=utf-8' }),
      `plantpal-nature-${new Date().toISOString().slice(0, 10)}.csv`,
    );
  };

  return (
    <Page>
      <PageHeader
        title={m.log.title}
        actions={
          visits.length > 0 ? (
            <Button variant="secondary" onClick={exportCsv}>
              <Download className="size-4" aria-hidden="true" />
              {m.log.export}
            </Button>
          ) : undefined
        }
      />
      {visits.length > 0 && <p className="mt-1 text-caption text-muted">{m.log.exportHint}</p>}
      {visits.length === 0 ? (
        <EmptyState
          className="mt-8"
          title={m.log.empty}
          action={
            <Link to="/nature/count" className="text-accent-ink underline">
              {m.hub.count}
            </Link>
          }
        />
      ) : (
        <>
          {byTarget.size > 0 && (
            <Section title={m.log.trends} headingLevel={2} className="mt-6">
              <div className="flex flex-col gap-3">
                {[...byTarget.values()].map((vs) => (
                  <Trend key={targetKey(vs[0]!)} visits={vs} m={m} />
                ))}
              </div>
              <p className="mt-2 text-caption text-muted">
                {m.fit.credit}{' '}
                <a
                  href={POMS_URL}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1 text-accent-ink underline"
                >
                  {m.fit.creditLink}
                  <ExternalLink className="size-3" aria-hidden="true" />
                </a>
              </p>
            </Section>
          )}
          <ul className="mt-6 flex flex-col gap-2" data-testid="visits">
            {visits.map((v) => {
              const tot = visitTotals(v);
              const weatherOk = v.protocol === 'fit-count' ? fitWeatherOk(v.weather) : null;
              const seen = v.records.filter((r) => r.state !== 'NOT_CHECKED');
              return (
                <li key={v.id}>
                  <Card className="flex flex-col gap-1.5 text-body-s">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-ink">{m.protocol[v.protocol]}</span>
                      {v.targetName && <span className="text-muted">· {v.targetName}</span>}
                      <span className="text-muted">· {fmt.date(new Date(v.startedAt))}</span>
                      {!isComplete(v) && <Badge tone="warning">{m.log.incomplete}</Badge>}
                      {weatherOk === false && <Badge tone="warning">{m.log.poorWeather}</Badge>}
                      {tot.uncertain > 0 && <Badge>{m.log.uncertain(tot.uncertain)}</Badge>}
                    </div>
                    {v.protocol === 'phenology' ? (
                      <p className="text-ink">
                        {seen.map((r) => `${groupName(m, r.group)}: ${m.states[r.state]}`).join(' · ') ||
                          m.states.NOT_CHECKED}
                      </p>
                    ) : (
                      <p className="text-ink">
                        {v.protocol === 'fit-count' ? `${m.fit.total(tot.total)} · ` : ''}
                        {seen
                          .map(
                            (r) =>
                              `${r.taxonName ?? groupName(m, r.group)}${r.count !== null ? ` ${r.count}` : ''}${r.state === 'UNCERTAIN' ? ' ?' : ''}`,
                          )
                          .join(', ')}
                      </p>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="self-start"
                      onClick={() =>
                        void voidEntry('natureVisits', v.id)
                          .then(() => toast.success(m.log.removed))
                          .catch((e: unknown) => reportError(t, e))
                      }
                    >
                      {m.log.remove}
                    </Button>
                  </Card>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Page>
  );
}
