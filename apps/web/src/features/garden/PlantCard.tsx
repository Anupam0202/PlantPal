import { Link } from '@tanstack/react-router';
import { Badge, cn, PotIcon, TaxonName, type Tone } from '@plantpal/ui';
import type { Specimen } from '@plantpal/schemas';
import { useMediaUrl } from '../../data/queries';
import { useT } from '../../i18n';

export const STATUS_TONE: Record<Specimen['status'], Tone> = {
  planned: 'info',
  active: 'accent',
  dormant: 'dusk',
  archived: 'neutral',
  dead: 'neutral',
  given_away: 'clay',
};

export function PlantCard({ specimen, zoneName }: { specimen: Specimen; zoneName?: string }) {
  const t = useT();
  const cover = useMediaUrl(specimen.coverMediaId);
  return (
    <Link
      to="/garden/plants/$specimenId"
      params={{ specimenId: specimen.id }}
      className={cn(
        'group flex h-full flex-col overflow-hidden rounded-lg border border-line bg-surface shadow-1 transition-[box-shadow,translate] duration-200 hover:-translate-y-0.5 hover:shadow-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
        specimen.status === 'archived' || specimen.status === 'dead' ? 'opacity-80' : '',
      )}
    >
      <div className="relative aspect-[4/3] bg-sunken">
        {cover ? (
          <img src={cover} alt="" className="size-full object-cover" loading="lazy" decoding="async" />
        ) : (
          <div className="flex size-full items-center justify-center text-accent-ink/60" aria-hidden="true">
            <PotIcon className="size-14" />
          </div>
        )}
        <Badge tone={STATUS_TONE[specimen.status]} className="absolute top-2 left-2 shadow-1">
          {t.labels.status[specimen.status]}
        </Badge>
      </div>
      <div className="flex flex-1 flex-col gap-0.5 p-3">
        <span className="font-display text-h3 leading-tight text-ink group-hover:text-accent-ink">
          {specimen.holding ? t.garden.unlinked : specimen.displayName}
        </span>
        {specimen.scientificName && (
          <TaxonName
            scientificName={specimen.scientificName}
            cultivar={specimen.cultivar ?? undefined}
            className="text-body-s text-muted"
          />
        )}
        {zoneName && <span className="mt-auto pt-1 text-caption text-muted">{zoneName}</span>}
      </div>
    </Link>
  );
}
