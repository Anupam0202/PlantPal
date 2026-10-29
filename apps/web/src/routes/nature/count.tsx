import { fitWeatherOk, FIT_PLANNED_S, visitTotals } from '@plantpal/domain';
import { FIT_GROUPS, type FitGroup, type VisitRecord, type VisitWeather } from '@plantpal/schemas';
import {
  Button,
  Card,
  CheckboxField,
  IconButton,
  Notice,
  NumberInput,
  PageHeader,
  SelectField,
  TextField,
} from '@plantpal/ui';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { ExternalLink, Minus, Pause, Play, Square } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Page } from '../../app/Page';
import { clockNow } from '../../lib/clock';
import { logVisit } from '../../data/commands';
import { useActiveGarden, useSpecimens } from '../../data/queries';
import { gardenCoords, useForecast } from '../../env/hooks';
import { reportError } from '../../features/garden/errors';
import { GardenLoading, NoGarden } from '../../features/garden/NoGarden';
import { POMS_URL, useNatureT } from '../../features/nature/messages';
import { plantsByBloomNow } from '../../features/nature/useBloomNow';
import { mmss, useCountdown } from '../../features/nature/useCountdown';
import { EMPTY_WEATHER, weatherFromForecast, WeatherFields } from '../../features/nature/Weather';
import { useT } from '../../i18n';

export const Route = createFileRoute('/nature/count')({
  component: FitCount,
});

const OTHER = '__other';
const zeroCounts = () => Object.fromEntries(FIT_GROUPS.map((g) => [g, 0])) as Record<FitGroup, number>;

