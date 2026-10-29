import { addDays, dueInstant, type GardenAlert } from '@plantpal/domain';
import type { Garden, TaskLog } from '@plantpal/schemas';
import { Badge, Button, Card, Notice, NumberInput, Section, Sheet } from '@plantpal/ui';
import { Bug, CalendarClock, Check, Droplets, Flame, Snowflake, Sprout, Scissors, Wheat } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { logTask, voidTask, type TaskInput } from '../../data/commands';
import { useFormat, useT } from '../../i18n';
import { usePrefs } from '../../state/prefs';
import { reportError } from '../garden/errors';
import { RadioChips } from '../plan/RadioChips';
import { useCareT } from './messages';
import { useCare, type CareTask } from './useCare';

const ICON: Record<string, ReactNode> = {
  'check-water': <Droplets className="size-5 text-info" aria-hidden="true" />,
  water: <Droplets className="size-5 text-info" aria-hidden="true" />,
  feed: <Sprout className="size-5 text-accent-ink" aria-hidden="true" />,
  prune: <Scissors className="size-5 text-clay" aria-hidden="true" />,
  'pest-check': <Bug className="size-5 text-clay" aria-hidden="true" />,
  harvest: <Wheat className="size-5 text-pollen-700" aria-hidden="true" />,
  custom: <Check className="size-5 text-muted" aria-hidden="true" />,
};

function kindOf(task: CareTask): TaskLog['kind'] {
  return task.type === 'water' ? 'check-water' : task.occ.kind;
}

function useDayName() {
  const fmt = useFormat();
  const m = useCareT();
  return (date: string, today: string) => {
    if (date === today) return m.dueToday;
    return fmt.date(new Date(`${date}T12:00:00Z`), {
      weekday: 'long',
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    });
  };
}

