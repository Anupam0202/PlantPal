import { gapFillers, MONTHS, type MonthState } from '@plantpal/domain';
import { Badge, Card, EmptyState, Notice, PageHeader, Section } from '@plantpal/ui';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useMemo } from 'react';
import { Page } from '../../app/Page';
import { useActiveGarden, useNatureVisits, useSpecimens, useZones } from '../../data/queries';
import { GardenLoading, NoGarden } from '../../features/garden/NoGarden';
import { gardenBloomWheel, hemisphereOf } from '../../features/nature/bloomData';
import { useNatureT } from '../../features/nature/messages';
import { monthName, taxonById, taxonName, useCandidates } from '../../features/plan/engine';
import { usePlanContext } from '../../features/plan/usePlanContext';
import { usePrefs } from '../../state/prefs';

export const Route = createFileRoute('/nature/bloom')({
  component: BloomBridge,
});

const STATE_FILL: Record<MonthState, string> = {
  FORAGE: 'var(--pp-accent, #2e7d32)',
  GAP: '#d9480f',
  UNKNOWN: '#adb5bd',
};

function arc(cx: number, cy: number, r0: number, r1: number, a0: number, a1: number): string {
  const p = (r: number, a: number) => `${cx + r * Math.sin(a)},${cy - r * Math.cos(a)}`;
  return `M${p(r1, a0)} A${r1},${r1} 0 0 1 ${p(r1, a1)} L${p(r0, a1)} A${r0},${r0} 0 0 0 ${p(r0, a0)} Z`;
}

