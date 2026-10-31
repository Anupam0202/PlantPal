import type { Forecast, VisitWeather } from '@plantpal/schemas';
import { SKY_STATES, WIND_STATES } from '@plantpal/schemas';
import { NumberInput, SelectField } from '@plantpal/ui';
import { useNatureT } from './messages';

/** Current conditions from the forecast, marked `MODELLED` until the person changes anything. */
export function weatherFromForecast(f: Forecast | undefined): VisitWeather | null {
  const c = f?.current;
  if (!c) return null;
  const t = c.temperatureC.value;
  const cloud = c.cloudCoverPct.value;
  const wind = c.windSpeedKmh.value;
  return {
    temperatureC: t === null ? null : Math.round(t),
    sky: cloud === null ? null : cloud < 25 ? 'sunny' : cloud < 70 ? 'partly-cloudy' : 'overcast',
    // Beaufort 0–1, 2–3, 4–5, 6 and above.
    wind: wind === null ? null : wind < 6 ? 'calm' : wind < 20 ? 'light' : wind < 39 ? 'moderate' : 'strong',
    evidence: 'MODELLED',
  };
}

const NONE = '__none';

export function WeatherFields({
  value,
  onChange,
}: {
  value: VisitWeather;
  onChange: (w: VisitWeather) => void;
}) {
  const m = useNatureT();
  const set = (patch: Partial<VisitWeather>) => onChange({ ...value, ...patch, evidence: 'MEASURED' });
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-1 font-medium text-ink">{m.fit.weather}</legend>
      {value.evidence === 'MODELLED' && <p className="text-caption text-muted">{m.fit.weatherFilled}</p>}
      <div className="grid gap-3 sm:grid-cols-3">
        <NumberInput
          label={m.fit.temperature}
          value={value.temperatureC}
          onValueChange={(temperatureC) => set({ temperatureC })}
          min={-50}
          max={60}
        />
        <SelectField<string>
          label={m.fit.sky}
          value={value.sky ?? NONE}
          onValueChange={(v) => set({ sky: v === NONE ? null : (v as VisitWeather['sky']) })}
          options={[{ value: NONE, label: '—' }, ...SKY_STATES.map((s) => ({ value: s, label: m.sky[s] }))]}
        />
        <SelectField<string>
          label={m.fit.wind}
          value={value.wind ?? NONE}
          onValueChange={(v) => set({ wind: v === NONE ? null : (v as VisitWeather['wind']) })}
          options={[{ value: NONE, label: '—' }, ...WIND_STATES.map((s) => ({ value: s, label: m.wind[s] }))]}
        />
      </div>
    </fieldset>
  );
}

export const EMPTY_WEATHER: VisitWeather = {
  temperatureC: null,
  sky: null,
  wind: null,
  evidence: 'MEASURED',
};
