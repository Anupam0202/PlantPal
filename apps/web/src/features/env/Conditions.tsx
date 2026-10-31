import { Link } from '@tanstack/react-router';
import { Badge, buttonClasses, Card, cn, EvidenceBadge, Metric, Notice } from '@plantpal/ui';
import {
  MONTHS,
  type AirQuality,
  type Elevation,
  type Forecast,
  type SolarClimatology,
} from '@plantpal/schemas';
import { formatCoordinates } from '@plantpal/providers';
import { MapPin } from 'lucide-react';
import type { ReactNode } from 'react';
import { aqiBand, weatherKind } from '../../env/weather';
import { useFormat, useT } from '../../i18n';
import { SourceButton, SourceState } from './SourceInfo';
import { WeatherIcon } from './WeatherIcon';

type Q<T> = { data?: T; isPending: boolean; isError: boolean; refetch: () => unknown };

function CardHead({
  title,
  q,
  children,
}: {
  title: string;
  q: Q<{ provenance: Parameters<typeof SourceState>[0]['provenance'] }>;
  children?: ReactNode;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <h2 className="font-display text-h3 text-ink">{title}</h2>
      <div className="flex items-center gap-1">
        <SourceState
          provenance={q.data?.provenance}
          isPending={q.isPending}
          isError={q.isError}
          onRetry={() => void q.refetch()}
        />
        {children}
      </div>
    </div>
  );
}

/** Humidity, wind, rain chance and UV, shown under the sky. Unknown values stay "—" (S2). */
export function NowDetails({ q }: { q: Q<Forecast> }) {
  const t = useT();
  const f = useFormat();
  const c = q.data?.current;
  const v = (x: number | null | undefined, digits = 0) =>
    x === null || x === undefined ? '—' : f.number(x, digits);
  const todayRain = q.data?.daily.precipitationProbabilityMaxPct[0];
  return (
    <div className="flex flex-col gap-3 border-t border-line pt-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label={t.env.humidity} value={v(c?.humidityPct.value)} unit="%" evidence="MODELLED" />
        <Metric
          label={t.env.wind}
          value={v(c?.windSpeedKmh.value)}
          unit="km/h"
          hint={c?.windGustsKmh.value != null ? `${t.env.gusts} ${v(c.windGustsKmh.value)}` : undefined}
        />
        <Metric label={t.env.rainChance} value={v(todayRain)} unit="%" />
        <Metric label={t.env.uv} value={v(c?.uvIndex.value, 1)} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <SourceState
          provenance={q.data?.provenance}
          isPending={q.isPending}
          isError={q.isError}
          onRetry={() => void q.refetch()}
        />
        {q.data && (
          <SourceButton
            provenance={q.data.provenance}
            validFor={
              c?.time ? f.date(new Date(c.time), { dateStyle: 'medium', timeStyle: 'short' }) : undefined
            }
          />
        )}
      </div>
      {q.isError && <p className="text-body-s text-muted">{t.env.unavailableBody}</p>}
    </div>
  );
}

export function ForecastStrip({ q }: { q: Q<Forecast> }) {
  const t = useT();
  const f = useFormat();
  const d = q.data?.daily;
  return (
    <Card padding="md">
      <CardHead title={t.env.next7} q={q} />
      {d ? (
        // Seven equal columns that always fit: no sideways scrolling on phones.
        <div>
          <ol className="grid grid-cols-7 gap-0.5 sm:gap-1">
            {d.date.map((day, i) => {
              const kind = weatherKind(d.weatherCode[i]);
              const label =
                i === 0
                  ? t.common.today
                  : f.date(new Date(`${day}T12:00:00Z`), { weekday: 'short', timeZone: 'UTC' });
              const max = d.temperatureMaxC[i];
              const min = d.temperatureMinC[i];
              const pp = d.precipitationProbabilityMaxPct[i];
              return (
                <li
                  key={day}
                  className="flex min-w-0 flex-col items-center gap-1 rounded-md px-0.5 py-2 text-center"
                >
                  <span className="max-w-full truncate text-caption font-medium text-muted">{label}</span>
                  <span className="text-accent-ink">
                    <WeatherIcon kind={kind} className="size-6" />
                  </span>
                  <span className="sr-only">{t.env.weather[kind]}</span>
                  <span className="text-body-s font-semibold text-ink">
                    {max == null ? '—' : `${f.number(max)}°`}
                  </span>
                  <span className="text-caption text-muted">{min == null ? '—' : `${f.number(min)}°`}</span>
                  {pp != null && pp >= 30 && <span className="text-caption text-info">{f.number(pp)}%</span>}
                </li>
              );
            })}
          </ol>
        </div>
      ) : (
        <div className="skeleton h-28 rounded-md" aria-hidden="true" />
      )}
      <p className="mt-2 text-caption text-muted">{q.data?.provenance.attribution}</p>
    </Card>
  );
}

