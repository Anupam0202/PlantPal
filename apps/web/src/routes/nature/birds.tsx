import { BIRD_PLANNED_S } from '@plantpal/domain';
import type { VisitRecord, VisitWeather } from '@plantpal/schemas';
import {
  Button,
  Card,
  CheckboxField,
  IconButton,
  Notice,
  NumberInput,
  PageHeader,
  TextField,
} from '@plantpal/ui';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { Pause, Play, Plus, Square, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Page } from '../../app/Page';
import { clockNow } from '../../lib/clock';
import { logVisit } from '../../data/commands';
import { useActiveGarden } from '../../data/queries';
import { gardenCoords, useForecast } from '../../env/hooks';
import { reportError } from '../../features/garden/errors';
import { GardenLoading, NoGarden } from '../../features/garden/NoGarden';
import { useNatureT } from '../../features/nature/messages';
import { mmss, useCountdown } from '../../features/nature/useCountdown';
import { EMPTY_WEATHER, weatherFromForecast, WeatherFields } from '../../features/nature/Weather';
import { useT } from '../../i18n';

export const Route = createFileRoute('/nature/birds')({
  component: BirdCount,
});

interface Row {
  key: number;
  name: string;
  count: number | null;
  unsure: boolean;
}

function BirdCount() {
  const t = useT();
  const m = useNatureT();
  const navigate = useNavigate();
  const { garden } = useActiveGarden();
  const forecast = useForecast(gardenCoords(garden));
  const timer = useCountdown(BIRD_PLANNED_S);
  const [rows, setRows] = useState<Row[]>([]);
  const [weather, setWeather] = useState<VisitWeather | null>(null);
  const [busy, setBusy] = useState(false);

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

  const w = weather ?? weatherFromForecast(forecast.data) ?? EMPTY_WEATHER;
  const stage = !timer.startedAt ? 'setup' : timer.done ? 'review' : 'counting';
  const set = (key: number, patch: Partial<Row>) =>
    setRows((r) => r.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  const add = () => setRows((r) => [...r, { key: clockNow() + r.length, name: '', count: 1, unsure: false }]);

  const save = async () => {
    const records: VisitRecord[] = rows
      .filter((r) => r.name.trim())
      .map((r) => ({
        group: 'bird',
        taxonName: r.name.trim().slice(0, 200),
        count: r.count ?? 1,
        state: r.unsure ? 'UNCERTAIN' : 'YES',
        identityConfidence: r.unsure ? 'unsure' : 'confident',
        behaviour: null,
      }));
    setBusy(true);
    try {
      await logVisit({
        gardenId: garden.id,
        protocol: 'bird-count',
        startedAt: timer.startedAt ?? clockNow(),
        plannedS: BIRD_PLANNED_S,
        durationS: timer.elapsedS,
        targetName: '',
        weather: w.temperatureC === null && w.sky === null && w.wind === null ? null : w,
        // Seeing no birds is a result: one "bird: NO" record keeps the zero.
        records: records.length
          ? records
          : [
              {
                group: 'bird',
                taxonName: null,
                count: 0,
                state: 'NO',
                identityConfidence: null,
                behaviour: null,
              },
            ],
      });
      toast.success(m.fit.saved);
      await navigate({ to: '/nature/log' });
    } catch (e) {
      reportError(t, e);
    } finally {
      setBusy(false);
    }
  };

  const list = (
    <ul className="flex flex-col gap-3" data-testid="bird-rows">
      {rows.length === 0 && <li className="text-body-s text-muted">{m.birds.none}</li>}
      {rows.map((r, i) => (
        <li key={r.key} className="grid grid-cols-[minmax(0,1fr)_8rem_auto] items-end gap-2">
          <TextField
            label={`${m.birds.species} ${i + 1}`}
            value={r.name}
            onValueChange={(name) => set(r.key, { name })}
            maxLength={120}
          />
          <NumberInput
            label={m.birds.count}
            value={r.count}
            onValueChange={(count) => set(r.key, { count })}
            min={1}
            max={9999}
          />
          <IconButton
            label={`${m.log.remove} ${i + 1}`}
            variant="ghost"
            onClick={() => setRows((x) => x.filter((y) => y.key !== r.key))}
          >
            <Trash2 className="size-4" aria-hidden="true" />
          </IconButton>
          <div className="col-span-3 -mt-1">
            <CheckboxField
              label={m.fit.unsureFor(`${m.birds.species} ${i + 1}`)}
              checked={r.unsure}
              onCheckedChange={(unsure) => set(r.key, { unsure })}
            />
          </div>
        </li>
      ))}
    </ul>
  );

  return (
    <Page>
      <PageHeader title={m.birds.title} description={m.birds.intro} />
      {stage === 'setup' && (
        <Card className="mt-6 flex flex-col gap-4">
          <WeatherFields value={w} onChange={setWeather} />
          <Button onClick={timer.start}>
            <Play className="size-4" aria-hidden="true" />
            {m.birds.start}
          </Button>
        </Card>
      )}
      {stage === 'counting' && (
        <section className="mt-6 flex flex-col gap-4" aria-label={m.birds.title}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p
              className="tabular text-display-l font-semibold text-ink"
              role="timer"
              data-testid="bird-timer"
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
          {list}
          <Button variant="secondary" className="self-start" onClick={add}>
            <Plus className="size-4" aria-hidden="true" />
            {m.birds.addBird}
          </Button>
        </section>
      )}
      {stage === 'review' && (
        <Card className="mt-6 flex flex-col gap-4">
          <p className="font-medium text-ink">{m.fit.review}</p>
          {timer.elapsedS < BIRD_PLANNED_S && <Notice tone="warning">{m.fit.finishEarlyNote}</Notice>}
          {list}
          <Button variant="secondary" className="self-start" onClick={add}>
            <Plus className="size-4" aria-hidden="true" />
            {m.birds.addBird}
          </Button>
          <Button onClick={() => void save()} disabled={busy}>
            {m.birds.save}
          </Button>
        </Card>
      )}
    </Page>
  );
}
