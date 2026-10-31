import { Button, Notice, Spinner, TextField } from '@plantpal/ui';
import type { PlaceResult } from '@plantpal/schemas';
import { formatCoordinates } from '@plantpal/providers';
import { LocateFixed, MapPin, X } from 'lucide-react';
import { useState } from 'react';
import { usePlaceSearch } from '../../env/hooks';
import { useT } from '../../i18n';
import { usePrefs } from '../../state/prefs';

export interface LocationValue {
  label: string | null;
  lat: number;
  lon: number;
  /** Time zone of the chosen place, when the search result provides one. */
  timezone?: string | null;
  /** ISO country and first-level region from place search (device location leaves them unknown). */
  countryCode?: string | null;
  admin1?: string | null;
}

/** Place search (Open-Meteo geocoding) or device location. Precise coordinates stay on the device. */
export function LocationField({
  value,
  onChange,
}: {
  value: LocationValue | null;
  onChange: (v: LocationValue | null) => void;
}) {
  const t = useT();
  const locale = usePrefs((s) => s.locale);
  const [query, setQuery] = useState('');
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const search = usePlaceSearch(query, locale);

  const choose = (r: PlaceResult) => {
    onChange({
      label: [r.name, r.admin1, r.country].filter(Boolean).join(', '),
      lat: r.lat,
      lon: r.lon,
      timezone: r.timezone,
      countryCode: r.countryCode,
      admin1: r.admin1,
    });
    setQuery('');
  };

  const useMine = () => {
    if (!('geolocation' in navigator)) {
      setGeoError(t.location.failed);
      return;
    }
    setLocating(true);
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        onChange({
          label: value?.label ?? t.location.myLocation,
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          timezone: null,
        });
      },
      (err) => {
        setLocating(false);
        setGeoError(err.code === err.PERMISSION_DENIED ? t.location.denied : t.location.failed);
      },
      { enableHighAccuracy: false, timeout: 15_000, maximumAge: 10 * 60_000 },
    );
  };

  const results = search.data?.results ?? [];

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-1 text-body-s font-medium text-ink">{t.location.title}</legend>
      {value ? (
        <div className="flex items-start gap-3 rounded-md border border-line bg-sunken p-3">
          <MapPin className="mt-0.5 size-5 text-accent-ink" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="font-medium text-ink">{value.label ?? t.location.myLocation}</p>
            <p className="text-caption text-muted">{formatCoordinates(value.lat, value.lon)}</p>
          </div>
          <Button type="button" size="sm" variant="ghost" onClick={() => onChange(null)}>
            <X className="size-4" aria-hidden="true" />
            {t.location.remove}
          </Button>
        </div>
      ) : null}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <TextField
          label={t.location.search}
          type="search"
          value={query}
          onValueChange={setQuery}
          className="flex-1"
          autoComplete="off"
          maxLength={100}
        />
        <Button type="button" variant="secondary" onClick={useMine} disabled={locating}>
          {locating ? <Spinner /> : <LocateFixed className="size-4" aria-hidden="true" />}
          {locating ? t.location.locating : t.location.useMine}
        </Button>
      </div>
      {query.trim().length >= 2 && (
        <div aria-live="polite">
          {search.isFetching && <p className="text-body-s text-muted">{t.location.searching}</p>}
          {search.isError && <p className="text-body-s text-muted">{t.location.offline}</p>}
          {search.isSuccess && results.length === 0 && (
            <p className="text-body-s text-muted">{t.location.noResults}</p>
          )}
          {results.length > 0 && (
            <ul
              aria-label={t.location.results}
              className="flex flex-col divide-y divide-line overflow-hidden rounded-md border border-line bg-surface"
            >
              {results.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => choose(r)}
                    className="flex w-full items-start gap-3 px-3 py-2.5 text-left hover:bg-sunken focus-visible:bg-sunken focus-visible:outline-2 focus-visible:outline-focus"
                  >
                    <MapPin className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden="true" />
                    <span className="min-w-0">
                      <span className="block text-body-s font-medium text-ink">{r.name}</span>
                      <span className="block text-caption text-muted">
                        {[r.admin1, r.country].filter(Boolean).join(', ')} · {formatCoordinates(r.lat, r.lon)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {geoError && <Notice tone="warning">{geoError}</Notice>}
      <p className="text-caption text-muted">{t.location.privacy}</p>
    </fieldset>
  );
}
