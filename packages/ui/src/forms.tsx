import { Checkbox as BaseCheckbox } from '@base-ui/react/checkbox';
import { Field } from '@base-ui/react/field';
import { NumberField as BaseNumberField } from '@base-ui/react/number-field';
import { Select as BaseSelect } from '@base-ui/react/select';
import { Switch as BaseSwitch } from '@base-ui/react/switch';
import { Tabs as BaseTabs } from '@base-ui/react/tabs';
import { Toggle } from '@base-ui/react/toggle';
import { ToggleGroup } from '@base-ui/react/toggle-group';
import { Check, ChevronDown, Minus, Plus } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import { cn } from './cn';

const controlBase =
  'w-full rounded-md border border-control bg-sunken px-3 text-body text-ink placeholder:text-subtle ' +
  'transition-colors duration-150 hover:border-ink focus:border-accent focus:outline-2 focus:outline-offset-1 focus:outline-focus ' +
  'data-invalid:border-danger disabled:opacity-60';

export interface TextFieldProps {
  label: ReactNode;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  description?: ReactNode;
  error?: ReactNode;
  placeholder?: string;
  required?: boolean;
  type?: 'text' | 'search' | 'email' | 'url' | 'password' | 'date';
  /** For `type="date"`: earliest and latest allowed `YYYY-MM-DD`. */
  min?: string;
  max?: string;
  name?: string;
  autoComplete?: string;
  multiline?: boolean;
  rows?: number;
  maxLength?: number;
  className?: string;
  inputMode?: 'text' | 'search' | 'email' | 'url' | 'decimal' | 'numeric';
  suffix?: ReactNode;
  autoFocus?: boolean;
}

/** Labelled text input with associated description and error (Base UI Field). */
export function TextField({
  label,
  value,
  defaultValue,
  onValueChange,
  description,
  error,
  placeholder,
  required,
  type = 'text',
  name,
  autoComplete,
  multiline,
  rows = 3,
  maxLength,
  className,
  inputMode,
  suffix,
  autoFocus,
  min,
  max,
}: TextFieldProps) {
  const common = {
    placeholder,
    required,
    name,
    autoComplete,
    maxLength,
    inputMode,
    autoFocus,
    ...(value !== undefined ? { value } : {}),
    ...(defaultValue !== undefined ? { defaultValue } : {}),
  };
  return (
    <Field.Root invalid={Boolean(error)} className={cn('flex flex-col gap-1.5', className)}>
      <Field.Label className="text-body-s font-medium text-ink">
        {label}
        {required && (
          <span className="text-danger" aria-hidden="true">
            {' '}
            *
          </span>
        )}
      </Field.Label>
      <div className="relative">
        {multiline ? (
          <Field.Control
            render={<textarea rows={rows} />}
            className={cn(controlBase, 'py-2.5 leading-relaxed')}
            onValueChange={(v) => onValueChange?.(String(v))}
            {...common}
          />
        ) : (
          <Field.Control
            type={type}
            min={min}
            max={max}
            className={cn(controlBase, 'h-11', suffix ? 'pr-14' : '')}
            onValueChange={(v) => onValueChange?.(String(v))}
            {...common}
          />
        )}
        {suffix && (
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-body-s text-muted">
            {suffix}
          </span>
        )}
      </div>
      {description && (
        <Field.Description className="text-caption text-muted">{description}</Field.Description>
      )}
      {error && (
        <Field.Error match className="text-caption font-medium text-danger">
          {error}
        </Field.Error>
      )}
    </Field.Root>
  );
}

export interface NumberInputProps {
  label: ReactNode;
  /** null means "unknown / not entered" and is preserved; 0 is a real value. */
  value: number | null;
  onValueChange: (value: number | null) => void;
  unit?: ReactNode;
  min?: number;
  max?: number;
  step?: number;
  description?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  className?: string;
  /** Spoken value text, e.g. "3 hours of direct sun". */
  valueText?: (value: number | null) => string;
}

