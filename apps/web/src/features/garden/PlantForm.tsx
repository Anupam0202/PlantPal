import { Badge, Button, SelectField, TaxonName, TextField } from '@plantpal/ui';
import {
  IDENTITY_LEVELS,
  ORIGINS,
  SPECIMEN_STATUSES,
  type Container,
  type Specimen,
  type Taxon,
  type Zone,
} from '@plantpal/schemas';
import { todayIn } from '@plantpal/domain';
import { useState, type FormEvent } from 'react';
import type { SpecimenInput } from '../../data/commands';
import { useT } from '../../i18n';
import { PhotoField } from './Media';
import { CATALOG_TAXA } from '../plan/engine';
import { useSpeciesT } from '../species/messages';
import { PhotoId } from '../species/PhotoId';

const NONE = '__none';

export interface PlantFormValue extends SpecimenInput {
  mediaIds: string[];
  catalogTaxonId?: string | null;
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
    ...(v.catalogTaxonId !== undefined ? { catalogTaxonId: v.catalogTaxonId } : {}),
    ...(v.seedLotId !== undefined ? { seedLotId: v.seedLotId } : {}),
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
  seedLot,
  submitLabel,
  onSubmit,
  onCancel,
  countryCode,
}: {
  countryCode?: string | null;
  gardenId: string;
  timeZone: string;
  zones: Zone[];
  containers: Container[];
  specimens: Specimen[];
  initial?: Specimen;
  initialZoneId?: string;
  /** Growing a new plant from a seed lot: it is linked to the lot (lineage). */
  seedLot?: { id: string; name: string; scientificName: string | null };
  submitLabel: string;
  onSubmit: (value: PlantFormValue) => Promise<void>;
  onCancel: () => void;
}) {
  const t = useT();
  const [name, setName] = useState(initial?.displayName ?? '');
  const [scientific, setScientific] = useState(initial?.scientificName ?? seedLot?.scientificName ?? '');
  const [cultivar, setCultivar] = useState(initial?.cultivar ?? '');
  const [identity, setIdentity] = useState<Specimen['identityLevel']>(initial?.identityLevel ?? 'unknown');
  const [zoneId, setZoneId] = useState<string>(initial?.zoneId ?? initialZoneId ?? NONE);
  const [containerId, setContainerId] = useState<string>(initial?.containerId ?? NONE);
  const [plantedOn, setPlantedOn] = useState(initial?.plantedOn ?? '');
  const [origin, setOrigin] = useState<Specimen['origin']>(initial?.origin ?? (seedLot ? 'seed' : 'unknown'));
  const [parentId, setParentId] = useState<string>(initial?.parentSpecimenId ?? NONE);
  const [status, setStatus] = useState<Specimen['status']>(initial?.status ?? 'active');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [mediaIds, setMediaIds] = useState<string[]>([]);
  const [taxonId, setTaxonId] = useState<string | null>(initial?.catalogTaxonId ?? null);
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
        catalogTaxonId: taxonId,
        seedLotId: initial?.seedLotId ?? seedLot?.id ?? null,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-5" noValidate>
      {seedLot && (
        <p className="rounded-md bg-accent-soft p-3 text-body-s text-accent-ink">
          {t.plant.fromSeedLot(seedLot.name)}
        </p>
      )}
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
      <CatalogueLink
        query={scientific || name}
        linked={taxonId}
        onLink={(tx) => {
          setTaxonId(tx?.id ?? null);
          if (tx) {
            setScientific(tx.scientificName);
            if (!name.trim()) setName(tx.names.en);
            setIdentity('species');
          }
        }}
      />
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
      {!initial && mediaIds[0] && (
        <PhotoId
          mediaId={mediaIds[0]}
          countryCode={countryCode ?? null}
          onPick={(p) => {
            setScientific(p.scientificName);
            if (!name.trim()) setName(p.commonName ?? p.scientificName);
            setIdentity('species');
            setTaxonId(p.catalogTaxonId);
          }}
        />
      )}
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

/** Links the plant to a catalogue species (facts, toxicity, care schedules) when the name matches. */
function CatalogueLink({
  query,
  linked,
  onLink,
}: {
  query: string;
  linked: string | null;
  onLink: (t: Taxon | null) => void;
}) {
  const m = useSpeciesT();
  const q = query.trim().toLowerCase();
  const current = linked ? CATALOG_TAXA.find((x) => x.id === linked) : undefined;
  if (current)
    return (
      <p className="flex flex-wrap items-center gap-2 text-body-s" data-testid="catalogue-link">
        <Badge tone="accent">{m.linked}</Badge>
        <TaxonName scientificName={current.scientificName} className="text-ink" />
        <Button type="button" size="sm" variant="ghost" onClick={() => onLink(null)}>
          ✕
        </Button>
      </p>
    );
  if (q.length < 3) return null;
  const hits = CATALOG_TAXA.filter(
    (x) =>
      x.scientificName.toLowerCase().includes(q) ||
      Object.values(x.names).some((n) => n?.toLowerCase().includes(q)),
  ).slice(0, 3);
  if (hits.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5" data-testid="catalogue-suggestions">
      <p className="text-caption text-muted">{m.catalogue}</p>
      <div className="flex flex-wrap gap-2">
        {hits.map((x) => (
          <Button key={x.id} type="button" size="sm" variant="secondary" onClick={() => onLink(x)}>
            {x.names.en} · <i>{x.scientificName}</i>
          </Button>
        ))}
      </div>
    </div>
  );
}