function AlertCard({ alert, today }: { alert: GardenAlert; today: string }) {
  const m = useCareT();
  const fmt = useFormat();
  const day =
    alert.date === today
      ? m.dueToday
      : fmt.date(new Date(`${alert.date}T12:00:00Z`), { weekday: 'long', timeZone: 'UTC' });
  const temp = `${fmt.number(alert.valueC)} °C`;
  const frost = alert.kind === 'frost';
  return (
    <Card
      padding="md"
      className={frost ? 'border-info' : 'border-warning'}
      data-testid={`alert-${alert.kind}`}
    >
      <div className="flex items-start gap-3">
        {frost ? (
          <Snowflake className="mt-0.5 size-6 text-info" aria-hidden="true" />
        ) : (
          <Flame className="mt-0.5 size-6 text-warning" aria-hidden="true" />
        )}
        <div className="min-w-0 flex-1">
          <h3 className="text-body font-semibold text-ink">
            {frost ? m.frostTitle(day, temp) : m.heatTitle(day, temp)}
          </h3>
          <p className="text-caption text-muted">
            {frost
              ? m.frostNote
              : m.heatNote(alert.climatologyC === null ? null : `${fmt.number(alert.climatologyC)} °C`)}{' '}
            {m.alertGuidance}
          </p>
          <ul className="mt-3 flex flex-col gap-1 text-body-s">
            {alert.actions.map((a) => (
              <li key={a} className="flex gap-2">
                <Check className="mt-0.5 size-4 shrink-0 text-accent-ink" aria-hidden="true" />
                {m.actions[a]}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-caption font-medium text-ink">{m.affected}</p>
          <ul className="mt-1 flex flex-wrap gap-1.5">
            {alert.affected.map((p) => (
              <li key={p.specimenId}>
                <Badge tone={p.reason === 'unknown' ? 'neutral' : 'warning'}>
                  {p.name} · {m.reasons[p.reason]}
                </Badge>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Card>
  );
}

function CheckSheet({
  open,
  onOpenChange,
  task,
  garden,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  task: CareTask;
  garden: Garden;
}) {
  const m = useCareT();
  const t = useT();
  const [soil, setSoil] = useState<'dry' | 'moist' | 'wet' | null>(null);
  const [leaves, setLeaves] = useState<'fine' | 'droopy' | 'yellowing' | 'spots' | null>(null);
  const [pests, setPests] = useState<'none' | 'seen' | null>(null);
  const suggested = task.type === 'water' ? task.check.suggestedL : 0.5;
  const [litres, setLitres] = useState<number | null>(Math.round(suggested * 10) / 10);
  const [source, setSource] = useState<'tap' | 'rain' | 'grey' | 'other'>('tap');
  const [busy, setBusy] = useState(false);
  const name = task.specimen?.displayName ?? '';
  const predicted =
    task.type === 'water' && task.check.fractionToday !== null
      ? task.check.fractionToday <= 0.5
        ? 'dry'
        : 'moist'
      : null;
  const base: Omit<TaskInput, 'action'> = {
    gardenId: garden.id,
    occurrenceKey: task.key,
    scheduleId: task.type === 'schedule' ? task.occ.scheduleId : null,
    specimenId: task.specimen?.id ?? null,
    kind: kindOf(task),
    dueAt: task.dueAt,
  };
  const check = { soil, leaves, pests: pests === null ? null : pests === 'seen' };

  const finish = async (water: boolean) => {
    setBusy(true);
    try {
      await logTask({ ...base, action: 'checked', check, predicted });
      if (water) {
        const done = await logTask({
          ...base,
          action: 'done',
          water: { amountMl: litres === null ? null : Math.round(litres * 1000), source },
        });
        toast.success(m.logged, { action: { label: m.undo, onClick: () => void voidTask(done.id) } });
      } else toast.success(m.logged);
      onOpenChange(false);
    } catch (e) {
      reportError(t, e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={m.checkTitle(name)}>
      <div className="flex flex-col gap-5" data-testid="check-sheet">
        <RadioChips
          legend={m.soil}
          value={soil}
          onChange={setSoil}
          options={(['dry', 'moist', 'wet'] as const).map((v) => ({ value: v, label: m.soils[v] }))}
        />
        <RadioChips
          legend={m.leaves}
          value={leaves}
          onChange={setLeaves}
          options={(['fine', 'droopy', 'yellowing', 'spots'] as const).map((v) => ({
            value: v,
            label: m.leafStates[v],
          }))}
        />
        <RadioChips
          legend={m.pests}
          value={pests}
          onChange={setPests}
          options={(['none', 'seen'] as const).map((v) => ({ value: v, label: m.pestStates[v] }))}
        />
        {soil && (
          <Notice
            tone={soil === 'dry' ? 'info' : 'success'}
            title={
              soil === 'dry'
                ? m.suggestDry(String(litres ?? suggested))
                : soil === 'moist'
                  ? m.suggestMoist
                  : m.suggestWet
            }
          >
            {leaves === 'droopy' && soil === 'wet' ? <p>{m.suggestDroopyWet}</p> : null}
            {leaves === 'spots' || pests === 'seen' ? <p>{m.suggestSpots}</p> : null}
          </Notice>
        )}
        {soil === 'dry' && (
          <div className="flex flex-col gap-4">
            <NumberInput
              label={m.waterAmount}
              value={litres}
              onValueChange={setLitres}
              min={0}
              max={200}
              step={0.1}
              unit="L"
              className="max-w-xs"
            />
            <RadioChips
              legend={m.waterSource}
              value={source}
              onChange={setSource}
              options={(['tap', 'rain', 'grey', 'other'] as const).map((v) => ({
                value: v,
                label: m.sources[v],
              }))}
              hint={source === 'grey' ? m.greyHint : undefined}
            />
          </div>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          {soil === 'dry' ? (
            <Button onClick={() => void finish(true)} disabled={busy}>
              <Droplets className="size-4" aria-hidden="true" />
              {m.logWater}
            </Button>
          ) : (
            <Button onClick={() => void finish(false)} disabled={busy || soil === null}>
              <Check className="size-4" aria-hidden="true" />
              {m.noWaterNeeded}
            </Button>
          )}
        </div>
      </div>
    </Sheet>
  );
}

function TaskCard({ task, garden, today }: { task: CareTask; garden: Garden; today: string }) {
  const m = useCareT();
  const t = useT();
  const fmt = useFormat();
  const dayName = useDayName();
  const [checking, setChecking] = useState(false);
  const [menu, setMenu] = useState<'skip' | 'snooze' | null>(null);
  const kind = kindOf(task);
  const date = task.type === 'water' ? task.check.checkBy : task.occ.date;
  const overdue = date < today;
  const name = task.specimen?.displayName ?? (task.type === 'schedule' ? task.occ.title : '');
  const title =
    task.type === 'schedule' && task.occ.kind === 'custom' && task.occ.title ? task.occ.title : m.kinds[kind];
  const base = {
    gardenId: garden.id,
    occurrenceKey: task.key,
    scheduleId: task.type === 'schedule' ? task.occ.scheduleId : null,
    specimenId: task.specimen?.id ?? null,
    kind,
    dueAt: task.dueAt,
  };
  const act = async (input: Omit<TaskInput, keyof typeof base>, message: string) => {
    try {
      const log = await logTask({ ...base, ...input });
      setMenu(null);
      toast.success(message, { action: { label: m.undo, onClick: () => void voidTask(log.id) } });
    } catch (e) {
      reportError(t, e);
    }
  };
  const tomorrow = addDays(today, 1);

  return (
    <Card as="li" padding="sm" className="flex flex-col gap-2" data-testid="task" data-kind={kind}>
      <div className="flex items-start gap-3">
        {ICON[kind]}
        <div className="min-w-0 flex-1">
          <p className="text-body font-semibold text-ink">
            {title}
            {name ? <span className="font-normal text-muted"> · {name}</span> : null}
          </p>
          <p className="flex items-center gap-1 text-caption text-muted">
            <CalendarClock className="size-3.5" aria-hidden="true" />
            {overdue ? <span className="font-medium text-warning">{m.overdue}</span> : null}
            {task.type === 'water' ? m.checkBy(dayName(date, today)) : dayName(date, today)}
          </p>
          {task.type === 'water' && (
            <p className="text-caption text-muted">
              {task.check.fractionToday === null
                ? m.waterNever
                : m.waterHint(Math.round(task.check.fractionToday * 100))}
            </p>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {kind === 'check-water' ? (
          <Button
            size="sm"
            aria-label={name ? `${m.check}: ${name}` : m.check}
            onClick={() => setChecking(true)}
          >
            {m.check}
          </Button>
        ) : (
          <Button
            size="sm"
            aria-label={`${m.done}: ${title}${name ? ` · ${name}` : ''}`}
            onClick={() => void act({ action: 'done' }, m.logged)}
          >
            {m.done}
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          aria-expanded={menu === 'skip'}
          onClick={() => setMenu(menu === 'skip' ? null : 'skip')}
        >
          {m.skip}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          aria-expanded={menu === 'snooze'}
          onClick={() => setMenu(menu === 'snooze' ? null : 'snooze')}
        >
          {m.snooze}
        </Button>
      </div>
      {menu === 'skip' && (
        <div className="flex flex-wrap gap-2">
          {(['rained', 'moist', 'away', 'other'] as const).map((r) => (
            <Button
              key={r}
              size="sm"
              variant="secondary"
              onClick={() => void act({ action: 'skipped', reason: r }, m.skipped)}
            >
              {m.skipReasons[r]}
            </Button>
          ))}
        </div>
      )}
      {menu === 'snooze' && (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              void act({ action: 'snoozed', snoozeUntil: Date.now() + 3 * 3_600_000 }, m.snoozed)
            }
          >
            {m.snoozeLater}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              void act(
                { action: 'snoozed', snoozeUntil: dueInstant(tomorrow, '08:00', garden.timezone) },
                m.snoozed,
              )
            }
          >
            {m.snoozeTomorrow} (
            {fmt.time(new Date(dueInstant(tomorrow, '08:00', garden.timezone)), garden.timezone)})
          </Button>
        </div>
      )}
      {checking && <CheckSheet open={checking} onOpenChange={setChecking} task={task} garden={garden} />}
    </Card>
  );
}

/** Today's care cockpit (§6.6): alerts → welcome back → overdue and due today → this week. */
export function CareCockpit({ garden }: { garden: Garden }) {
  const m = useCareT();
  const fmt = useFormat();
  const locale = usePrefs((s) => s.locale);
  const care = useCare(garden);
  const dayName = useDayName();
  if (!care) return null;
  const { dueNow, thisWeek, alerts, queue, today } = care;
  const nothing = dueNow.length === 0 && alerts.length === 0 && !queue.welcomeBack;
  const weekByDay = new Map<string, CareTask[]>();
  for (const task of thisWeek) {
    const d = task.type === 'water' ? task.check.checkBy : task.occ.date;
    weekByDay.set(d, [...(weekByDay.get(d) ?? []), task]);
  }

  return (
    <div className="flex flex-col gap-6" data-testid="care-cockpit">
      <Section title={m.needsAttention}>
        {care.forecastStale && <p className="text-caption text-muted">{m.staleForecast}</p>}
        {alerts.map((a) => (
          <AlertCard key={`${a.kind}-${a.date}`} alert={a} today={today} />
        ))}
        {queue.welcomeBack && (
          <Notice tone="info" title={m.welcomeTitle(queue.welcomeBack.daysAway)}>
            <p>{m.welcomeBody}</p>
            <ul className="mt-2 flex flex-col gap-1">
              {queue.welcomeBack.checks.map((c, i) => (
                <li key={i} className="text-body-s">
                  {c.missed[0]?.title || m.kinds[c.missed[0]?.kind ?? 'custom']} · {m.missed(c.missed.length)}
                </li>
              ))}
            </ul>
          </Notice>
        )}
        {nothing ? (
          <p className="text-body-s text-muted">{m.allDone}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {dueNow.map((task) => (
              <TaskCard key={task.key} task={task} garden={garden} today={today} />
            ))}
          </ul>
        )}
      </Section>
      {weekByDay.size > 0 && (
        <Section title={m.thisWeek} headingLevel={3}>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4" aria-label={m.thisWeek}>
            {[...weekByDay.entries()].map(([d, tasks]) => (
              <li key={d} className="min-w-0 rounded-md border border-line bg-surface p-3">
                <p className="text-caption font-semibold text-ink">{dayName(d, today)}</p>
                <ul className="mt-1 flex flex-col gap-0.5 text-caption text-muted">
                  {tasks.slice(0, 4).map((task) => (
                    <li key={task.key} className="truncate">
                      {m.kinds[kindOf(task)]}
                      {task.specimen ? ` · ${task.specimen.displayName}` : ''}
                    </li>
                  ))}
                  {tasks.length > 4 && <li>+{fmt.number(tasks.length - 4)}</li>}
                </ul>
              </li>
            ))}
          </ul>
          <p className="text-caption text-subtle" lang={locale}>
            {m.waterChecksNote}
          </p>
        </Section>
      )}
    </div>
  );
}
