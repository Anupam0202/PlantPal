import {
  classifyUnit,
  convert,
  FINAL_PANTRY_STATES,
  pantryTotals,
  qty,
  totalsOf,
  todayIn,
  dueSoon,
} from '@plantpal/domain';
import { PANTRY_STATES, type PantryItem, type PantryState } from '@plantpal/schemas';
import {
  Badge,
  Button,
  Card,
  CheckboxField,
  EmptyState,
  NumberInput,
  Section,
  SegmentedControl,
  SelectField,
  TextField,
} from '@plantpal/ui';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { toast } from 'sonner';
import { Page } from '../../app/Page';
import { logHarvest, movePantryItem } from '../../data/commands';
import { useActiveGarden, useHarvests, usePantry, useSpecimens } from '../../data/queries';
import { reportError } from '../../features/garden/errors';
import { GardenHeader } from '../../features/garden/GardenHeader';
import { GardenLoading, NoGarden } from '../../features/garden/NoGarden';
import { useNatureT } from '../../features/nature/messages';
import { useFormat, useT } from '../../i18n';
import { usePrefs } from '../../state/prefs';

export const Route = createFileRoute('/garden/harvest')({
  component: HarvestPage,
});

const OTHER = '__other';
const MASS_UNITS = ['g', 'kg', 'oz', 'lb'] as const;
type MassUnit = (typeof MASS_UNITS)[number];

function totalsLine(
  m: ReturnType<typeof useNatureT>,
  fmt: ReturnType<typeof useFormat>,
  t: ReturnType<typeof totalsOf>,
) {
  const parts: string[] = [];
  if (t.massG > 0) parts.push(m.harvest.totalsMass(fmt.number(Math.round(t.massG / 10) / 100, 2)));
  for (const [label, n] of Object.entries(t.counts)) parts.push(`${fmt.number(n)} ${label}`);
  return parts.join(' · ');
}

function PantryRow({ item }: { item: PantryItem }) {
  const t = useT();
  const m = useNatureT();
  const fmt = useFormat();
  const final = FINAL_PANTRY_STATES.includes(item.state);
  const amount = [
    item.massG !== null ? `${fmt.number(item.massG, Number.isInteger(item.massG) ? 0 : 1)} g` : null,
    item.count !== null ? `${item.count} ${item.countLabel ?? ''}`.trim() : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <li>
      <Card className="flex flex-wrap items-center gap-2 text-body-s" data-testid="pantry-item">
        <span className="font-medium text-ink">{item.name}</span>
        {amount && <span className="text-muted">{amount}</span>}
        <Badge tone={final ? 'neutral' : 'accent'}>{m.harvest.states[item.state]}</Badge>
        {item.bestBefore && !final && (
          <span className="text-caption text-muted">
            {m.harvest.useBy(fmt.date(new Date(`${item.bestBefore}T12:00:00Z`)))}
          </span>
        )}
        {!final && (
          <div className="ml-auto min-w-40">
            <SelectField<string>
              label={`${m.harvest.moveTo}: ${item.name}`}
              value={item.state}
              onValueChange={(s) =>
                void movePantryItem(item.id, item.version, s as PantryState)
                  .then(() => toast.success(m.harvest.moved(m.harvest.states[s as PantryState])))
                  .catch((e: unknown) => reportError(t, e))
              }
              options={PANTRY_STATES.map((s) => ({ value: s, label: m.harvest.states[s] }))}
            />
          </div>
        )}
      </Card>
    </li>
  );
}

