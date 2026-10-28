import { Button, Dialog, NumberInput, SelectField, TextField } from '@plantpal/ui';
import {
  CONTAINER_MATERIALS,
  CONTAINER_SHAPES,
  DRAINAGE_LEVELS,
  LIGHT_LEVELS,
  WIND_LEVELS,
  ZONE_KINDS,
  type Container,
  type ContainerShape,
  type Zone,
} from '@plantpal/schemas';
import {
  COMPASS_8,
  compassToDegrees,
  containerVolumeL,
  degreesToCompass,
  type Compass8,
} from '@plantpal/domain';
import { useId, useState, type FormEvent } from 'react';
import type { ContainerInput, ZoneInput } from '../../data/commands';
import { useT } from '../../i18n';

type Tri = 'yes' | 'no' | 'unknown';
const toTri = (b: boolean | null): Tri => (b === null ? 'unknown' : b ? 'yes' : 'no');
const fromTri = (v: Tri): boolean | null => (v === 'unknown' ? null : v === 'yes');
const UNSET = '__unset';

function useTriOptions() {
  const t = useT();
  return [
    { value: 'unknown' as const, label: t.labels.tri.unknown },
    { value: 'yes' as const, label: t.labels.tri.yes },
    { value: 'no' as const, label: t.labels.tri.no },
  ];
}

/** Optional enum select: the first option means "not set". */
function optional<K extends string>(labels: Record<K, string>, keys: readonly K[], unsetLabel: string) {
  return [
    { value: UNSET, label: unsetLabel },
    ...keys.map((k) => ({ value: k as string, label: labels[k] })),
  ];
}

