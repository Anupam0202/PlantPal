import { addDays, todayIn } from '@plantpal/domain';
import { useFormat, useT } from '../../i18n';
import { usePrefs } from '../../state/prefs';

/** Display helpers that respect the unit preference. Stored values are always metric. */
export function useUnits() {
  const units = usePrefs((s) => s.units);
  const f = useFormat();
  return {
    water: (ml: number) => {
      if (units === 'imperial') {
        const floz = ml / 29.5735295625;
        return floz >= 128 ? `${f.number(floz / 128, 2)} gal` : `${f.number(floz, 1)} fl oz`;
      }
      return ml >= 1000 ? `${f.number(ml / 1000, 2)} L` : `${f.number(ml)} ml`;
    },
    mass: (g: number) => {
      if (units === 'imperial') {
        const oz = g / 28.349523125;
        return oz >= 16 ? `${f.number(oz / 16, 2)} lb` : `${f.number(oz, 1)} oz`;
      }
      return g >= 1000 ? `${f.number(g / 1000, 2)} kg` : `${f.number(g, 1)} g`;
    },
    length: (cm: number) => (units === 'imperial' ? `${f.number(cm / 2.54, 1)} in` : `${f.number(cm, 1)} cm`),
    area: (m2: number) =>
      units === 'imperial' ? `${f.number(m2 / 0.09290304, 1)} ft²` : `${f.number(m2, 1)} m²`,
    volumeL: (l: number) =>
      units === 'imperial' ? `${f.number(l / 3.785411784, 1)} gal` : `${f.number(l, 1)} L`,
  };
}

/** "Today", "Yesterday" or a short date for a garden-local `YYYY-MM-DD`. */
export function useLocalDayLabel(timeZone: string | undefined) {
  const t = useT();
  const f = useFormat();
  return (day: string) => {
    const today = todayIn(timeZone ?? 'UTC');
    if (day === today) return t.common.today;
    if (day === addDays(today, -1)) return t.common.yesterday;
    const [y, m, d] = day.split('-').map(Number);
    const sameYear = day.slice(0, 4) === today.slice(0, 4);
    return f.date(new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1, 12)), {
      day: 'numeric',
      month: 'short',
      ...(sameYear ? {} : { year: 'numeric' }),
      timeZone: 'UTC',
    });
  };
}

/** Options for a Base UI select from a label record, preserving the record's order. */
export function optionsOf<K extends string>(labels: Record<K, string>): Array<{ value: K; label: string }> {
  return (Object.keys(labels) as K[]).map((value) => ({ value, label: labels[value] }));
}
