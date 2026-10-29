import { taxonById } from '@plantpal/catalog';
import { addDays, defaultSchedules, todayIn, trait, type ScheduleDraft } from '@plantpal/domain';
import type { CareSchedule, Garden, Specimen } from '@plantpal/schemas';
import { Badge, Button, Card, TextField } from '@plantpal/ui';
import { Sprout } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { createSchedule, deleteSchedule, markPlanted, updateSchedule } from '../../data/commands';
import { useSchedules } from '../../data/queries';
import { useFormat, useT } from '../../i18n';
import { reportError } from '../garden/errors';
import { useCareT } from './messages';

export function draftsFor(specimen: Specimen, plantedOn: string, today: string): ScheduleDraft[] {
  const taxon = specimen.catalogTaxonId ? taxonById(specimen.catalogTaxonId) : undefined;
  const dtm = taxon ? trait(taxon, 'daysToMaturity') : null;
  return defaultSchedules(
    {
      specimenId: specimen.id,
      useGroup: taxon ? trait(taxon, 'useGroup') : null,
      foodValue: taxon ? trait(taxon, 'foodValue') : null,
      plantedOn,
      daysToMaturityMin: dtm?.min ?? null,
    },
    today,
  );
}

function RuleText({ s }: { s: CareSchedule }) {
  const m = useCareT();
  const fmt = useFormat();
  const unit = s.rule.freq === 'daily' ? 'day' : s.rule.freq === 'weekly' ? 'week' : 'month';
  return (
    <span>
      {m.every(s.rule.interval, unit)} ·{' '}
      {m.from(
        fmt.date(new Date(`${s.rule.startOn}T12:00:00Z`), {
          day: 'numeric',
          month: 'short',
          timeZone: 'UTC',
        }),
      )}
    </span>
  );
}

/** Care on the plant page: plant a planned specimen, or see and adjust its schedules. */
export function CarePanel({ specimen, garden }: { specimen: Specimen; garden: Garden }) {
  const m = useCareT();
  const t = useT();
  const fmt = useFormat();
  const schedules = useSchedules(garden.id)?.filter((s) => s.specimenId === specimen.id);
  const today = todayIn(garden.timezone);
  const [plantedOn, setPlantedOn] = useState(today);
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<unknown>, message?: string) => {
    setBusy(true);
    try {
      await fn();
      if (message) toast.success(message);
    } catch (e) {
      reportError(t, e);
    } finally {
      setBusy(false);
    }
  };

  if (specimen.holding) return null;

  return (
    <Card padding="md" className="flex flex-col gap-3" data-testid="care-panel">
      <h2 className="text-body-s font-semibold text-ink">{m.care}</h2>
      {specimen.status === 'planned' ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <TextField
            label={m.plantedOn}
            type="date"
            value={plantedOn}
            onValueChange={setPlantedOn}
            max={today}
            className="max-w-xs"
          />
          <Button
            disabled={busy || !plantedOn}
            onClick={() =>
              void run(
                () =>
                  markPlanted(
                    specimen.id,
                    specimen.version,
                    plantedOn,
                    draftsFor(specimen, plantedOn, today),
                  ),
                m.plantedToast,
              )
            }
          >
            <Sprout className="size-4" aria-hidden="true" />
            {m.markPlanted}
          </Button>
        </div>
      ) : (
        <>
          <h3 className="text-caption font-medium text-muted">{m.schedules}</h3>
          {schedules && schedules.length > 0 ? (
            <ul className="flex flex-col divide-y divide-line">
              {schedules.map((s) => {
                const paused = s.pausedUntil !== null && s.pausedUntil >= today;
                return (
                  <li key={s.id} className="flex flex-wrap items-center gap-2 py-2 text-body-s">
                    <span className="font-medium text-ink">
                      {s.kind === 'custom' && s.title ? s.title : m.kinds[s.kind]}
                    </span>
                    <span className="text-muted">
                      <RuleText s={s} />
                    </span>
                    <Badge tone={s.origin === 'engine' ? 'neutral' : 'accent'}>
                      {s.origin === 'engine' ? m.fromTraits : m.edited}
                    </Badge>
                    {paused && (
                      <Badge tone="warning">
                        {m.pausedUntil(
                          fmt.date(new Date(`${s.pausedUntil}T12:00:00Z`), {
                            day: 'numeric',
                            month: 'short',
                            timeZone: 'UTC',
                          }),
                        )}
                      </Badge>
                    )}
                    <span className="flex-1" />
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() =>
                        void run(() =>
                          updateSchedule(s.id, s.version, { pausedUntil: paused ? null : addDays(today, 7) }),
                        )
                      }
                    >
                      {paused ? m.resume : m.pause}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => void run(() => deleteSchedule(s.id, s.version))}
                    >
                      {m.remove}
                    </Button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="flex flex-col items-start gap-2">
              <p className="text-body-s text-muted">{m.noSchedules}</p>
              {specimen.status === 'active' && (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      for (const d of draftsFor(specimen, specimen.plantedOn ?? today, today)) {
                        const { byWeekday, ...rule } = d.rule;
                        await createSchedule(garden.id, {
                          specimenId: specimen.id,
                          zoneId: specimen.zoneId,
                          kind: d.kind,
                          title: '',
                          rule: { ...rule, ...(byWeekday ? { byWeekday: [...byWeekday] } : {}) },
                          origin: 'engine',
                        });
                      }
                    })
                  }
                >
                  {m.addDefaults}
                </Button>
              )}
            </div>
          )}
          <p className="text-caption text-subtle">{m.waterChecksNote}</p>
        </>
      )}
    </Card>
  );
}