function BloomBridge() {
  const m = useNatureT();
  const locale = usePrefs((s) => s.locale);
  const { garden } = useActiveGarden();
  const specimens = useSpecimens(garden?.id);
  const visits = useNatureVisits(garden?.id);
  const zones = useZones(garden?.id);
  const zone = zones?.[0] ?? null;
  const { ctx } = usePlanContext(
    garden ?? { place: null, region: null, timezone: 'UTC', profile: null },
    zone,
  );
  const candidates = useCandidates(ctx);

  const wheel = useMemo(
    () => (garden && specimens && visits ? gardenBloomWheel(garden, specimens, visits) : null),
    [garden, specimens, visits],
  );

  if (garden === undefined || !wheel)
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

  const name = (mo: number) => monthName(mo - 1, locale);
  const list = (ms: readonly number[]) => ms.map(name).join(', ');
  const fillers = gapFillers(
    candidates.length ? candidates.map((c) => taxonById(c.taxonId)!).filter(Boolean) : [],
    wheel.gaps,
    hemisphereOf(garden),
  )
    .map((f) => ({ ...f, c: candidates.find((c) => c.taxonId === f.taxon.id)! }))
    .filter((f) => f.c && f.c.status === 'ELIGIBLE')
    .sort((a, b) => Number(b.c.nativeStatus === 'NATIVE') - Number(a.c.nativeStatus === 'NATIVE'))
    .slice(0, 8);

  const rings = wheel.plants.slice(0, 10);
  const size = 320;
  const c = size / 2;
  const inner = 40;
  const outerBand = 18;
  const ringW = rings.length ? (c - inner - outerBand - 22) / rings.length : 0;
  const seg = (2 * Math.PI) / 12;

  return (
    <Page>
      <PageHeader title={m.bloom.title} description={m.bloom.intro} />
      <p className="mt-2 text-caption text-muted">{m.bloom.reference}</p>
      {Math.abs(garden.place?.lat ?? 90) < 30 && <Notice className="mt-3">{m.bloom.tropical}</Notice>}
      {wheel.plants.length === 0 ? (
        <EmptyState className="mt-8" title={m.bloom.noPlants} />
      ) : (
        <>
          <div className="mt-6 flex flex-col items-center gap-4 md:flex-row md:items-start">
            <svg
              viewBox={`0 0 ${size} ${size}`}
              className="w-full max-w-[22rem]"
              role="img"
              aria-label={m.bloom.wheel(wheel.gaps.length, wheel.unknown.length)}
              data-testid="bloom-wheel"
            >
              {MONTHS.map((mo, i) => {
                const a0 = i * seg;
                const a1 = a0 + seg - 0.01;
                const outer0 = c - 22 - outerBand;
                return (
                  <g key={mo}>
                    {rings.map((p, k) => {
                      const r0 = inner + k * ringW;
                      const st = p.months[mo];
                      return (
                        <path
                          key={p.id}
                          d={arc(c, c, r0 + 0.5, r0 + ringW - 0.5, a0, a1)}
                          fill={
                            st === 'bloom'
                              ? p.forage
                                ? '#7cb342'
                                : '#c5e1a5'
                              : st === 'unknown'
                                ? '#e9ecef'
                                : 'transparent'
                          }
                          stroke="var(--pp-line, #ddd)"
                          strokeWidth={0.5}
                        />
                      );
                    })}
                    <path
                      d={arc(c, c, outer0, outer0 + outerBand, a0, a1)}
                      fill={STATE_FILL[wheel.months[mo].state]}
                    />
                    <text
                      x={c + (c - 10) * Math.sin(a0 + seg / 2)}
                      y={c - (c - 10) * Math.cos(a0 + seg / 2) + 4}
                      fontSize={11}
                      textAnchor="middle"
                      fill="currentColor"
                    >
                      {name(mo).slice(0, 3)}
                    </text>
                  </g>
                );
              })}
            </svg>
            <div className="flex flex-col gap-2 text-body-s">
              <p className="font-medium text-ink" data-testid="bloom-gaps">
                {wheel.gaps.length ? m.bloom.gaps(list(wheel.gaps)) : m.bloom.noGaps}
              </p>
              {wheel.unknown.length > 0 && (
                <p className="text-muted" data-testid="bloom-unknown">
                  {m.bloom.unknown(list(wheel.unknown))}
                </p>
              )}
              <ul className="flex flex-wrap gap-3 text-caption text-muted">
                {(['FORAGE', 'GAP', 'UNKNOWN'] as const).map((s) => (
                  <li key={s} className="flex items-center gap-1.5">
                    <span
                      className="inline-block size-3 rounded-sm"
                      style={{ background: STATE_FILL[s] }}
                      aria-hidden="true"
                    />
                    {m.bloom.states[s]}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <Section title={m.bloom.table} headingLevel={2} className="mt-6">
            {}
            <div
              className="overflow-x-auto rounded-lg border border-line"
              role="region"
              aria-label={m.bloom.table}
              tabIndex={0}
            >
              <table className="w-full text-caption" data-testid="bloom-table">
                <thead>
                  <tr>
                    <th scope="col" className="p-2 text-left font-medium text-muted">
                      {m.bloom.plant}
                    </th>
                    {MONTHS.map((mo) => (
                      <th key={mo} scope="col" className="p-1 text-center font-medium text-muted">
                        <abbr title={name(mo)}>{name(mo).slice(0, 1)}</abbr>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {wheel.plants.map((p) => (
                    <tr key={p.id} className="border-t border-line">
                      <th scope="row" className="p-2 text-left font-normal text-ink">
                        {p.name}
                      </th>
                      {MONTHS.map((mo) => (
                        <td
                          key={mo}
                          className="p-1 text-center"
                          title={p.source[mo] === 'observed' ? m.bloom.observed : undefined}
                        >
                          {p.months[mo] === 'bloom' ? '✿' : p.months[mo] === 'unknown' ? '?' : '·'}
                          {p.source[mo] === 'observed' && (
                            <span className="sr-only"> ({m.bloom.observed})</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                  <tr className="border-t-2 border-line">
                    <th scope="row" className="p-2 text-left font-medium text-ink">
                      {m.bloom.states.FORAGE}
                    </th>
                    {MONTHS.map((mo) => (
                      <td key={mo} className="p-1 text-center font-medium">
                        {m.bloom.states[wheel.months[mo].state].slice(0, 1)}
                        <span className="sr-only">{m.bloom.states[wheel.months[mo].state]}</span>
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </Section>

          {wheel.gaps.length > 0 && (
            <Section title={m.bloom.fill} headingLevel={2} className="mt-6">
              <p className="text-body-s text-muted">{m.bloom.fillHint}</p>
              {!zone ? (
                <p className="mt-2 text-body-s text-muted">{m.bloom.needsSpace}</p>
              ) : fillers.length === 0 ? (
                <p className="mt-2 text-body-s text-muted">{m.bloom.fillNone}</p>
              ) : (
                <ul className="mt-3 flex flex-col gap-2" data-testid="gap-fillers">
                  {fillers.map((f) => (
                    <li key={f.taxon.id}>
                      <Card className="flex flex-wrap items-center gap-2 text-body-s">
                        <Link
                          to="/species/$taxonKey"
                          params={{ taxonKey: f.taxon.id }}
                          className="font-medium text-accent-ink underline"
                        >
                          {taxonName(f.taxon, locale)}
                        </Link>
                        <span className="text-muted">{m.bloom.fillMonths(list(f.months))}</span>
                        {f.c.nativeStatus === 'NATIVE' && <Badge tone="accent">{m.bloom.native}</Badge>}
                      </Card>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          )}
        </>
      )}
    </Page>
  );
}
