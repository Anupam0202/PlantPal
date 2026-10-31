import type { GardenProfile } from '@plantpal/schemas';
import { usePlanT } from './messages';
import { RadioChips } from './RadioChips';

type Manual = NonNullable<GardenProfile['manualClimate']>;

/** The manual climate questions (§7 W1 step 3): used when there is no location or the provider is down. */
export function ClimateQuestions({ value, onChange }: { value: Manual; onChange: (next: Manual) => void }) {
  const m = usePlanT();
  const yn = (v: boolean | null) => (v === null ? 'unsure' : v ? 'yes' : 'no');
  const fromYn = (v: 'yes' | 'no' | 'unsure') => (v === 'unsure' ? null : v === 'yes');
  const ynOptions = [
    { value: 'yes' as const, label: m.seed.yes },
    { value: 'no' as const, label: m.seed.no },
    { value: 'unsure' as const, label: m.seed.unsure },
  ];
  return (
    <div className="flex flex-col gap-4">
      <RadioChips
        legend={m.seed.frost}
        value={value.frost ?? 'unsure'}
        onChange={(v) => onChange({ ...value, frost: v === 'unsure' ? null : v })}
        options={[
          { value: 'none', label: m.seed.frostNone },
          { value: 'light', label: m.seed.frostLight },
          { value: 'hard', label: m.seed.frostHard },
          { value: 'unsure', label: m.seed.unsure },
        ]}
      />
      <RadioChips
        legend={m.seed.hot}
        value={yn(value.hotSummers)}
        onChange={(v) => onChange({ ...value, hotSummers: fromYn(v) })}
        options={ynOptions}
      />
      <RadioChips
        legend={m.seed.monsoon}
        value={yn(value.monsoon)}
        onChange={(v) => onChange({ ...value, monsoon: fromYn(v) })}
        options={ynOptions}
      />
    </div>
  );
}

export const EMPTY_MANUAL: Manual = { frost: null, hotSummers: null, monsoon: null };