const AQI_TONE = {
  good: 'accent',
  moderate: 'pollen',
  sensitive: 'warning',
  unhealthy: 'danger',
  veryUnhealthy: 'danger',
  hazardous: 'danger',
} as const;

export function AirCard({ q }: { q: Q<AirQuality> }) {
  const t = useT();
  const f = useFormat();
  const a = q.data;
  const aqi = a?.usAqi.value;
  const band = aqi != null ? aqiBand(aqi) : null;
  const v = (x: number | null | undefined) => (x == null ? '—' : f.number(x, 1));
  return (
    <Card padding="md">
      <CardHead title={t.env.air} q={q}>
        {a && (
          <SourceButton
            provenance={a.provenance}
            validFor={f.date(new Date(a.time), { dateStyle: 'medium', timeStyle: 'short' })}
          />
        )}
      </CardHead>
      {a ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <span className="font-display text-display-l leading-none text-ink">
              {aqi == null ? '—' : f.number(aqi)}
            </span>
            <div className="flex flex-col gap-1">
              <span className="text-caption text-muted">{t.env.usAqi}</span>
              {band && <Badge tone={AQI_TONE[band]}>{t.env.aqi[band]}</Badge>}
            </div>
            <EvidenceBadge grade="MODELLED" compact className="ml-auto" />
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-body-s sm:grid-cols-4">
            {(
              [
                [t.env.pm25, a.pm25],
                [t.env.pm10, a.pm10],
                [t.env.ozone, a.ozone],
                [t.env.no2, a.nitrogenDioxide],
              ] as const
            ).map(([label, fact]) => (
              <div key={label}>
                <dt className="text-caption text-muted">{label}</dt>
                <dd className="text-ink">
                  {v(fact.value)} <span className="text-caption text-muted">{fact.unit}</span>
                </dd>
              </div>
            ))}
          </dl>
          {!a.pollenCovered && <p className="text-caption text-muted">{t.env.pollenNotCovered}</p>}
        </div>
      ) : (
        !q.isError && <div className="skeleton h-24 rounded-md" aria-hidden="true" />
      )}
    </Card>
  );
}

export function WaterOutlook({ q }: { q: Q<Forecast> }) {
  const t = useT();
  const f = useFormat();
  const d = q.data?.daily;
  const sum = (arr: Array<number | null> | undefined) => {
    const vals = (arr ?? []).slice(0, 3);
    if (vals.length === 0 || vals.some((x) => x === null)) return null;
    return vals.reduce<number>((s, x) => s + (x ?? 0), 0);
  };
  const et0 = sum(d?.et0SumMm);
  const rain = sum(d?.precipitationSumMm);
  const c = q.data?.current;
  return (
    <Card padding="md">
      <CardHead title={t.env.waterOutlook} q={q} />
      <div className="grid grid-cols-2 gap-4">
        <Metric
          label={t.env.et0}
          value={et0 == null ? '—' : f.number(et0, 1)}
          unit="mm"
          evidence="MODELLED"
        />
        <Metric
          label={t.env.rainExpected}
          value={rain == null ? '—' : f.number(rain, 1)}
          unit="mm"
          evidence="MODELLED"
        />
      </div>
      <p className="mt-3 text-caption text-muted">{t.env.waterHint}</p>
      {c && (c.soilTemperature6cmC.value !== null || c.soilMoisture3to9cm.value !== null) && (
        <div className="mt-4 border-t border-line pt-3">
          <h3 className="mb-2 text-body-s font-semibold text-ink">{t.env.soil}</h3>
          <div className="grid grid-cols-2 gap-4">
            <Metric
              label={t.env.soilTemp}
              value={c.soilTemperature6cmC.value == null ? '—' : f.number(c.soilTemperature6cmC.value, 1)}
              unit="°C"
            />
            <Metric
              label={t.env.soilMoisture}
              value={c.soilMoisture3to9cm.value == null ? '—' : f.number(c.soilMoisture3to9cm.value, 2)}
              unit="m³/m³"
            />
          </div>
          <p className="mt-2 text-caption text-muted">{t.env.soilHint}</p>
        </div>
      )}
    </Card>
  );
}

