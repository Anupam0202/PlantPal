import { Button, SegmentedControl, SelectField, TextField } from '@plantpal/ui';
import type { Garden } from '@plantpal/schemas';
import { deviceTimeZone } from '@plantpal/domain';
import { useMemo, useState, type FormEvent } from 'react';
import type { GardenInput } from '../../data/commands';
import { useT } from '../../i18n';
import { LocationField, type LocationValue } from './LocationField';

function timeZones(current: string): string[] {
  let list: string[] = [];
  try {
    list = Intl.supportedValuesOf('timeZone');
  } catch {
    list = [];
  }
  return list.includes(current) ? list : [current, ...list];
}

/** Guesses the hemisphere from the time zone when there is no location yet. */
function guessHemisphere(tz: string): 'north' | 'south' {
  return /^(Australia|Pacific\/Auckland|Antarctica|America\/(Argentina|Santiago|Sao_Paulo|Montevideo|Asuncion|La_Paz|Lima)|Africa\/(Johannesburg|Maputo|Harare|Windhoek|Gaborone|Lusaka)|Indian\/(Mauritius|Reunion))/.test(
    tz,
  )
    ? 'south'
    : 'north';
}

export function GardenForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: Garden;
  submitLabel: string;
  onSubmit: (input: GardenInput) => Promise<void>;
  onCancel?: () => void;
}) {
  const t = useT();
  const [name, setName] = useState(initial?.name ?? '');
  const [timezone, setTimezone] = useState(initial?.timezone ?? deviceTimeZone());
  const [hemisphere, setHemisphere] = useState<'north' | 'south'>(
    initial?.hemisphere ?? guessHemisphere(timezone),
  );
  const [place, setPlace] = useState(initial?.place?.label ?? '');
  const [location, setLocation] = useState<LocationValue | null>(
    initial?.place?.lat != null && initial.place.lon != null
      ? { label: initial.place.label, lat: initial.place.lat, lon: initial.place.lon }
      : null,
  );
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const zones = useMemo(
    () => timeZones(timezone).map((z) => ({ value: z, label: z.replaceAll('_', ' ') })),
    [timezone],
  );

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError(t.garden.name);
      return;
    }
    setBusy(true);
    try {
      await onSubmit({
        name: name.trim(),
        timezone,
        hemisphere,
        place:
          location || place.trim()
            ? {
                label: place.trim() || location?.label || null,
                lat: location?.lat ?? null,
                lon: location?.lon ?? null,
              }
            : null,
        notes,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-5" noValidate>
      <TextField
        label={t.garden.name}
        value={name}
        onValueChange={(v) => {
          setName(v);
          setError(null);
        }}
        placeholder={t.garden.namePlaceholder}
        required
        maxLength={200}
        error={error}
      />
      <SelectField
        label={t.garden.timezone}
        value={timezone}
        onValueChange={setTimezone}
        options={zones}
        description={t.garden.timezoneHint}
      />
      <div className="flex flex-col gap-1.5">
        <span className="text-body-s font-medium text-ink" aria-hidden="true">
          {t.garden.hemisphere}
        </span>
        <SegmentedControl
          label={t.garden.hemisphere}
          value={hemisphere}
          onValueChange={setHemisphere}
          options={[
            { value: 'north', label: t.garden.north },
            { value: 'south', label: t.garden.south },
          ]}
        />
        <p className="text-caption text-muted">{t.garden.hemisphereHint}</p>
      </div>
      <LocationField
        value={location}
        onChange={(v) => {
          setLocation(v);
          if (v?.label && (!place.trim() || place === location?.label)) setPlace(v.label);
          if (v?.timezone) setTimezone(v.timezone);
          if (v) setHemisphere(v.lat < 0 ? 'south' : 'north');
        }}
      />
      <TextField
        label={t.garden.place}
        value={place}
        onValueChange={setPlace}
        description={t.garden.placeHint}
        maxLength={200}
      />
      <TextField
        label={t.garden.notes}
        value={notes}
        onValueChange={setNotes}
        multiline
        rows={3}
        maxLength={10000}
      />
      <div className="flex flex-wrap justify-end gap-3">
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            {t.common.cancel}
          </Button>
        )}
        <Button type="submit" loading={busy}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
