import { lensReport } from '@plantpal/domain';
import type { RegionStatusValue } from '@plantpal/schemas';
import { Badge, Card, EmptyState, Notice, PageHeader } from '@plantpal/ui';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useMemo } from 'react';
import { Page } from '../../app/Page';
import { useActiveGarden, useSpecimens } from '../../data/queries';
import { GardenLoading, NoGarden } from '../../features/garden/NoGarden';
import { useNatureT } from '../../features/nature/messages';
import { regionName, sourceLabel, taxonById } from '../../features/plan/engine';
import { usePrefs } from '../../state/prefs';

export const Route = createFileRoute('/nature/lens')({
  component: Lens,
});

const TONE: Record<RegionStatusValue, 'accent' | 'warning' | 'danger' | 'neutral'> = {
  NATIVE: 'accent',
  INTRODUCED: 'neutral',
  INVASIVE_LISTED: 'danger',
  CONFLICT: 'warning',
  UNKNOWN: 'neutral',
};

function Lens() {
  const m = useNatureT();
  const locale = usePrefs((s) => s.locale);
  const { garden } = useActiveGarden();
  const specimens = useSpecimens(garden?.id);
  const region = useMemo(
    () => ({ countryCode: garden?.region?.countryCode ?? null, l3: garden?.region?.l3 ?? null }),
    [garden?.region],
  );
  const report = useMemo(
    () =>
      specimens
        ? lensReport(
            specimens
              .filter((s) => s.deletedAt === null && s.status !== 'archived' && s.status !== 'dead')
              .map((s) => ({
                id: s.id,
                name: s.displayName,
                taxon: s.catalogTaxonId ? (taxonById(s.catalogTaxonId) ?? null) : null,
                identityLevel: s.identityLevel,
              })),
            region,
          )
        : null,
    [specimens, region],
  );

  if (garden === undefined || !report)
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

  return (
    <Page>
      <PageHeader title={m.lens.title} description={m.lens.intro} />
      {region.countryCode ? (
        <p className="mt-2 text-body-s text-muted">{m.lens.region(regionName(region.countryCode, locale))}</p>
      ) : (
        <Notice className="mt-3" tone="warning">
          {m.lens.noRegion}
        </Notice>
      )}
      {report.entries.length === 0 ? (
        <EmptyState className="mt-8" title={m.lens.noPlants} />
      ) : (
        <>
          <p className="mt-4 text-body-s text-ink" data-testid="lens-counts">
            {m.lens.counts(report.counts)}
          </p>
          <ul className="mt-4 flex flex-col gap-2" data-testid="lens">
            {report.entries.map((e) => (
              <li key={e.id}>
                <Card className="flex flex-col gap-2 text-body-s" data-status={e.status}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-ink">{e.name}</span>
                    <Badge tone={TONE[e.status]}>{m.lens.status[e.status]}</Badge>
                    {e.taxonId && (
                      <Link
                        to="/species/$taxonKey"
                        params={{ taxonKey: e.taxonId }}
                        className="text-caption text-accent-ink underline"
                      >
                        {taxonById(e.taxonId)?.scientificName}
                      </Link>
                    )}
                  </div>
                  {e.status === 'UNKNOWN' && e.unknownReason && (
                    <p className="text-muted">{m.lens.unknownWhy[e.unknownReason]}</p>
                  )}
                  {e.status === 'INVASIVE_LISTED' && <Notice tone="danger">{m.lens.invasiveAdvice}</Notice>}
                  {e.cultivarNote && <p className="text-muted">{m.lens.cultivar}</p>}
                  {e.matrix.length > 0 && (
                    <details>
                      <summary className="cursor-pointer text-caption text-muted">{m.lens.matrix}</summary>
                      <ul className="mt-1 flex flex-col gap-1 text-caption">
                        {e.matrix.map((r, i) => {
                          const src = sourceLabel(r.sourceId);
                          return (
                            <li key={i} className="flex flex-wrap gap-1.5">
                              <span className="text-ink">{m.lens.status[r.status]}</span>
                              <span className="text-muted">· {r.region.replace('L3:', '')}</span>
                              <span className="text-muted">
                                ·{' '}
                                {src?.url ? (
                                  <a
                                    href={src.url}
                                    target="_blank"
                                    rel="noreferrer noopener"
                                    className="underline"
                                  >
                                    {src.title}
                                  </a>
                                ) : (
                                  (src?.title ?? r.sourceId)
                                )}
                              </span>
                              <span className="text-muted">
                                · {r.review === 'reviewed' ? m.lens.reviewed : m.lens.draft}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    </details>
                  )}
                </Card>
              </li>
            ))}
          </ul>
        </>
      )}
    </Page>
  );
}
