import { createFileRoute, Link } from '@tanstack/react-router';
import { seasonModel, seasonsFor } from '@plantpal/domain';
import type { ClimateProfile } from '@plantpal/schemas';
import {
  Button,
  buttonClasses,
  Card,
  EmptyState,
  Metric,
  Notice,
  PageHeader,
  Section,
  Skeleton,
  Spinner,
} from '@plantpal/ui';
import { Thermometer } from 'lucide-react';
import { useState } from 'react';
import { Page } from '../../app/Page';
import { useActiveGarden } from '../../data/queries';
import { gardenCoords, useClimateProfile, useClimateProjection } from '../../env/hooks';
import { useCareT } from '../../features/care/messages';
import { GardenLoading, NoGarden } from '../../features/garden/NoGarden';
import { monthName } from '../../features/plan/engine';
import { useFormat } from '../../i18n';
import { usePrefs } from '../../state/prefs';

export const Route = createFileRoute('/nature/climate')({
  component: ClimatePage,
});

function mmdd(v: string, locale: string): string {
  const [m, d] = v.split('-').map(Number);
  return new Intl.DateTimeFormat(locale === 'hi' ? 'hi-IN' : locale, {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(2026, (m ?? 1) - 1, d ?? 1)));
}

/** Monthly normals as a small chart (rain bars, high/low lines) with a table equivalent. */
function NormalsChart({ months }: { months: ClimateProfile['months'] }) {
  const m = useCareT();
  const locale = usePrefs((s) => s.locale);
  const fmt = useFormat();
  const W = 320;
  const H = 150;
  const temps = months.flatMap((x) => [x.tmaxC, x.tminC]).filter((v): v is number => v !== null);
  const tMin = Math.min(0, ...temps);
  const tMax = Math.max(30, ...temps);
  const pMax = Math.max(50, ...months.map((x) => x.precipMm ?? 0));
  const x = (i: number) => 16 + i * ((W - 32) / 11);
  const yT = (t: number) => H - 18 - ((t - tMin) / (tMax - tMin)) * (H - 36);
  const line = (key: 'tmaxC' | 'tminC') =>
    months
      .map((v, i) => (v[key] === null ? null : `${x(i).toFixed(1)},${yT(v[key] as number).toFixed(1)}`))
      .filter(Boolean)
      .join(' ');
  return (
    <div className="flex flex-col gap-2">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" aria-hidden="true">
        {months.map((v, i) => {
          const h = ((v.precipMm ?? 0) / pMax) * (H - 36);
          return (
            <rect
              key={i}
              x={x(i) - 8}
              y={H - 18 - h}
              width={16}
              height={h}
              className="fill-info-soft"
              rx={2}
            />
          );
        })}
        <polyline points={line('tmaxC')} className="fill-none stroke-warning" strokeWidth={2} />
        <polyline points={line('tminC')} className="fill-none stroke-info" strokeWidth={2} />
        {months.map((_, i) => (
          <text key={i} x={x(i)} y={H - 4} textAnchor="middle" className="fill-muted text-[9px]">
            {monthName(i, locale).slice(0, 1)}
          </text>
        ))}
      </svg>
      <div className="flex flex-wrap gap-4 text-caption text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 bg-warning" aria-hidden="true" />
          {m.climate.tmax}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 bg-info" aria-hidden="true" />
          {m.climate.tmin}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block size-3 rounded-sm bg-info-soft" aria-hidden="true" />
          {m.climate.rain}
        </span>
      </div>
      <details className="text-body-s">
        <summary className="cursor-pointer text-muted">{m.climate.normals}</summary>
        <div className="mt-2">
          <table className="w-full text-left text-body-s">
            <thead>
              <tr className="text-muted">
                <th scope="col" className="py-1 font-medium" />
                <th scope="col" className="py-1 text-right font-medium">
                  {m.climate.tmax}
                </th>
                <th scope="col" className="py-1 text-right font-medium">
                  {m.climate.tmin}
                </th>
                <th scope="col" className="py-1 text-right font-medium">
                  {m.climate.rain}
                </th>
              </tr>
            </thead>
            <tbody>
              {months.map((v, i) => (
                <tr key={i} className="border-t border-line">
                  <th scope="row" className="py-1 font-normal">
                    {monthName(i, locale)}
                  </th>
                  <td className="tabular py-1 text-right">
                    {v.tmaxC === null ? '—' : `${fmt.number(v.tmaxC, 1)} °C`}
                  </td>
                  <td className="tabular py-1 text-right">
                    {v.tminC === null ? '—' : `${fmt.number(v.tminC, 1)} °C`}
                  </td>
                  <td className="tabular py-1 text-right">
                    {v.precipMm === null ? '—' : `${fmt.number(v.precipMm)} mm`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

function Projections({ lat, lon }: { lat: number; lon: number }) {
  const m = useCareT();
  const fmt = useFormat();
  const [wanted, setWanted] = useState(false);
  const q = useClimateProjection({ lat, lon }, wanted);
  const n = (x: number) => fmt.number(x, 1);
  return (
    <Section title={m.climate.projections} description={m.climate.projectionsBody} headingLevel={2}>
      {!wanted ? (
        <Button variant="secondary" className="self-start" onClick={() => setWanted(true)}>
          {m.climate.loadProjections}
        </Button>
      ) : q.isPending ? (
        <p className="flex items-center gap-2 text-body-s text-muted">
          <Spinner /> {m.climate.loading}
        </p>
      ) : q.isError || !q.data ? (
        <Notice tone="warning">{m.climate.failed}</Notice>
      ) : (
        <Card padding="md" className="flex flex-col gap-2" data-testid="projection">
          {q.data.dTmeanC && (
            <p className="text-body font-semibold text-ink">
              {m.climate.warming(n(q.data.dTmeanC.min), n(q.data.dTmeanC.median), n(q.data.dTmeanC.max))}
            </p>
          )}
          {q.data.dPrecipPct && (
            <p className="text-body-s text-ink">
              {m.climate.rainChange(
                n(q.data.dPrecipPct.min),
                n(q.data.dPrecipPct.median),
                n(q.data.dPrecipPct.max),
              )}
            </p>
          )}
          <p className="text-caption text-muted">
            {m.climate.models(q.data.models.length)} · {q.data.baseline} → {q.data.future}
          </p>
        </Card>
      )}
    </Section>
  );
}

function ClimatePage() {
  const m = useCareT();
  const fmt = useFormat();
  const locale = usePrefs((s) => s.locale);
  const { garden } = useActiveGarden();
  const coords = gardenCoords(garden);
  const q = useClimateProfile(coords);

  if (garden === undefined)
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
  const hemisphere = garden.hemisphere ?? ((coords?.lat ?? 1) < 0 ? 'south' : 'north');
  const p = q.data;
  const model = p
    ? seasonModel(p.koppen, {
        lat: coords?.lat,
        lon: coords?.lon,
        monsoon: garden.profile?.manualClimate?.monsoon ?? null,
      })
    : null;

  return (
    <Page>
      <PageHeader title={m.climate.title} description={m.climate.description} />
      <div className="mt-6 flex flex-col gap-8">
        {!coords ? (
          <EmptyState
            illustration={<Thermometer className="size-16 text-muted" aria-hidden="true" />}
            title={m.climate.noLocation}
            action={
              <Link to="/garden/edit" className={buttonClasses('primary')}>
                {m.climate.title}
              </Link>
            }
          />
        ) : q.isPending ? (
          <div className="flex flex-col gap-3" aria-busy="true">
            <p className="text-body-s text-muted">{m.climate.loading}</p>
            <Skeleton className="h-32 w-full" />
          </div>
        ) : !p ? (
          <Notice tone="warning">{m.climate.failed}</Notice>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2" data-testid="climate-facts">
              <Card padding="md">
                <Metric
                  label={p.hardinessZone ? m.climate.zone(p.hardinessZone) : m.climate.koppen}
                  value={p.extremeMinC === null ? '—' : `${fmt.number(p.extremeMinC, 1)} °C`}
                  hint={
                    p.extremeMinC === null
                      ? undefined
                      : m.climate.coldest(`${fmt.number(p.extremeMinC, 1)} °C`)
                  }
                />
              </Card>
              <Card padding="md" className="flex flex-col gap-1 text-body-s">
                <p className="font-semibold text-ink">
                  {p.seasonDays === 365 || !p.frost?.lastSpring
                    ? m.climate.frostRare
                    : p.seasonDays !== null
                      ? m.climate.frostFree(p.seasonDays)
                      : '—'}
                </p>
                {p.frost?.lastSpring && (
                  <p className="text-muted">
                    {m.climate.lastFrost(
                      mmdd(p.frost.lastSpring.p50, locale),
                      mmdd(p.frost.lastSpring.p90, locale),
                    )}
                  </p>
                )}
                {p.frost?.firstAutumn && (
                  <p className="text-muted">
                    {m.climate.firstFrost(
                      mmdd(p.frost.firstAutumn.p10, locale),
                      mmdd(p.frost.firstAutumn.p50, locale),
                    )}
                  </p>
                )}
                {p.hotDaysPerYear !== null && (
                  <p className="text-muted">{m.climate.hotDays(p.hotDaysPerYear)}</p>
                )}
              </Card>
              <Card padding="md" className="flex flex-col gap-2 text-body-s">
                <p className="text-caption text-muted">{m.climate.koppen}</p>
                <p className="text-body font-semibold text-ink">
                  {p.koppen ?? '—'} {p.koppen ? `· ${m.climate.koppenGroups[p.koppen[0] ?? ''] ?? ''}` : ''}
                </p>
              </Card>
              <Card padding="md" className="flex flex-col gap-2 text-body-s">
                <p className="text-caption text-muted">{m.climate.seasons}</p>
                {model ? (
                  <ul className="flex flex-col gap-1">
                    {seasonsFor(model, hemisphere).map((s) => (
                      <li key={s.key}>
                        <span className="font-medium text-ink">{m.climate.seasonNames[s.key] ?? s.key}</span>
                        <span className="text-muted">
                          {' '}
                          · {monthName(s.months[0] ?? 0, locale)}–
                          {monthName(s.months[s.months.length - 1] ?? 0, locale)}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-muted">—</p>
                )}
              </Card>
            </div>
            <Section title={m.climate.normals} headingLevel={2}>
              <NormalsChart months={p.months} />
              <p className="text-caption text-muted">{m.climate.period(p.period, p.years)}</p>
            </Section>
            <Projections lat={coords.lat} lon={coords.lon} />
          </>
        )}
      </div>
    </Page>
  );
}
