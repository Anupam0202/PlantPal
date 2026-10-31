import { Link } from '@tanstack/react-router';
import { Badge, cn, IconButton } from '@plantpal/ui';
import type { Specimen } from '@plantpal/schemas';
import {
  Bug,
  CalendarSearch,
  Droplets,
  Flower2,
  Leaf,
  NotebookPen,
  Ruler,
  Scissors,
  ShoppingBasket,
  Sprout,
  Trash2,
  Wrench,
} from 'lucide-react';
import { toast } from 'sonner';
import { restoreEntry, voidEntry } from '../../data/commands';
import type { TimelineItem } from '../../data/queries';
import { useT } from '../../i18n';
import { reportError } from './errors';
import { useLocalDayLabel, useUnits } from './format';
import { MediaStrip } from './Media';

const TABLE = { care: 'careEvents', observation: 'observations', harvest: 'harvests' } as const;

function EntryIcon({ item }: { item: TimelineItem }) {
  const c = 'size-4.5';
  if (item.type === 'harvest') return <ShoppingBasket className={c} />;
  if (item.type === 'care') {
    switch (item.record.kind) {
      case 'water':
        return <Droplets className={c} />;
      case 'prune':
        return <Scissors className={c} />;
      case 'feed':
      case 'mulch':
        return <Leaf className={c} />;
      default:
        return <Wrench className={c} />;
    }
  }
  switch (item.record.kind) {
    case 'milestone':
      return item.record.milestone === 'first-flower' ? <Flower2 className={c} /> : <Sprout className={c} />;
    case 'measurement':
      return <Ruler className={c} />;
    case 'pest':
    case 'disease':
      return <Bug className={c} />;
    default:
      return <NotebookPen className={c} />;
  }
}

