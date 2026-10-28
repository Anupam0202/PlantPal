import { Button, SelectField, TextField } from '@plantpal/ui';
import {
  IDENTITY_LEVELS,
  ORIGINS,
  SPECIMEN_STATUSES,
  type Container,
  type Specimen,
  type Zone,
} from '@plantpal/schemas';
import { todayIn } from '@plantpal/domain';
import { useState, type FormEvent } from 'react';
import type { SpecimenInput } from '../../data/commands';
import { useT } from '../../i18n';
import { PhotoField } from './Media';

const NONE = '__none';

export interface PlantFormValue extends SpecimenInput {
  mediaIds: string[];
}

/** The specimen fields of a form value (without the photos picked in the form). */
export function specimenInputOf(v: PlantFormValue): SpecimenInput {
  return {
    displayName: v.displayName,
    scientificName: v.scientificName,
    cultivar: v.cultivar,
    identityLevel: v.identityLevel,
    origin: v.origin,
    zoneId: v.zoneId,
    containerId: v.containerId,
    parentSpecimenId: v.parentSpecimenId,
    plantedOn: v.plantedOn,
    status: v.status,
    notes: v.notes,
  };
}

export function PlantForm({
  gardenId,
  timeZone,
  zones,
  containers,
  specimens,
  initial,
  initialZoneId,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  gardenId: string;
  timeZone: string;
  zones: Zone[];
  containers: Container[];
  specimens: Specimen[];
  initial?: Specimen;
  initialZoneId?: string;
  submitLabel: string;
  onSubmit: (value: PlantFormValue) => Promise<void>;
  onCancel: () => void;
}) {
  const t = useT();
  const [name, setName] = useState(initial?.displayName ?? '');
  const [scientific, setScientific] = useState(initial?.scientificName ?? '');
  const [cultivar, setCultivar] = useState(initial?.cultivar ?? '');
  const [identity, setIdentity] = useState<Specimen['identityLevel']>(initial?.identityLevel ?? 'unknown');
  const [zoneId, setZoneId] = useState<string>(initial?.zoneId ?? initialZoneId ?? NONE);
  const [containerId, setContainerId] = useState<string>(initial?.containerId ?? NONE);
  const [plantedOn, setPlantedOn] = useState(initial?.plantedOn ?? '');
  const [origin, setOrigin] = useState<Specimen['origin']>(initial?.origin ?? 'unknown');
  const [parentId, setParentId] = useState<string>(initial?.parentSpecimenId ?? NONE);
  const [status, setStatus] = useState<Specimen['status']>(initial?.status ?? 'active');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [mediaIds, setMediaIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const today = todayIn(timeZone);
  const zoneContainers = containers.filter((c) => c.zoneId === zoneId);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError(t.plant.name);
    setBusy(true);
    try {
      await onSubmit({
        displayName: name.trim(),
        scientificName: scientific.trim() || null,
        cultivar: cultivar.trim() || null,
        identityLevel: identity,
        zoneId: zoneId === NONE ? null : zoneId,
        containerId: zoneId === NONE || containerId === NONE ? null : containerId,
        plantedOn: plantedOn || null,
        origin,
        parentSpecimenId: parentId === NONE ? null : parentId,
        status,
        notes,
        mediaIds,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-5" noValidate>
      <TextField
        label={t.plant.name}
        value={name}
        onValueChange={(v) => {
          setName(v);
          setError(null);
        }}
        placeholder={t.plant.namePlaceholder}
        required
        error={error}
        maxLength={120}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label={t.plant.scientificName}
          value={scientific}
          onValueChange={setScientific}
          description={t.plant.scientificHint}
          maxLength={200}
        />
        <TextField label={t.plant.cultivar} value={cultivar} onValueChange={setCultivar} maxLength={200} />
      </div>
      <SelectField
        label={t.plant.identity}
        value={identity}
        onValueChange={setIdentity}
        options={IDENTITY_LEVELS.map((k) => ({ value: k, label: t.labels.identity[k] }))}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          label={t.plant.space}
          value={zoneId}
          onValueChange={(v) => {
            setZoneId(v);
            setContainerId(NONE);
          }}
          options={[
            { value: NONE, label: t.garden.noZone },
            ...zones.map((z) => ({ value: z.id, label: z.name })),
          ]}
        />
        <SelectField
          label={t.plant.container}
          value={containerId}
          onValueChange={setContainerId}
          options={[
            { value: NONE, label: t.common.none },
            ...zoneContainers.map((c) => ({ value: c.id, label: c.name })),
          ]}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label={t.plant.plantedOn}
          type="date"
          value={plantedOn}
          onValueChange={setPlantedOn}
          max={today}
        />
        <SelectField
          label={t.plant.origin}
          value={origin}
          onValueChange={setOrigin}
          options={ORIGINS.map((k) => ({ value: k, label: t.labels.origin[k] }))}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          label={t.plant.parent}
          value={parentId}
          onValueChange={setParentId}
          options={[
            { value: NONE, label: t.plant.parentNone },
            ...specimens
              .filter((s) => s.id !== initial?.id && !s.holding)
              .map((s) => ({ value: s.id, label: s.displayName })),
          ]}
        />
        <SelectField
          label={t.plant.status}
          value={status}
          onValueChange={setStatus}
          options={SPECIMEN_STATUSES.map((k) => ({ value: k, label: t.labels.status[k] }))}
        />
      </div>
      <TextField
        label={t.plant.notes}
        value={notes}
        onValueChange={setNotes}
        multiline
        rows={3}
        maxLength={10000}
      />
      {!initial && <PhotoField gardenId={gardenId} value={mediaIds} onChange={setMediaIds} max={1} />}
      <div className="flex flex-wrap justify-end gap-3">
        <Button type="button" variant="ghost" onClick={onCancel}>
          {t.common.cancel}
        </Button>
        <Button type="submit" loading={busy}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
