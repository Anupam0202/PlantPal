import { todayIn } from '@plantpal/domain';
import { SEED_LOT_ORIGINS, SEED_LOT_UNITS } from '@plantpal/schemas';
import { Badge, Button, Card, EmptyState, NumberInput, Section, SelectField, TextField } from '@plantpal/ui';
import { createFileRoute, Link } from '@tanstack/react-router';
import { Sprout } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Page } from '../../../app/Page';
import { createSeedLot } from '../../../data/commands';
import { useActiveGarden, useSeedLots, useSpecimens } from '../../../data/queries';
import { reportError } from '../../../features/garden/errors';
import { GardenHeader } from '../../../features/garden/GardenHeader';
import { GardenLoading, NoGarden } from '../../../features/garden/NoGarden';
import { rateLabel, useSeedT } from '../../../features/garden/seedMessages';
import { useFormat, useT } from '../../../i18n';

export const Route = createFileRoute('/garden/seeds/')({
  validateSearch: (search: Record<string, unknown>): { from?: string } =>
    typeof search.from === 'string' ? { from: search.from } : {},
  component: SeedLibrary,
});

const NONE = '__none';
type Origin = (typeof SEED_LOT_ORIGINS)[number];
type Unit = (typeof SEED_LOT_UNITS)[number];

function SeedLibrary() {
  const t = useT();
  const s = useSeedT();
  const fmt = useFormat();
  const { from } = Route.useSearch();
  const { garden, gardens } = useActiveGarden();
  const lots = useSeedLots(garden?.id);
  const specimens = useSpecimens(garden?.id);
  const [adding, setAdding] = useState(Boolean(from));
  const [plantId, setPlantId] = useState(from ?? NONE);
  const parent = specimens?.find((p) => p.id === plantId);
  const [name, setName] = useState(() => '');
  const [origin, setOrigin] = useState<Origin>(from ? 'saved' : 'bought');
  const [collectedOn, setCollectedOn] = useState('');
  const [quantity, setQuantity] = useState<number | null>(null);
  const [unit, setUnit] = useState<Unit>('seeds');
  const [storage, setStorage] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  if (garden === undefined || gardens === undefined || !lots || !specimens)
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

  const plants = specimens.filter((p) => p.deletedAt === null && !p.holding);
  const fallbackName = parent ? `${parent.displayName} seeds` : '';
  const today = todayIn(garden.timezone);

  const save = async () => {
    const lotName = name.trim() || fallbackName;
    if (!lotName) return;
    setBusy(true);
    try {
      await createSeedLot({
        gardenId: garden.id,
        specimenId: plantId === NONE ? null : plantId,
        name: lotName,
        scientificName: null,
        cultivar: parent?.cultivar ?? null,
        origin: plantId === NONE ? origin : 'saved',
        collectedOn: /^\d{4}-\d{2}-\d{2}$/.test(collectedOn) ? collectedOn : null,
        quantity,
        unit,
        storage: storage.trim(),
        notes,
      });
      toast.success(s.saved);
      setAdding(false);
      setName('');
      setQuantity(null);
      setStorage('');
      setNotes('');
    } catch (e) {
      reportError(t, e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page>
      <GardenHeader garden={garden} gardens={gardens} />
      <div className="mt-6 flex flex-col gap-6">
        <Section
          title={s.title}
          headingLevel={2}
          action={
            !adding && (
              <Button size="sm" onClick={() => setAdding(true)}>
                {s.add}
              </Button>
            )
          }
        >
          <p className="mb-4 text-body-s text-muted">{s.intro}</p>
          {adding && (
            <Card className="mb-4 flex flex-col gap-4">
              <h3 className="text-body font-semibold text-ink">{s.addTitle}</h3>
              <SelectField<string>
                label={s.fromPlant}
                value={plantId}
                onValueChange={setPlantId}
                options={[
                  { value: NONE, label: s.noPlant },
                  ...plants.map((p) => ({ value: p.id, label: p.displayName })),
                ]}
              />
              <TextField
                label={s.name}
                value={name}
                placeholder={fallbackName}
                onValueChange={setName}
                maxLength={200}
              />
              {plantId === NONE && (
                <SelectField<Origin>
                  label={s.origin}
                  value={origin}
                  onValueChange={setOrigin}
                  options={SEED_LOT_ORIGINS.filter((o) => o !== 'saved').map((o) => ({
                    value: o,
                    label: s.origins[o],
                  }))}
                />
              )}
              <TextField
                label={s.collectedOn}
                type="date"
                max={today}
                value={collectedOn}
                onValueChange={setCollectedOn}
              />
              <div className="grid grid-cols-2 gap-3">
                <NumberInput label={s.quantity} value={quantity} onValueChange={setQuantity} min={0} />
                <SelectField<Unit>
                  label={s.unit}
                  value={unit}
                  onValueChange={setUnit}
                  options={SEED_LOT_UNITS.map((u) => ({ value: u, label: s.units[u] }))}
                />
              </div>
              <TextField label={s.storage} value={storage} onValueChange={setStorage} maxLength={200} />
              <TextField label={s.notes} value={notes} onValueChange={setNotes} multiline rows={2} />
              <div className="flex flex-wrap gap-2">
                <Button loading={busy} disabled={!(name.trim() || fallbackName)} onClick={() => void save()}>
                  {s.save}
                </Button>
                <Button variant="ghost" onClick={() => setAdding(false)}>
                  {t.common.cancel}
                </Button>
              </div>
            </Card>
          )}
          {lots.length === 0 ? (
            <EmptyState
              illustration={<Sprout className="size-14" strokeWidth={1.25} aria-hidden="true" />}
              title={s.empty}
              description={s.emptyBody}
            />
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {lots.map((lot) => {
                const fromPlant = specimens.find((p) => p.id === lot.specimenId);
                return (
                  <li key={lot.id}>
                    <Link
                      to="/garden/seeds/$lotId"
                      params={{ lotId: lot.id }}
                      className="flex h-full flex-col gap-1 rounded-lg border border-line bg-surface p-4 shadow-1 transition-colors hover:bg-sunken focus-visible:outline-2 focus-visible:outline-focus"
                    >
                      <span className="font-medium text-ink">{lot.name}</span>
                      <span className="text-body-s text-muted">
                        {fromPlant ? `${s.fromPlant}: ${fromPlant.displayName}` : s.origins[lot.origin]}
                        {lot.quantity !== null && ` · ${fmt.number(lot.quantity)} ${s.units[lot.unit]}`}
                      </span>
                      <Badge
                        tone={lot.germinationTests.length ? 'accent' : 'neutral'}
                        className="mt-1 self-start"
                      >
                        {rateLabel(s, lot)}
                      </Badge>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>
      </div>
    </Page>
  );
}
