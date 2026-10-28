import { Link } from '@tanstack/react-router';
import {
  Badge,
  Button,
  buttonClasses,
  Chip,
  NumberInput,
  SegmentedControl,
  SelectField,
  Sheet,
  TextField,
  Notice,
} from '@plantpal/ui';
import { CARE_KINDS, WATER_SOURCES, type CareKind, type Specimen, type WaterSource } from '@plantpal/schemas';
import { parseQuickCapture, todayIn, type CaptureProposal } from '@plantpal/domain';
import { Camera, Droplets, Leaf, NotebookPen, Scissors, ShoppingBasket, Wand2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { addObservation, deleteMedia, linkMedia, logCare, logHarvest, voidEntry } from '../../data/commands';
import { useActiveGarden, useSpecimens } from '../../data/queries';
import { useT } from '../../i18n';
import { useCapture, type CaptureMode } from '../../state/capture';
import { useDrafts } from '../../state/drafts';
import { reportError } from './errors';
import { useUnits } from './format';
import { PhotoField } from './Media';

const WATER_PRESETS_ML = [250, 500, 1000, 2000, 5000];
const PRIMARY: CaptureMode[] = ['water', 'feed', 'prune', 'note', 'photo', 'harvest'];
const OTHER_CARE = CARE_KINDS.filter((k) => !['water', 'feed', 'prune'].includes(k));

type Created = { table: 'careEvents' | 'observations' | 'harvests'; id: string };

function useWideScreen() {
  const [wide, setWide] = useState(
    () => typeof matchMedia !== 'undefined' && matchMedia('(min-width: 768px)').matches,
  );
  useEffect(() => {
    if (typeof matchMedia === 'undefined') return;
    const mq = matchMedia('(min-width: 768px)');
    const on = () => setWide(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return wide;
}

export function QuickCapture() {
  const t = useT();
  const u = useUnits();
  const { open, mode: presetMode, specimenIds: presetIds, close } = useCapture();
  const { garden } = useActiveGarden();
  const specimens = useSpecimens(garden?.id ?? undefined);
  const wide = useWideScreen();
  const markDirty = useDrafts((s) => s.markDirty);

  const [mode, setMode] = useState<CaptureMode | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [waterMl, setWaterMl] = useState<number | null>(500);
  const [customL, setCustomL] = useState<number | null>(null);
  const [source, setSource] = useState<WaterSource>('tap');
  const [harvestBy, setHarvestBy] = useState<'weight' | 'count'>('weight');
  const [massG, setMassG] = useState<number | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const [countLabel, setCountLabel] = useState('');
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [day, setDay] = useState('');
  const [mediaIds, setMediaIds] = useState<string[]>([]);
  const [freeText, setFreeText] = useState('');
  const [proposals, setProposals] = useState<CaptureProposal[]>([]);
  const [busy, setBusy] = useState(false);

  const tz = garden?.timezone ?? 'UTC';
  const today = todayIn(tz);
  const plants = useMemo(
    () => (specimens ?? []).filter((s) => !s.holding && ['active', 'planned', 'dormant'].includes(s.status)),
    [specimens],
  );

  // Reset whenever the sheet opens.
  useEffect(() => {
    if (!open) return;
    setMode(presetMode);
    setSelected(presetIds);
    setWaterMl(500);
    setCustomL(null);
    setSource('tap');
    setHarvestBy('weight');
    setMassG(null);
    setCount(null);
    setCountLabel('');
    setTitle('');
    setNotes('');
    setDay(today);
    setMediaIds([]);
    setFreeText('');
    setProposals([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on open
  }, [open]);

  // Unsaved entries block a service-worker reload (see UpdatePrompt).
  useEffect(() => (open ? markDirty() : undefined), [open, markDirty]);

  const dismiss = () => {
    for (const id of mediaIds) void deleteMedia(id);
    close();
  };

  const nameOf = (id: string) => plants.find((p) => p.id === id)?.displayName ?? '';

  const toggle = (id: string) =>
    setSelected((cur) =>
      mode === 'harvest'
        ? cur.includes(id)
          ? []
          : [id]
        : cur.includes(id)
          ? cur.filter((x) => x !== id)
          : [...cur, id],
    );

  const saveForm = async (gardenId: string): Promise<Created[]> => {
    const created: Created[] = [];
    const occurredOn = day && day !== today ? day : undefined;
    if (!mode) return created;
    if (mode === 'harvest') {
      const specimenId = selected[0] ?? null;
      const h = await logHarvest({
        gardenId,
        specimenId,
        plantName: specimenId ? nameOf(specimenId) : title.trim() || t.capture.harvest,
        massG: harvestBy === 'weight' ? massG : null,
        count: harvestBy === 'count' ? count : null,
        countLabel: harvestBy === 'count' ? countLabel.trim() || null : null,
        notes,
        occurredOn,
      });
      created.push({ table: 'harvests', id: h.id });
    } else if (mode === 'note' || mode === 'photo') {
      const targets = selected.length > 0 ? selected : [null];
      for (const specimenId of targets) {
        const ob = await addObservation({
          gardenId,
          specimenId,
          kind: mode === 'photo' ? 'photo' : 'note',
          milestone: null,
          title: title.trim(),
          notes,
          occurredOn,
          mediaIds,
        });
        created.push({ table: 'observations', id: ob.id });
        await linkMedia(mediaIds, { entity: 'observation', id: ob.id });
      }
    } else {
      const amount = mode === 'water' ? (customL !== null ? Math.round(customL * 1000) : waterMl) : null;
      const evs = await logCare({
        gardenId,
        specimenIds: selected,
        kind: mode,
        amountMl: amount,
        waterSource: mode === 'water' ? source : null,
        notes,
        occurredOn,
        mediaIds,
      });
      for (const ev of evs) created.push({ table: 'careEvents', id: ev.id });
      if (evs[0]) await linkMedia(mediaIds, { entity: 'careEvent', id: evs[0].id });
    }
    return created;
  };

  const saveProposals = async (gardenId: string): Promise<Created[]> => {
    const created: Created[] = [];
    for (const p of proposals) {
      if (p.type === 'care') {
        const evs = await logCare({
          gardenId,
          specimenIds: p.specimenIds,
          kind: p.kind,
          amountMl: p.amountMl,
          waterSource: null,
          notes: p.text,
        });
        for (const ev of evs) created.push({ table: 'careEvents', id: ev.id });
      } else if (p.type === 'harvest') {
        const specimenId = p.specimenIds[0] ?? null;
        const h = await logHarvest({
          gardenId,
          specimenId,
          plantName: specimenId ? nameOf(specimenId) : (p.plantText ?? t.capture.harvest),
          massG: p.massG,
          count: p.count,
          countLabel: p.countLabel,
          notes: p.text,
        });
        created.push({ table: 'harvests', id: h.id });
      } else {
        const targets = p.specimenIds.length > 0 ? p.specimenIds : [null];
        for (const specimenId of targets) {
          const ob = await addObservation({
            gardenId,
            specimenId,
            kind: 'note',
            milestone: null,
            title: '',
            notes: p.text,
          });
          created.push({ table: 'observations', id: ob.id });
        }
      }
    }
    return created;
  };

  const save = async () => {
    if (!garden) return;
    if (proposals.length === 0 && !mode) {
      toast.error(t.capture.nothing);
      return;
    }
    setBusy(true);
    try {
      const created = proposals.length > 0 ? await saveProposals(garden.id) : await saveForm(garden.id);
      close();
      toast.success(t.capture.saved(created.length), {
        action: {
          label: t.common.undo,
          onClick: () => {
            void Promise.all(created.map((c) => voidEntry(c.table, c.id))).catch((e: unknown) =>
              reportError(t, e),
            );
          },
        },
      });
    } catch (e) {
      reportError(t, e);
    } finally {
      setBusy(false);
    }
  };

  const modeIcon: Partial<Record<CaptureMode, typeof Droplets>> = {
    water: Droplets,
    feed: Leaf,
    prune: Scissors,
    note: NotebookPen,
    photo: Camera,
    harvest: ShoppingBasket,
  };
  const modeLabel = (m: CaptureMode) =>
    m === 'note'
      ? t.capture.observe
      : m === 'photo'
        ? t.capture.photo
        : m === 'harvest'
          ? t.capture.harvest
          : t.labels.care[m];

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => (o ? undefined : dismiss())}
      side={wide ? 'right' : 'bottom'}
      title={t.capture.title}
      description={t.capture.description}
      footer={
        garden ? (
          <>
            <Button type="button" variant="ghost" onClick={dismiss}>
              {t.common.cancel}
            </Button>
            <Button
              type="button"
              onClick={() => void save()}
              loading={busy}
              disabled={!mode && proposals.length === 0}
            >
              {t.common.save}
            </Button>
          </>
        ) : undefined
      }
    >
      {!garden ? (
        <div className="flex flex-col items-start gap-3">
          <p className="text-body text-ink">{t.garden.noGardenBody}</p>
          <Link to="/garden/new" className={buttonClasses('primary')} onClick={close}>
            {t.garden.createGarden}
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {proposals.length > 0 ? (
            <section aria-labelledby="qc-proposals" className="flex flex-col gap-3">
              <h3 id="qc-proposals" className="font-medium text-ink">
                {t.capture.proposals}
              </h3>
              <p className="text-body-s text-muted">{t.capture.proposalsHint}</p>
              <ul className="flex flex-col gap-2">
                {proposals.map((p, i) => (
                  <li key={i} className="flex items-start gap-3 rounded-md border border-line bg-surface p-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-ink">
                        {p.type === 'care'
                          ? t.labels.care[p.kind]
                          : p.type === 'harvest'
                            ? t.capture.harvest
                            : t.capture.observe}
                      </p>
                      <p className="text-body-s text-muted">
                        {p.specimenIds.length > 0
                          ? p.specimenIds.map(nameOf).join(', ')
                          : t.capture.wholeGarden}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {p.type === 'care' && p.kind === 'water' && (
                          <Badge>{p.amountMl === null ? t.journal.amountUnknown : u.water(p.amountMl)}</Badge>
                        )}
                        {p.type === 'harvest' && p.massG !== null && <Badge>{u.mass(p.massG)}</Badge>}
                        {p.type === 'harvest' && p.count !== null && (
                          <Badge>{`${p.count} ${p.countLabel ?? ''}`.trim()}</Badge>
                        )}
                      </div>
                      <p className="mt-1 text-caption text-muted">“{p.text}”</p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setProposals((cur) => cur.filter((_, j) => j !== i))}
                    >
                      <X className="size-4" aria-hidden="true" />
                      {t.capture.discard}
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          ) : (
            <>
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-2 text-body-s font-medium text-ink">{t.capture.what}</legend>
                <div className="flex flex-wrap gap-2">
                  {PRIMARY.map((m) => {
                    const Icon = modeIcon[m];
                    return (
                      <Chip
                        key={m}
                        pressed={mode === m}
                        onPressedChange={(p) => setMode(p ? m : null)}
                        icon={Icon ? <Icon className="size-4" aria-hidden="true" /> : undefined}
                      >
                        {modeLabel(m)}
                      </Chip>
                    );
                  })}
                </div>
                <SelectField
                  label={t.labels.care.other}
                  value={mode && OTHER_CARE.includes(mode as CareKind) ? mode : null}
                  onValueChange={(v) => setMode(v)}
                  options={OTHER_CARE.map((k) => ({ value: k, label: t.labels.care[k] }))}
                  placeholder="—"
                />
              </fieldset>

              <fieldset className="flex flex-col gap-2">
                <legend className="mb-2 text-body-s font-medium text-ink">{t.capture.plants}</legend>
                {plants.length === 0 ? (
                  <p className="text-body-s text-muted">{t.capture.noPlants}</p>
                ) : (
                  <div className="flex max-h-48 flex-wrap gap-2 overflow-y-auto">
                    {plants.map((s: Specimen) => (
                      <Chip key={s.id} pressed={selected.includes(s.id)} onPressedChange={() => toggle(s.id)}>
                        {s.displayName}
                      </Chip>
                    ))}
                  </div>
                )}
              </fieldset>

              {mode === 'water' && (
                <fieldset className="flex flex-col gap-3">
                  <legend className="mb-2 text-body-s font-medium text-ink">{t.capture.amount}</legend>
                  <div className="flex flex-wrap gap-2">
                    {WATER_PRESETS_ML.map((ml) => (
                      <Chip
                        key={ml}
                        pressed={customL === null && waterMl === ml}
                        onPressedChange={() => {
                          setWaterMl(ml);
                          setCustomL(null);
                        }}
                      >
                        {u.water(ml)}
                      </Chip>
                    ))}
                  </div>
                  <NumberInput
                    label={t.capture.custom}
                    value={customL}
                    onValueChange={setCustomL}
                    unit="L"
                    min={0}
                    max={1000}
                    step={0.1}
                  />
                  <SelectField
                    label={t.capture.waterSource}
                    value={source}
                    onValueChange={setSource}
                    options={WATER_SOURCES.map((w) => ({ value: w, label: t.labels.waterSource[w] }))}
                  />
                </fieldset>
              )}

              {mode === 'harvest' && (
                <fieldset className="flex flex-col gap-3">
                  <legend className="mb-2 text-body-s font-medium text-ink">{t.capture.harvestAmount}</legend>
                  <SegmentedControl
                    label={t.capture.harvestAmount}
                    value={harvestBy}
                    onValueChange={setHarvestBy}
                    options={[
                      { value: 'weight', label: t.capture.weight },
                      { value: 'count', label: t.capture.count },
                    ]}
                  />
                  {harvestBy === 'weight' ? (
                    <NumberInput
                      label={t.capture.weight}
                      value={massG}
                      onValueChange={setMassG}
                      unit="g"
                      min={0}
                      max={1000000}
                      step={10}
                    />
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <NumberInput
                        label={t.capture.count}
                        value={count}
                        onValueChange={(v) => setCount(v === null ? null : Math.round(v))}
                        min={0}
                        max={100000}
                        step={1}
                      />
                      <TextField
                        label={t.capture.countLabel}
                        value={countLabel}
                        onValueChange={setCountLabel}
                        maxLength={40}
                      />
                    </div>
                  )}
                  {selected.length === 0 && (
                    <TextField label={t.plant.name} value={title} onValueChange={setTitle} maxLength={200} />
                  )}
                </fieldset>
              )}

              {(mode === 'note' || mode === 'photo') && (
                <TextField label={t.capture.title2} value={title} onValueChange={setTitle} maxLength={200} />
              )}
              {mode && mode !== 'harvest' && (
                <PhotoField
                  gardenId={garden.id}
                  value={mediaIds}
                  onChange={setMediaIds}
                  max={mode === 'photo' ? 4 : 2}
                />
              )}
              {mode && (
                <TextField
                  label={t.capture.note}
                  value={notes}
                  onValueChange={setNotes}
                  multiline
                  rows={2}
                  maxLength={10000}
                />
              )}
              {mode && (
                <TextField
                  label={t.capture.when}
                  type="date"
                  value={day}
                  onValueChange={setDay}
                  max={today}
                />
              )}
            </>
          )}

          <section aria-labelledby="qc-type" className="flex flex-col gap-2 border-t border-line pt-4">
            <h3 id="qc-type" className="text-body-s font-medium text-ink">
              {t.capture.typeIt}
            </h3>
            <div className="flex items-end gap-2">
              <TextField
                label={<span className="sr-only">{t.capture.typeIt}</span>}
                value={freeText}
                onValueChange={setFreeText}
                placeholder={t.capture.typeItHint}
                className="flex-1"
                maxLength={500}
              />
              <Button
                type="button"
                variant="secondary"
                disabled={!freeText.trim()}
                onClick={() => setProposals(parseQuickCapture(freeText, plants))}
              >
                <Wand2 className="size-4" aria-hidden="true" />
                {t.capture.readIt}
              </Button>
            </div>
            <p className="text-caption text-muted">{t.capture.typeItHint}</p>
          </section>
          {plants.length === 0 && mode === 'harvest' && <Notice tone="info">{t.capture.noPlants}</Notice>}
        </div>
      )}
    </Sheet>
  );
}