export function ZoneDialog({
  open,
  onOpenChange,
  initial,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial?: Zone;
  onSubmit: (input: ZoneInput) => Promise<void>;
}) {
  const t = useT();
  const formId = useId();
  const tri = useTriOptions();
  const [name, setName] = useState(initial?.name ?? '');
  const [kind, setKind] = useState<Zone['kind']>(initial?.kind ?? 'balcony');
  const [light, setLight] = useState<string>(initial?.light ?? UNSET);
  const [facing, setFacing] = useState<string>(
    initial?.orientationDeg != null ? degreesToCompass(initial.orientationDeg) : UNSET,
  );
  const [covered, setCovered] = useState<Tri>(toTri(initial?.covered ?? null));
  const [wind, setWind] = useState<string>(initial?.wind ?? UNSET);
  const [drainage, setDrainage] = useState<string>(initial?.drainage ?? UNSET);
  const [area, setArea] = useState<number | null>(initial?.areaM2 ?? null);
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError(t.space.name);
    setBusy(true);
    try {
      await onSubmit({
        name: name.trim(),
        kind,
        light: light === UNSET ? null : (light as Zone['light']),
        orientationDeg: facing === UNSET ? null : compassToDegrees(facing as Compass8),
        covered: fromTri(covered),
        wind: wind === UNSET ? null : (wind as Zone['wind']),
        drainage: drainage === UNSET ? null : (drainage as Zone['drainage']),
        areaM2: area,
        notes,
      });
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={initial ? t.space.edit : t.space.add}
      size="md"
      footer={
        <>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {t.common.cancel}
          </Button>
          <Button type="submit" form={formId} loading={busy}>
            {t.common.save}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={(e) => void submit(e)} className="flex flex-col gap-4" noValidate>
        <TextField
          label={t.space.name}
          value={name}
          onValueChange={(v) => {
            setName(v);
            setError(null);
          }}
          placeholder={t.space.namePlaceholder}
          required
          error={error}
          maxLength={200}
        />
        <SelectField
          label={t.space.kind}
          value={kind}
          onValueChange={setKind}
          options={ZONE_KINDS.map((k) => ({ value: k, label: t.labels.zoneKind[k] }))}
        />
        <SelectField
          label={t.space.light}
          value={light}
          onValueChange={setLight}
          options={optional(t.labels.light, LIGHT_LEVELS, t.labels.tri.unknown)}
          description={t.space.lightHint}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label={t.space.facing}
            value={facing}
            onValueChange={setFacing}
            options={[
              { value: UNSET, label: t.labels.tri.unknown },
              ...COMPASS_8.map((c) => ({ value: c, label: c })),
            ]}
          />
          <SelectField label={t.space.covered} value={covered} onValueChange={setCovered} options={tri} />
          <SelectField
            label={t.space.wind}
            value={wind}
            onValueChange={setWind}
            options={optional(t.labels.wind, WIND_LEVELS, t.labels.tri.unknown)}
          />
          <SelectField
            label={t.space.drainage}
            value={drainage}
            onValueChange={setDrainage}
            options={optional(t.labels.drainage, DRAINAGE_LEVELS, t.labels.tri.unknown)}
          />
        </div>
        <NumberInput
          label={t.space.area}
          value={area}
          onValueChange={setArea}
          unit="m²"
          min={0}
          max={100000}
          step={0.5}
        />
        <TextField
          label={t.garden.notes}
          value={notes}
          onValueChange={setNotes}
          multiline
          rows={2}
          maxLength={10000}
        />
      </form>
    </Dialog>
  );
}

const ROUNDISH: readonly ContainerShape[] = ['round', 'grow-bag', 'hanging'];

export function ContainerDialog({
  open,
  onOpenChange,
  initial,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial?: Container;
  onSubmit: (input: ContainerInput) => Promise<void>;
}) {
  const t = useT();
  const formId = useId();
  const tri = useTriOptions();
  const [name, setName] = useState(initial?.name ?? '');
  const [shape, setShape] = useState<ContainerShape>(initial?.shape ?? 'round');
  const [diameter, setDiameter] = useState<number | null>(initial?.dimsCm.diameterCm ?? null);
  const [length, setLength] = useState<number | null>(initial?.dimsCm.lengthCm ?? null);
  const [width, setWidth] = useState<number | null>(initial?.dimsCm.widthCm ?? null);
  const [depth, setDepth] = useState<number | null>(initial?.dimsCm.depthCm ?? null);
  const [volume, setVolume] = useState<number | null>(initial?.volumeL ?? null);
  const [material, setMaterial] = useState<string>(initial?.material ?? UNSET);
  const [holes, setHoles] = useState<Tri>(toTri(initial?.drainageHoles ?? null));
  const [substrate, setSubstrate] = useState(initial?.substrate ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const round = ROUNDISH.includes(shape);
  const dimsCm = {
    ...(round && diameter ? { diameterCm: diameter } : {}),
    ...(!round && length ? { lengthCm: length } : {}),
    ...(!round && width ? { widthCm: width } : {}),
    ...(depth ? { depthCm: depth } : {}),
  };
  const computed = containerVolumeL(shape, dimsCm);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError(t.space.containerName);
    setBusy(true);
    try {
      await onSubmit({
        name: name.trim(),
        shape,
        dimsCm,
        volumeL: volume,
        material: material === UNSET ? null : (material as Container['material']),
        drainageHoles: fromTri(holes),
        substrate: substrate.trim(),
        notes: initial?.notes ?? '',
      });
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={initial ? t.space.editContainer : t.space.addContainer}
      size="md"
      footer={
        <>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {t.common.cancel}
          </Button>
          <Button type="submit" form={formId} loading={busy}>
            {t.common.save}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={(e) => void submit(e)} className="flex flex-col gap-4" noValidate>
        <TextField
          label={t.space.containerName}
          value={name}
          onValueChange={(v) => {
            setName(v);
            setError(null);
          }}
          placeholder={t.space.containerPlaceholder}
          required
          error={error}
          maxLength={200}
        />
        <SelectField
          label={t.space.shape}
          value={shape}
          onValueChange={setShape}
          options={CONTAINER_SHAPES.map((k) => ({ value: k, label: t.labels.shape[k] }))}
        />
        <div className="grid gap-4 sm:grid-cols-3">
          {round ? (
            <NumberInput
              label={t.space.diameter}
              value={diameter}
              onValueChange={setDiameter}
              unit="cm"
              min={1}
              max={10000}
            />
          ) : (
            <>
              <NumberInput
                label={t.space.length}
                value={length}
                onValueChange={setLength}
                unit="cm"
                min={1}
                max={10000}
              />
              <NumberInput
                label={t.space.width}
                value={width}
                onValueChange={setWidth}
                unit="cm"
                min={1}
                max={10000}
              />
            </>
          )}
          <NumberInput
            label={t.space.depth}
            value={depth}
            onValueChange={setDepth}
            unit="cm"
            min={1}
            max={10000}
          />
        </div>
        <NumberInput
          label={t.space.volume}
          value={volume}
          onValueChange={setVolume}
          unit="L"
          min={0}
          max={100000}
          step={0.5}
          description={
            computed !== null && volume === null
              ? `${t.space.volumeHint} ≈ ${computed} L`
              : t.space.volumeHint
          }
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label={t.space.material}
            value={material}
            onValueChange={setMaterial}
            options={optional(t.labels.material, CONTAINER_MATERIALS, t.labels.tri.unknown)}
          />
          <SelectField label={t.space.drainageHoles} value={holes} onValueChange={setHoles} options={tri} />
        </div>
        <TextField
          label={t.space.substrate}
          value={substrate}
          onValueChange={setSubstrate}
          placeholder={t.space.substratePlaceholder}
          maxLength={200}
        />
      </form>
    </Dialog>
  );
}