function HarvestPage() {
  const t = useT();
  const m = useNatureT();
  const fmt = useFormat();
  const units = usePrefs((s) => s.units);
  const { garden, gardens } = useActiveGarden();
  const specimens = useSpecimens(garden?.id);
  const harvests = useHarvests(garden?.id);
  const pantry = usePantry(garden?.id);
  const [plant, setPlant] = useState<string>(OTHER);
  const [name, setName] = useState('');
  const [by, setBy] = useState<'weight' | 'count'>('weight');
  const [amount, setAmount] = useState<number | null>(null);
  const [unit, setUnit] = useState<MassUnit>(units === 'imperial' ? 'oz' : 'g');
  const [label, setLabel] = useState('pieces');
  const [toPantry, setToPantry] = useState(true);
  const [bestBefore, setBestBefore] = useState('');
  const [busy, setBusy] = useState(false);

  if (garden === undefined || gardens === undefined || !specimens || !harvests || !pantry)
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

  const today = todayIn(garden.timezone);
  const year = harvests.filter((h) => h.harvestedOn.startsWith(today.slice(0, 4)));
  const totals = totalsOf(year);
  const live = specimens.filter((s) => s.deletedAt === null);
  const picked = live.find((s) => s.id === plant) ?? null;
  const soon = dueSoon(pantry, today);
  const byState = pantryTotals(pantry);
  const onHand = pantry.filter((p) => !FINAL_PANTRY_STATES.includes(p.state));
  const finished = pantry.filter((p) => FINAL_PANTRY_STATES.includes(p.state)).slice(0, 10);
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(bestBefore);

  const save = async () => {
    if (amount === null || amount <= 0) return;
    // Weights are stored in grams; counts keep their own label (S1).
    const massG =
      by === 'weight' ? Math.round(convert(qty('mass', amount, unit), 'g').value * 100) / 100 : null;
    const kind = classifyUnit(label);
    setBusy(true);
    try {
      await logHarvest({
        gardenId: garden.id,
        specimenId: picked?.id ?? null,
        plantName: picked?.displayName ?? name.trim(),
        massG,
        count: by === 'count' ? Math.round(amount) : null,
        countLabel: by === 'count' ? (kind.dim === 'count' ? kind.label : label.trim()) || 'pieces' : null,
        notes: '',
        toPantry: toPantry ? { bestBefore: validDate ? bestBefore : null } : undefined,
      });
      toast.success(m.harvest.saved);
      setAmount(null);
      setBestBefore('');
    } catch (e) {
      reportError(t, e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page>
      <GardenHeader garden={garden} gardens={gardens} />
      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex flex-col gap-6">
          <Section title={m.harvest.totals} headingLevel={2}>
            <Card className="flex flex-col gap-1 text-body-s" data-testid="harvest-totals">
              <p className="font-medium text-ink">{totalsLine(m, fmt, totals) || m.harvest.totalsNone}</p>
              {totals.withoutAmount > 0 && (
                <p className="text-muted">{m.harvest.withoutAmount(totals.withoutAmount)}</p>
              )}
              <p className="text-caption text-muted">{m.harvest.countsSeparate}</p>
            </Card>
          </Section>
          {soon.length > 0 && (
            <Card className="flex flex-col gap-1 text-body-s" data-testid="use-soon">
              <p className="font-medium text-ink">{m.harvest.useSoon}</p>
              <p className="text-muted">{soon.map((s) => s.name).join(', ')}</p>
            </Card>
          )}
          <Section title={m.harvest.pantry} headingLevel={2}>
            {onHand.length === 0 ? (
              <EmptyState title={m.harvest.pantryEmpty} />
            ) : (
              <ul className="flex flex-col gap-2" data-testid="pantry">
                {onHand.map((p) => (
                  <PantryRow key={p.id} item={p} />
                ))}
              </ul>
            )}
            {finished.length > 0 && (
              <details className="mt-3">
                <summary className="cursor-pointer text-body-s text-muted">
                  {m.harvest.finished}:{' '}
                  {(['given', 'composted', 'wasted'] as const)
                    .map((s) => (byState[s].entries ? `${m.harvest.states[s]} ${byState[s].entries}` : ''))
                    .filter(Boolean)
                    .join(' · ')}
                </summary>
                <ul className="mt-2 flex flex-col gap-2">
                  {finished.map((p) => (
                    <PantryRow key={p.id} item={p} />
                  ))}
                </ul>
              </details>
            )}
          </Section>
          <Section title={m.harvest.recent} headingLevel={2}>
            <ul className="flex flex-col gap-1 text-body-s" data-testid="harvests">
              {harvests.slice(0, 15).map((h) => (
                <li key={h.id} className="flex flex-wrap gap-2 border-b border-line py-1.5">
                  <span className="text-muted">{fmt.date(new Date(`${h.harvestedOn}T12:00:00Z`))}</span>
                  <span className="text-ink">{h.plantName}</span>
                  <span className="tabular text-muted">{totalsLine(m, fmt, totalsOf([h]))}</span>
                </li>
              ))}
            </ul>
          </Section>
        </div>
        <Section title={m.harvest.log} headingLevel={2}>
          <Card className="flex flex-col gap-4">
            <SelectField<string>
              label={m.harvest.plant}
              value={plant}
              onValueChange={setPlant}
              options={[
                ...live.map((s) => ({ value: s.id, label: s.displayName })),
                { value: OTHER, label: m.harvest.other },
              ]}
            />
            {!picked && (
              <TextField label={m.harvest.name} value={name} onValueChange={setName} maxLength={120} />
            )}
            <div className="flex flex-col gap-1">
              <span className="text-body-s font-medium text-ink">{m.harvest.by}</span>
              <SegmentedControl<'weight' | 'count'>
                label={m.harvest.by}
                value={by}
                onValueChange={setBy}
                options={[
                  { value: 'weight', label: m.harvest.weight },
                  { value: 'count', label: m.harvest.count },
                ]}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <NumberInput
                label={m.harvest.amount}
                value={amount}
                onValueChange={setAmount}
                min={0}
                max={1_000_000}
                step={by === 'weight' ? 0.1 : 1}
              />
              {by === 'weight' ? (
                <SelectField<MassUnit>
                  label={m.harvest.unit}
                  value={unit}
                  onValueChange={setUnit}
                  options={MASS_UNITS.map((u) => ({ value: u, label: u }))}
                />
              ) : (
                <TextField
                  label={m.harvest.label}
                  description={m.harvest.labelHint}
                  value={label}
                  onValueChange={setLabel}
                  maxLength={40}
                />
              )}
            </div>
            <CheckboxField label={m.harvest.toPantry} checked={toPantry} onCheckedChange={setToPantry} />
            {toPantry && (
              <TextField
                label={m.harvest.bestBefore}
                description={m.harvest.bestBeforeHint}
                value={bestBefore}
                onValueChange={setBestBefore}
                type="date"
              />
            )}
            <Button onClick={() => void save()} disabled={busy || !amount || (!picked && !name.trim())}>
              {m.harvest.save}
            </Button>
          </Card>
        </Section>
      </div>
    </Page>
  );
}