function FitCount() {
  const t = useT();
  const m = useNatureT();
  const navigate = useNavigate();
  const { garden } = useActiveGarden();
  const specimens = useSpecimens(garden?.id);
  const forecast = useForecast(gardenCoords(garden));
  const timer = useCountdown(FIT_PLANNED_S);

  const [target, setTarget] = useState<string>('');
  const [otherName, setOtherName] = useState('');
  const [flowers, setFlowers] = useState<number | null>(null);
  const [observers, setObservers] = useState<number | null>(1);
  const [weather, setWeather] = useState<VisitWeather | null>(null);
  const [counts, setCounts] = useState(zeroCounts);
  const [unsure, setUnsure] = useState<Partial<Record<FitGroup, boolean>>>({});
  const [busy, setBusy] = useState(false);

  const plants = useMemo(
    () => (garden && specimens ? plantsByBloomNow(garden, specimens) : []),
    [garden, specimens],
  );
  useEffect(() => {
    if (!target && plants[0]) setTarget(plants[0].specimen.id);
    else if (!target && specimens && plants.length === 0) setTarget(OTHER);
  }, [target, plants, specimens]);
  const prefill = weatherFromForecast(forecast.data);
  const w = weather ?? prefill ?? EMPTY_WEATHER;

  if (garden === undefined || specimens === undefined)
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

  const picked = plants.find((p) => p.specimen.id === target) ?? null;
  const targetName = picked ? picked.specimen.displayName : otherName.trim();
  const weatherOk = fitWeatherOk(w);
  const stage = !timer.startedAt ? 'setup' : timer.done ? 'review' : 'counting';

  const records: VisitRecord[] = FIT_GROUPS.map((g) => ({
    group: g,
    taxonName: null,
    count: counts[g],
    state: counts[g] > 0 ? (unsure[g] ? 'UNCERTAIN' : 'YES') : 'NO',
    identityConfidence: unsure[g] ? 'unsure' : 'confident',
    behaviour: 'visiting-flower',
  }));
  const totals = visitTotals({ records, patchFlowerCount: flowers });

  const bump = (g: FitGroup, d: number) => {
    setCounts((c) => ({ ...c, [g]: Math.max(0, c[g] + d) }));
    if (d > 0) navigator.vibrate?.(10);
  };

  const save = async () => {
    setBusy(true);
    try {
      await logVisit({
        gardenId: garden.id,
        protocol: 'fit-count',
        startedAt: timer.startedAt ?? clockNow(),
        plannedS: FIT_PLANNED_S,
        durationS: timer.elapsedS,
        specimenId: picked?.specimen.id ?? null,
        zoneId: picked?.specimen.zoneId ?? null,
        targetTaxonId: picked?.taxon?.id ?? null,
        targetName,
        patchFlowerCount: flowers,
        weather: w.temperatureC === null && w.sky === null && w.wind === null ? null : w,
        observerCount: observers ?? 1,
        records,
      });
      toast.success(m.fit.saved);
      await navigate({ to: '/nature/log' });
    } catch (e) {
      reportError(t, e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page>
      <PageHeader title={m.fit.title} description={m.fit.intro} />
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

      {stage === 'setup' && (
        <Card className="mt-6 flex flex-col gap-4">
          <SelectField<string>
            label={m.fit.target}
            description={m.fit.targetHint}
            value={target || OTHER}
            onValueChange={setTarget}
            options={[
              ...plants.map((p) => ({
                value: p.specimen.id,
                label: p.bloomingNow ? `${p.specimen.displayName} ✿` : p.specimen.displayName,
              })),
              { value: OTHER, label: m.fit.targetOther },
            ]}
          />
          {!picked && (
            <TextField
              label={m.fit.targetName}
              value={otherName}
              onValueChange={setOtherName}
              maxLength={120}
            />
          )}
          <NumberInput
            label={m.fit.flowers}
            description={m.fit.flowersHint}
            value={flowers}
            onValueChange={setFlowers}
            min={0}
            max={10000}
          />
          <NumberInput
            label={m.fit.observers}
            value={observers}
            onValueChange={setObservers}
            min={1}
            max={50}
          />
          <WeatherFields value={w} onChange={setWeather} />
          {weatherOk === true && <Notice tone="success">{m.fit.weatherOk}</Notice>}
          {weatherOk === false && <Notice tone="warning">{m.fit.weatherPoor}</Notice>}
          <Button onClick={timer.start} disabled={!targetName}>
            <Play className="size-4" aria-hidden="true" />
            {m.fit.start}
          </Button>
        </Card>
      )}

      {stage === 'counting' && (
        <section className="mt-6 flex flex-col gap-4" aria-label={m.fit.title}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p
              className="tabular text-display-l font-semibold text-ink"
              role="timer"
              aria-live="off"
              data-testid="fit-timer"
            >
              {mmss(timer.remainingS)}
            </p>
            <div className="flex gap-2">
              {timer.paused ? (
                <Button variant="secondary" onClick={timer.resume}>
                  <Play className="size-4" aria-hidden="true" />
                  {m.fit.resume}
                </Button>
              ) : (
                <Button variant="secondary" onClick={timer.pause}>
                  <Pause className="size-4" aria-hidden="true" />
                  {m.fit.pause}
                </Button>
              )}
              <Button variant="ghost" onClick={timer.finish}>
                <Square className="size-4" aria-hidden="true" />
                {m.fit.finish}
              </Button>
            </div>
          </div>
          <p className="text-body-s text-muted">
            {m.fit.groupsHelp} {m.fit.wakeLock}
          </p>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3" data-testid="fit-counters">
            {FIT_GROUPS.map((g) => (
              <li key={g} className="relative">
                <button
                  type="button"
                  onClick={() => bump(g, 1)}
                  aria-label={`${m.fit.add(m.groups[g])}: ${counts[g]}`}
                  className="flex min-h-20 w-full flex-col items-start justify-between rounded-lg border border-line bg-surface p-3 text-left shadow-1 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-focus"
                >
                  <span className="text-body-s font-medium text-ink">{m.groups[g]}</span>
                  <span className="tabular text-h2 font-semibold text-accent-ink">{counts[g]}</span>
                </button>
                <IconButton
                  label={m.fit.remove(m.groups[g])}
                  variant="ghost"
                  size="icon-sm"
                  className="absolute right-1 bottom-1"
                  onClick={() => bump(g, -1)}
                  disabled={counts[g] === 0}
                >
                  <Minus className="size-4" aria-hidden="true" />
                </IconButton>
              </li>
            ))}
          </ul>
          <p className="text-caption text-muted">{m.fit.finishEarlyNote}</p>
        </section>
      )}

      {stage === 'review' && (
        <Card className="mt-6 flex flex-col gap-4" data-testid="fit-review">
          <p className="font-medium text-ink">{m.fit.review}</p>
          <p className="text-body-s text-muted">{m.fit.reviewHint}</p>
          {timer.elapsedS < FIT_PLANNED_S && <Notice tone="warning">{m.fit.finishEarlyNote}</Notice>}
          <ul className="flex flex-col gap-3">
            {FIT_GROUPS.map((g) => (
              <li key={g} className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3">
                <NumberInput
                  label={m.groups[g]}
                  value={counts[g]}
                  onValueChange={(v) => setCounts((c) => ({ ...c, [g]: Math.max(0, Math.round(v ?? 0)) }))}
                  min={0}
                  max={999}
                />
                <CheckboxField
                  label={m.fit.unsureFor(m.groups[g])}
                  checked={Boolean(unsure[g])}
                  onCheckedChange={(on) => setUnsure((u) => ({ ...u, [g]: on }))}
                />
              </li>
            ))}
          </ul>
          <p className="font-medium text-ink" data-testid="fit-total">
            {m.fit.total(totals.total)}
            {totals.per100Flowers !== null ? ` · ${m.log.perFlowers(totals.per100Flowers)}` : ''}
          </p>
          {totals.total === 0 && <Notice tone="success">{m.fit.zero}</Notice>}
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void save()} disabled={busy}>
              {m.fit.save}
            </Button>
            <Link to="/nature/log" className="self-center text-body-s text-muted underline">
              {m.hub.log}
            </Link>
          </div>
        </Card>
      )}
    </Page>
  );
}
