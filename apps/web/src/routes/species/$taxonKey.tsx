import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { nativeStatusOf, todayIn } from '@plantpal/domain';
import { TOXICITY_GROUPS } from '@plantpal/schemas';
import {
  Badge,
  Button,
  buttonClasses,
  Card,
  EmptyState,
  EvidenceBadge,
  PageHeader,
  Section,
  TaxonName,
} from '@plantpal/ui';
import { ExternalLink, Sprout, Sun } from 'lucide-react';
import { toast } from 'sonner';
import { Page } from '../../app/Page';
import { createSpecimen } from '../../data/commands';
import { useActiveGarden } from '../../data/queries';
import { useSpeciesMatch, useSpeciesMedia, useSpeciesNames } from '../../env/hooks';
import { reportError } from '../../features/garden/errors';
import { sourceLabel, taxonById, taxonName } from '../../features/plan/engine';
import { traitText } from '../../features/species/format';
import { useSpeciesT } from '../../features/species/messages';
import { useT } from '../../i18n';
import { usePrefs } from '../../state/prefs';

export const Route = createFileRoute('/species/$taxonKey')({
  component: SpeciesPage,
});

const TRAIT_ORDER = [
  'lifeform',
  'useGroup',
  'sunHours',
  'indoorLight',
  'minTempC',
  'heatTolerance',
  'heightCm',
  'spreadCm',
  'minContainerL',
  'waterNeed',
  'effort',
  'daysToMaturity',
  'sowSeason',
  'pollinatorValue',
  'foodValue',
  'ornamentalValue',
];

