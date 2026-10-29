import {
  HEALTH_CHANGES,
  HEALTH_ONSETS,
  HEALTH_SIGNS,
  HEALTH_SPREAD,
  HEALTH_WHERE,
  SOIL_CHECKS,
  type HealthQuestionnaire,
} from '@plantpal/schemas';
import { Chip, TextField } from '@plantpal/ui';
import { RadioChips } from '../plan/RadioChips';
import { useHealthT } from './messages';

export const EMPTY_QUESTIONNAIRE: HealthQuestionnaire = {
  onset: 'unsure',
  signs: [],
  where: null,
  spread: 'one-plant',
  changes: [],
  soil: null,
  notes: '',
};

function MultiChips<V extends string>({
  legend,
  values,
  options,
  onChange,
}: {
  legend: string;
  values: readonly V[];
  options: ReadonlyArray<{ value: V; label: string }>;
  onChange: (v: V[]) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-body-s font-medium text-ink">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <Chip
            key={o.value}
            pressed={values.includes(o.value)}
            onPressedChange={(on) =>
              onChange(on ? [...values, o.value] : values.filter((x) => x !== o.value))
            }
          >
            {o.label}
          </Chip>
        ))}
      </div>
    </fieldset>
  );
}

export function Questionnaire({
  value,
  onChange,
}: {
  value: HealthQuestionnaire;
  onChange: (q: HealthQuestionnaire) => void;
}) {
  const m = useHealthT();
  const set = (patch: Partial<HealthQuestionnaire>) => onChange({ ...value, ...patch });
  return (
    <div className="flex flex-col gap-5">
      <MultiChips
        legend={m.signs}
        values={value.signs}
        options={HEALTH_SIGNS.map((s) => ({ value: s, label: m.signLabels[s] }))}
        onChange={(signs) => set({ signs })}
      />
      <RadioChips
        legend={m.onset}
        value={value.onset}
        onChange={(onset) => set({ onset })}
        options={HEALTH_ONSETS.map((o) => ({ value: o, label: m.onsets[o] }))}
      />
      <RadioChips
        legend={m.where}
        value={value.where}
        onChange={(where) => set({ where })}
        options={HEALTH_WHERE.map((o) => ({ value: o, label: m.whereLabels[o] }))}
      />
      <RadioChips
        legend={m.spread}
        value={value.spread}
        onChange={(spread) => set({ spread })}
        options={HEALTH_SPREAD.map((o) => ({ value: o, label: m.spreadLabels[o] }))}
      />
      <MultiChips
        legend={m.changes}
        values={value.changes}
        options={HEALTH_CHANGES.map((c) => ({ value: c, label: m.changeLabels[c] }))}
        onChange={(changes) => set({ changes })}
      />
      <RadioChips
        legend={m.soil}
        value={value.soil}
        onChange={(soil) => set({ soil })}
        options={SOIL_CHECKS.map((o) => ({ value: o, label: m.soilLabels[o] ?? o }))}
      />
      <TextField
        label={m.notes}
        value={value.notes}
        onValueChange={(notes) => set({ notes })}
        multiline
        rows={2}
        maxLength={500}
      />
    </div>
  );
}

/** Plain-English lines for the AI (it answers in the person's language). */
export function answerLines(q: HealthQuestionnaire): string[] {
  return [
    `Onset: ${q.onset}`,
    `Signs: ${q.signs.join(', ') || 'none selected'}`,
    q.where ? `Where: ${q.where}` : null,
    `Spread: ${q.spread}`,
    `Recent changes: ${q.changes.join(', ') || 'none'}`,
    q.soil ? `Soil at 2 cm: ${q.soil}` : 'Soil at 2 cm: not checked',
  ].filter((x): x is string => x !== null);
}