export function NumberInput({
  label,
  value,
  onValueChange,
  unit,
  min,
  max,
  step = 1,
  description,
  error,
  required,
  className,
}: NumberInputProps) {
  const id = useId();
  const descId = `${id}-desc`;
  const stepper =
    'flex size-11 items-center justify-center border border-control bg-surface text-ink hover:bg-sunken disabled:opacity-40';
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-body-s font-medium text-ink">
        {label}
        {required && (
          <span className="text-danger" aria-hidden="true">
            {' '}
            *
          </span>
        )}
      </label>
      <BaseNumberField.Root
        id={id}
        value={value}
        onValueChange={(v) => onValueChange(v === null || Number.isNaN(v) ? null : v)}
        {...(min !== undefined ? { min } : {})}
        {...(max !== undefined ? { max } : {})}
        step={step}
        required={required}
      >
        <BaseNumberField.Group className="flex items-stretch">
          <BaseNumberField.Decrement className={cn(stepper, 'rounded-l-md border-r-0')} aria-label="Decrease">
            <Minus className="size-4" aria-hidden="true" />
          </BaseNumberField.Decrement>
          <div className="relative flex-1">
            <BaseNumberField.Input
              aria-describedby={description || error ? descId : undefined}
              className={cn(
                'tabular h-11 w-full min-w-[6ch] border border-control bg-sunken px-3 text-center text-body text-ink focus:z-10 focus:outline-2 focus:outline-focus',
                unit ? 'pr-12' : '',
              )}
            />
            {unit && (
              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-body-s text-muted">
                {unit}
              </span>
            )}
          </div>
          <BaseNumberField.Increment className={cn(stepper, 'rounded-r-md border-l-0')} aria-label="Increase">
            <Plus className="size-4" aria-hidden="true" />
          </BaseNumberField.Increment>
        </BaseNumberField.Group>
      </BaseNumberField.Root>
      {(description || error) && (
        <p id={descId} className={cn('text-caption', error ? 'font-medium text-danger' : 'text-muted')}>
          {error ?? description}
        </p>
      )}
    </div>
  );
}

export interface SelectOption<V extends string = string> {
  value: V;
  label: string;
  description?: string;
}

export interface SelectFieldProps<V extends string> {
  label: ReactNode;
  value: V | null;
  onValueChange: (value: V) => void;
  options: ReadonlyArray<SelectOption<V>>;
  placeholder?: string;
  description?: ReactNode;
  className?: string;
}

export function SelectField<V extends string>({
  label,
  value,
  onValueChange,
  options,
  placeholder = 'Choose…',
  description,
  className,
}: SelectFieldProps<V>) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <BaseSelect.Root
        items={options.map((o) => ({ value: o.value, label: o.label }))}
        value={value}
        onValueChange={(v) => {
          if (v !== null) onValueChange(v as V);
        }}
      >
        <BaseSelect.Label className="text-body-s font-medium text-ink">{label}</BaseSelect.Label>
        <BaseSelect.Trigger
          className={cn(controlBase, 'flex h-11 items-center justify-between gap-2 text-left')}
        >
          <BaseSelect.Value className="truncate data-placeholder:text-subtle" placeholder={placeholder} />
          <BaseSelect.Icon>
            <ChevronDown className="size-4 text-muted" aria-hidden="true" />
          </BaseSelect.Icon>
        </BaseSelect.Trigger>
        <BaseSelect.Portal>
          <BaseSelect.Positioner sideOffset={6} className="z-50 outline-none">
            <BaseSelect.Popup className="min-w-[var(--anchor-width)] origin-[var(--transform-origin)] rounded-lg border border-line bg-raised p-1 shadow-3 transition-[scale,opacity] duration-150 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0">
              <BaseSelect.List className="max-h-[min(var(--available-height),20rem)] overflow-y-auto">
                {options.map((o) => (
                  <BaseSelect.Item
                    key={o.value}
                    value={o.value}
                    className="grid min-h-11 cursor-default grid-cols-[1.25rem_1fr] items-center gap-2 rounded-md px-2.5 py-1.5 text-body-s text-ink outline-none select-none data-highlighted:bg-accent-soft data-highlighted:text-accent-ink"
                  >
                    <BaseSelect.ItemIndicator className="col-start-1">
                      <Check className="size-4" aria-hidden="true" />
                    </BaseSelect.ItemIndicator>
                    <div className="col-start-2">
                      <BaseSelect.ItemText>{o.label}</BaseSelect.ItemText>
                      {o.description && <p className="text-caption text-muted">{o.description}</p>}
                    </div>
                  </BaseSelect.Item>
                ))}
              </BaseSelect.List>
            </BaseSelect.Popup>
          </BaseSelect.Positioner>
        </BaseSelect.Portal>
      </BaseSelect.Root>
      {description && <p className="text-caption text-muted">{description}</p>}
    </div>
  );
}

export interface SwitchFieldProps {
  label: ReactNode;
  description?: ReactNode;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}

export function SwitchField({ label, description, checked, onCheckedChange, disabled }: SwitchFieldProps) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4 py-1">
      <div className="min-w-0">
        <label htmlFor={id} className="text-body-s font-medium text-ink">
          {label}
        </label>
        {description && <p className="text-caption text-muted">{description}</p>}
      </div>
      <BaseSwitch.Root
        id={id}
        checked={checked}
        onCheckedChange={(c) => onCheckedChange(c)}
        disabled={disabled}
        className="relative mt-0.5 inline-flex h-7 w-12 shrink-0 items-center rounded-full border border-control bg-sunken p-0.5 transition-colors duration-150 data-checked:border-accent data-checked:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        <BaseSwitch.Thumb className="size-5.5 rounded-full bg-raised shadow-1 transition-transform duration-200 ease-[var(--ease-emphasized)] data-checked:translate-x-5" />
      </BaseSwitch.Root>
    </div>
  );
}