function TimelineEntry({
  item,
  plantName,
  showPlant,
}: {
  item: TimelineItem;
  plantName?: string;
  showPlant: boolean;
}) {
  const t = useT();
  const u = useUnits();

  let title: string;
  const details: string[] = [];
  let notes = '';
  let mediaIds: readonly string[] = [];
  if (item.type === 'care') {
    const r = item.record;
    title = t.labels.care[r.kind];
    if (r.kind === 'water') {
      details.push(r.amountMl === null ? t.journal.amountUnknown : u.water(r.amountMl));
      if (r.waterSource) details.push(t.labels.waterSource[r.waterSource]);
    }
    notes = r.notes;
    mediaIds = r.mediaIds;
  } else if (item.type === 'observation') {
    const r = item.record;
    title = r.title || (r.milestone ? t.labels.milestone[r.milestone] : t.labels.observation[r.kind]);
    if (r.kind === 'milestone' && r.milestone && r.title) details.push(t.labels.milestone[r.milestone]);
    const v = r.values;
    if (v.heightCm !== undefined) details.push(`${t.journal.height} ${u.length(v.heightCm)}`);
    if (v.spreadCm !== undefined) details.push(`${t.journal.spread} ${u.length(v.spreadCm)}`);
    if (v.leafCount !== undefined) details.push(`${t.journal.leaves} ${v.leafCount}`);
    if (v.flowerCount !== undefined) details.push(`${t.journal.flowers} ${v.flowerCount}`);
    if (v.fruitCount !== undefined) details.push(`${t.journal.fruits} ${v.fruitCount}`);
    if (r.weather?.description || r.weather?.temperatureC != null) {
      details.push(
        t.journal.weatherNote(
          [r.weather.temperatureC != null ? `${r.weather.temperatureC} °C` : '', r.weather.description ?? '']
            .filter(Boolean)
            .join(', '),
        ),
      );
    }
    notes = r.notes;
    mediaIds = r.mediaIds;
  } else {
    const r = item.record;
    title = `${t.journal.harvested}: ${r.plantName}`;
    if (r.massG !== null) details.push(u.mass(r.massG));
    if (r.count !== null) details.push(`${r.count}${r.countLabel ? ` ${r.countLabel}` : ''}`);
    if (r.massG === null && r.count === null) details.push(t.journal.amountUnknown);
    if (r.original && r.massG === null && r.count === null && r.original.quantity !== null)
      details.push(t.journal.asRecorded(`${r.original.quantity} ${r.original.unit}`));
    notes = r.notes;
  }

  const remove = async () => {
    try {
      await voidEntry(TABLE[item.type], item.id);
      toast(t.journal.removed, {
        action: { label: t.common.undo, onClick: () => void restoreEntry(TABLE[item.type], item.id) },
      });
    } catch (e) {
      reportError(t, e);
    }
  };

  return (
    <li className="relative flex gap-3 pb-5 last:pb-0">
      <span
        className="relative z-10 mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-accent-ink"
        aria-hidden="true"
      >
        <EntryIcon item={item} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="font-medium text-ink">{title}</p>
            {showPlant && (
              <p className="text-body-s text-muted">
                {item.specimenId && plantName ? (
                  <Link
                    to="/garden/plants/$specimenId"
                    params={{ specimenId: item.specimenId }}
                    className="underline decoration-line underline-offset-2 hover:text-ink"
                  >
                    {plantName}
                  </Link>
                ) : (
                  t.journal.gardenLevel
                )}
              </p>
            )}
          </div>
          <IconButton label={t.journal.remove} size="icon-sm" variant="ghost" onClick={() => void remove()}>
            <Trash2 className="size-4" aria-hidden="true" />
          </IconButton>
        </div>
        {(details.length > 0 || item.uncertain) && (
          <div className="mt-1 flex flex-wrap gap-1.5">
            {item.uncertain && (
              <Badge tone="warning" icon={<CalendarSearch className="size-3.5" aria-hidden="true" />}>
                {t.journal.dateUnknown}
              </Badge>
            )}
            {details.map((d) => (
              <Badge key={d}>{d}</Badge>
            ))}
          </div>
        )}
        {notes && <p className="mt-1.5 text-body-s whitespace-pre-line text-ink">{notes}</p>}
        {mediaIds.length > 0 && (
          <div className="mt-2">
            <MediaStrip ids={mediaIds} />
          </div>
        )}
      </div>
    </li>
  );
}

/** Journal timeline grouped by garden-local day. */
export function Timeline({
  items,
  specimens,
  timeZone,
  showPlant = true,
  className,
}: {
  items: TimelineItem[];
  specimens?: Specimen[];
  timeZone: string;
  showPlant?: boolean;
  className?: string;
}) {
  const t = useT();
  const dayLabel = useLocalDayLabel(timeZone);
  const names = new Map((specimens ?? []).map((s) => [s.id, s.holding ? t.garden.unlinked : s.displayName]));
  const groups: Array<{ key: string; label: string; items: TimelineItem[] }> = [];
  for (const item of items) {
    const key = item.uncertain ? 'unknown' : item.on;
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(item);
    else
      groups.push({
        key,
        label: key === 'unknown' ? t.journal.dateUnknown : dayLabel(item.on),
        items: [item],
      });
  }
  return (
    <div className={cn('flex flex-col gap-6', className)}>
      {groups.map((g, i) => (
        <section key={`${g.key}-${i}`} aria-labelledby={`day-${g.key}-${i}`}>
          <h3
            id={`day-${g.key}-${i}`}
            className="mb-3 text-caption font-semibold tracking-wide text-muted uppercase"
          >
            {g.label}
          </h3>
          <ol className="relative before:absolute before:top-2 before:bottom-2 before:left-[1.125rem] before:w-px before:bg-line">
            {g.items.map((item) => (
              <TimelineEntry
                key={item.id}
                item={item}
                plantName={item.specimenId ? names.get(item.specimenId) : undefined}
                showPlant={showPlant}
              />
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