export function PlaceCard({
  lat,
  lon,
  elevation,
  solar,
}: {
  lat: number;
  lon: number;
  elevation: Q<Elevation>;
  solar: Q<SolarClimatology>;
}) {
  const t = useT();
  const f = useFormat();
  const s = solar.data;
  const max = s ? Math.max(1, ...s.clearSkyMJm2Day.map((x) => x ?? 0)) : 1;
  const months = MONTHS.map((_, i) =>
    f.date(new Date(Date.UTC(2026, i, 15)), { month: 'narrow', timeZone: 'UTC' }),
  );
  return (
    <Card padding="md">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-display text-h3 text-ink">{t.env.place}</h2>
        <span className="inline-flex items-center gap-1 text-caption text-muted">
          <MapPin className="size-3.5" aria-hidden="true" />
          {formatCoordinates(lat, lon)}
        </span>
      </div>
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-2">
          <Metric
            label={t.env.elevation}
            value={elevation.data?.elevationM.value == null ? '—' : f.number(elevation.data.elevationM.value)}
            unit="m"
            evidence={elevation.data ? 'MODELLED' : undefined}
          />
          <SourceState
            provenance={elevation.data?.provenance}
            isPending={elevation.isPending}
            isError={elevation.isError}
            onRetry={() => void elevation.refetch()}
          />
        </div>
        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-body-s font-semibold text-ink">{t.env.sunEnergy}</h3>
            <SourceState
              provenance={s?.provenance}
              isPending={solar.isPending}
              isError={solar.isError}
              onRetry={() => void solar.refetch()}
            />
          </div>
          {s ? (
            <>
              <figure>
                <div
                  className="flex h-28 items-end gap-1"
                  role="img"
                  aria-label={`${t.env.sunEnergy}: ${s.allSkyMJm2Day.map((x, i) => `${months[i]} ${x == null ? '—' : f.number(x, 1)}`).join(', ')} MJ/m²/day`}
                >
                  {s.allSkyMJm2Day.map((x, i) => (
                    <div key={i} className="relative flex h-full flex-1 flex-col justify-end">
                      <div
                        className="absolute inset-x-0 bottom-0 rounded-t-sm bg-sunken"
                        style={{ height: `${((s.clearSkyMJm2Day[i] ?? 0) / max) * 100}%` }}
                      />
                      <div
                        className={cn('relative rounded-t-sm', x == null ? '' : 'bg-pollen-400')}
                        style={{ height: `${((x ?? 0) / max) * 100}%` }}
                      />
                    </div>
                  ))}
                </div>
                <div className="mt-1 flex gap-1 text-center text-[0.7rem] text-muted" aria-hidden="true">
                  {months.map((m, i) => (
                    <span key={i} className="flex-1">
                      {m}
                    </span>
                  ))}
                </div>
                <figcaption className="mt-2 flex flex-wrap gap-3 text-caption text-muted">
                  <span className="inline-flex items-center gap-1">
                    <span className="inline-block size-2.5 rounded-sm bg-pollen-400" aria-hidden="true" />
                    {t.env.allSky}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span
                      className="inline-block size-2.5 rounded-sm bg-sunken ring-1 ring-line"
                      aria-hidden="true"
                    />
                    {t.env.clearSky}
                  </span>
                  <span>MJ/m²/day</span>
                </figcaption>
              </figure>
              <p className="mt-2 text-caption text-muted">{t.env.sunEnergyHint(s.period ?? '—')}</p>
            </>
          ) : (
            !solar.isError && <div className="skeleton h-28 rounded-md" aria-hidden="true" />
          )}
        </div>
      </div>
    </Card>
  );
}

export function NoLocation() {
  const t = useT();
  return (
    <Notice
      tone="info"
      title={t.env.noLocationTitle}
      action={
        <Link to="/garden/edit" className={buttonClasses('primary', 'sm')}>
          <MapPin className="size-4" aria-hidden="true" />
          {t.env.addLocation}
        </Link>
      }
    >
      {t.env.noLocationBody}
    </Notice>
  );
}