export interface CheckboxFieldProps {
  label: ReactNode;
  description?: ReactNode;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

export function CheckboxField({ label, description, checked, onCheckedChange }: CheckboxFieldProps) {
  return (
    <label className="flex min-h-11 cursor-pointer items-start gap-3 py-1.5">
      <BaseCheckbox.Root
        checked={checked}
        onCheckedChange={(c) => onCheckedChange(c)}
        className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-sm border border-control bg-sunken text-on-accent data-checked:border-accent data-checked:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        <BaseCheckbox.Indicator className="flex data-unchecked:hidden">
          <Check className="size-3.5" strokeWidth={3} aria-hidden="true" />
        </BaseCheckbox.Indicator>
      </BaseCheckbox.Root>
      <span>
        <span className="text-body-s font-medium text-ink">{label}</span>
        {description && <span className="block text-caption text-muted">{description}</span>}
      </span>
    </label>
  );
}

export interface SegmentOption<V extends string> {
  value: V;
  label: ReactNode;
  icon?: ReactNode;
  ariaLabel?: string;
}

export interface SegmentedControlProps<V extends string> {
  label: string;
  value: V;
  onValueChange: (value: V) => void;
  options: ReadonlyArray<SegmentOption<V>>;
  className?: string;
  size?: 'sm' | 'md';
}

/** Single-choice segmented control (ToggleGroup with aria-pressed buttons). */
export function SegmentedControl<V extends string>({
  label,
  value,
  onValueChange,
  options,
  className,
  size = 'md',
}: SegmentedControlProps<V>) {
  return (
    <ToggleGroup
      aria-label={label}
      value={[value]}
      onValueChange={(vals) => {
        const next = vals[vals.length - 1];
        if (next) onValueChange(next as V);
      }}
      className={cn('inline-flex w-full rounded-full border border-line bg-sunken p-1 sm:w-auto', className)}
    >
      {options.map((o) => (
        <Toggle
          key={o.value}
          value={o.value}
          aria-label={o.ariaLabel}
          className={cn(
            'inline-flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 font-medium whitespace-nowrap text-muted transition-colors duration-150 hover:text-ink data-pressed:bg-surface data-pressed:text-ink data-pressed:shadow-1 focus-visible:outline-2 focus-visible:outline-focus',
            size === 'md' ? 'h-9 text-body-s' : 'h-8 text-caption',
          )}
        >
          {o.icon}
          {o.label}
        </Toggle>
      ))}
    </ToggleGroup>
  );
}

export interface ChipProps {
  pressed: boolean;
  onPressedChange: (pressed: boolean) => void;
  children: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
}

/** Multi-select chip (toggle button with aria-pressed). */
export function Chip({ pressed, onPressedChange, children, icon, disabled }: ChipProps) {
  return (
    <Toggle
      pressed={pressed}
      onPressedChange={(p) => onPressedChange(p)}
      disabled={disabled}
      className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-line-strong bg-surface px-3.5 text-body-s font-medium text-ink transition-colors duration-150 hover:bg-sunken data-pressed:border-accent data-pressed:bg-accent-soft data-pressed:text-accent-ink disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
    >
      {pressed ? <Check className="size-4" aria-hidden="true" /> : icon}
      {children}
    </Toggle>
  );
}

export interface TabItem<V extends string> {
  value: V;
  label: ReactNode;
  content: ReactNode;
}

export function Tabs<V extends string>({
  items,
  value,
  onValueChange,
  label,
  className,
}: {
  items: ReadonlyArray<TabItem<V>>;
  value: V;
  onValueChange: (value: V) => void;
  label: string;
  className?: string;
}) {
  return (
    <BaseTabs.Root value={value} onValueChange={(v) => onValueChange(v as V)} className={className}>
      <BaseTabs.List aria-label={label} className="relative flex gap-1 overflow-x-auto border-b border-line">
        {items.map((t) => (
          <BaseTabs.Tab
            key={t.value}
            value={t.value}
            className="relative h-11 shrink-0 px-3 text-body-s font-medium whitespace-nowrap text-muted outline-none hover:text-ink data-active:text-ink focus-visible:outline-2 focus-visible:outline-focus"
          >
            {t.label}
          </BaseTabs.Tab>
        ))}
        <BaseTabs.Indicator className="absolute bottom-0 left-0 h-0.5 w-(--active-tab-width) translate-x-(--active-tab-left) rounded-full bg-accent transition-[translate,width] duration-200 ease-[var(--ease-emphasized)]" />
      </BaseTabs.List>
      {items.map((t) => (
        <BaseTabs.Panel
          key={t.value}
          value={t.value}
          className="pt-4 outline-none focus-visible:outline-2 focus-visible:outline-focus"
        >
          {t.content}
        </BaseTabs.Panel>
      ))}
    </BaseTabs.Root>
  );
}
