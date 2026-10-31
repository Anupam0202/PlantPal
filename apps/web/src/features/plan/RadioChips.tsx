import { cn } from '@plantpal/ui';
import { useId, type ReactNode } from 'react';

/** Single choice as wrapping chips built on native radios (arrow keys move, no horizontal overflow). */
export function RadioChips<V extends string>({
  legend,
  value,
  onChange,
  options,
  hint,
}: {
  legend: ReactNode;
  value: V | null;
  onChange: (v: V) => void;
  options: ReadonlyArray<{ value: V; label: ReactNode }>;
  hint?: ReactNode;
}) {
  const name = useId();
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-body-s font-medium text-ink">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <label key={o.value} className="relative inline-flex">
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
              className="peer absolute inset-0 z-10 size-full cursor-pointer appearance-none opacity-0"
            />
            <span
              className={cn(
                'inline-flex min-h-10 cursor-pointer items-center rounded-full border border-line-strong bg-surface px-3.5 text-body-s font-medium text-ink transition-colors hover:bg-sunken',
                'peer-checked:border-accent peer-checked:bg-accent-soft peer-checked:text-accent-ink peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus',
              )}
            >
              {o.label}
            </span>
          </label>
        ))}
      </div>
      {hint && <p className="text-caption text-muted">{hint}</p>}
    </fieldset>
  );
}