function SpeciesPage() {
  const t = useT();
  const m = useSpeciesT();
  const navigate = useNavigate();
  const locale = usePrefs((s) => s.locale);
  const { taxonKey } = Route.useParams();
  const taxon = taxonById(taxonKey);
  const { garden } = useActiveGarden();
  const match = useSpeciesMatch(taxon?.scientificName ?? null);
  const key = match.data?.resolved ? (match.data.acceptedKey ?? match.data.usageKey) : null;
  const names = useSpeciesNames(key, taxon?.scientificName ?? '');
  const media = useSpeciesMedia(taxon?.scientificName ?? null);

  if (!taxon)
    return (
      <Page>
        <EmptyState
          title={m.noResults}
          action={
            <Link to="/species" className={buttonClasses('primary')}>
              {m.title}
            </Link>
          }
        />
      </Page>
    );

  const region = { countryCode: garden?.region?.countryCode ?? null, l3: garden?.region?.l3 ?? null };
  const status = region.countryCode ? nativeStatusOf(taxon, region) : null;
  const traits = [...taxon.traits].sort(
    (a, b) => TRAIT_ORDER.indexOf(a.trait) - TRAIT_ORDER.indexOf(b.trait),
  );
  const val = (k: string) => {
    const a = taxon.traits.find((x) => x.trait === k);
    return a ? traitText(a, m.levels) : null;
  };
  const unknownGroups = TOXICITY_GROUPS.filter((g) => !taxon.toxicity.some((x) => x.group === g));
  const sourceIds = [
    ...new Set([
      ...taxon.traits.map((x) => x.sourceId),
      ...taxon.toxicity.map((x) => x.sourceId),
      ...taxon.regions.map((x) => x.sourceId),
    ]),
  ];
  const otherNames = [
    ...(names.data?.names[locale] ?? []),
    ...(locale !== 'en' ? (names.data?.names.en ?? []) : []),
  ];

  const grow = async () => {
    if (!garden) {
      toast.error(m.needGarden);
      return;
    }
    try {
      const s = await createSpecimen(garden.id, {
        displayName: taxonName(taxon, locale),
        scientificName: taxon.scientificName,
        cultivar: null,
        identityLevel: 'species',
        origin: 'unknown',
        zoneId: null,
        containerId: null,
        parentSpecimenId: null,
        plantedOn: todayIn(garden.timezone),
        status: 'active',
        notes: '',
        catalogTaxonId: taxon.id,
      });
      toast.success(m.added(s.displayName));
      await navigate({ to: '/garden/plants/$specimenId', params: { specimenId: s.id } });
    } catch (e) {
      reportError(t, e);
    }
  };

  return (
    <Page>
      <PageHeader
        eyebrow={m.family(taxon.family)}
        title={taxonName(taxon, locale)}
        description={<TaxonName scientificName={taxon.scientificName} />}
        actions={
          <>
            <Link to="/plan" className={buttonClasses('secondary')}>
              <Sun className="size-4" aria-hidden="true" />
              {m.findSpot}
            </Link>
            <Button onClick={() => void grow()}>
              <Sprout className="size-4" aria-hidden="true" />
              {m.growThis}
            </Button>
          </>
        }
      />
      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-8">
          <Section title={m.care} headingLevel={2}>
            <Card>
              <ul className="flex flex-col gap-1 text-body-s text-ink">
                {val('sunHours') && (
                  <li>{m.careLines.sun(val('sunHours')!.replace(/ h\/day direct sun$/, ''))}</li>
                )}
                {val('minTempC') && <li>{m.careLines.temp(val('minTempC')!.replace(/ °C$/, ''))}</li>}
                {val('minContainerL') && <li>{m.careLines.pot(val('minContainerL')!.replace(/ L$/, ''))}</li>}
                {val('waterNeed') && <li>{m.careLines.water(val('waterNeed')!)}</li>}
              </ul>
            </Card>
          </Section>

          <Section title={m.facts} description={m.factHint} headingLevel={2}>
            <dl className="grid gap-2 sm:grid-cols-2" data-testid="species-facts">
              {traits.map((a) => (
                <div key={a.trait} className="rounded-md border border-line p-3 text-body-s">
                  <dt className="text-caption text-muted">{a.trait}</dt>
                  <dd className="font-medium text-ink">{traitText(a, m.levels)}</dd>
                  <dd className="mt-1 flex flex-wrap items-center gap-1.5">
                    <EvidenceBadge grade={a.evidence} compact />
                    {a.review === 'needs_review' && <Badge tone="warning">{m.needsReview}</Badge>}
                  </dd>
                </div>
              ))}
            </dl>
          </Section>

          <Section title={m.toxicity} description={m.toxicityHint} headingLevel={2}>
            <ul className="flex flex-col gap-1.5 text-body-s" data-testid="species-toxicity">
              {taxon.toxicity.map((x) => {
                const src = sourceLabel(x.sourceId);
                return (
                  <li key={x.group} className="flex flex-wrap items-center gap-2">
                    <Badge tone={x.status === 'TOXIC' ? 'danger' : 'neutral'}>
                      {x.status === 'TOXIC'
                        ? m.toxic(m.groups[x.group] ?? x.group)
                        : m.nonToxic(m.groups[x.group] ?? x.group)}
                    </Badge>
                    {(x.sourceUrl ?? src?.url) && (
                      <a
                        href={x.sourceUrl ?? src?.url ?? undefined}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-caption text-accent-ink underline"
                      >
                        {src?.title ?? x.sourceId}
                      </a>
                    )}
                  </li>
                );
              })}
              {unknownGroups.length > 0 && (
                <li className="text-muted">
                  {m.unknownTox(unknownGroups.map((g) => m.groups[g] ?? g).join(', '))}
                </li>
              )}
            </ul>
          </Section>

          <Section title={m.photos} description={m.photosHint} headingLevel={2}>
            {media.data && media.data.items.length > 0 ? (
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3" data-testid="species-photos">
                {media.data.items.map((p) => (
                  <li key={p.pageUrl}>
                    <figure className="flex flex-col gap-1">
                      <img
                        src={p.thumbUrl}
                        alt={p.title}
                        loading="lazy"
                        className="aspect-square w-full rounded-md object-cover"
                      />
                      <figcaption className="text-caption text-muted">
                        <a href={p.pageUrl} target="_blank" rel="noopener noreferrer" className="underline">
                          {m.photoBy(p.author, p.licence)}
                        </a>
                      </figcaption>
                    </figure>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-body-s text-muted">{media.isPending ? '…' : m.noPhotos}</p>
            )}
          </Section>
        </div>

        <aside className="flex flex-col gap-6">
          <Card className="flex flex-col gap-2 text-body-s">
            <p className="font-medium text-ink">{m.region}</p>
            {status ? (
              <Badge
                tone={status === 'INVASIVE_LISTED' ? 'danger' : status === 'NATIVE' ? 'accent' : 'neutral'}
                className="self-start"
              >
                {m.regionStatus[status]}
              </Badge>
            ) : (
              <p className="text-muted">{m.noRegion}</p>
            )}
          </Card>
          <Card className="flex flex-col gap-2 text-body-s">
            <p className="font-medium text-ink">{m.commonNames}</p>
            <p className="text-ink">
              {[
                taxonName(taxon, locale),
                ...otherNames.filter((n) => n.toLowerCase() !== taxonName(taxon, locale).toLowerCase()),
              ]
                .slice(0, 6)
                .join(', ')}
            </p>
            {names.data?.wikidataId && <p className="text-caption text-muted">{m.namesSource}</p>}
            <p className="text-caption text-muted" data-testid="gbif-status">
              {match.data?.resolved
                ? m.gbifMatched(match.data.scientificName ?? '')
                : match.data
                  ? m.gbifNone
                  : '…'}
            </p>
          </Card>
          <Card className="flex flex-col gap-2 text-body-s">
            <p className="font-medium text-ink">{m.sources}</p>
            <ul className="flex flex-col gap-1">
              {sourceIds.map((id) => {
                const s = sourceLabel(id);
                return (
                  <li key={id}>
                    {s?.url ? (
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-accent-ink underline"
                      >
                        {s.title}
                        <ExternalLink className="size-3" aria-hidden="true" />
                      </a>
                    ) : (
                      <span className="text-ink">{s?.title ?? id}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </Card>
        </aside>
      </div>
    </Page>
  );
}
