import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';

export type Tone = 'neutral' | 'accent' | 'warning' | 'danger' | 'info' | 'clay' | 'dusk' | 'pollen';

const tones: Record<Tone, string> = {
  neutral: 'bg-sunken text-muted',
  accent: 'bg-accent-soft text-accent-ink',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
  info: 'bg-info-soft text-info',
  clay: 'bg-clay-soft text-clay',
  dusk: 'bg-dusk-soft text-dusk',
  pollen: 'bg-pollen-soft text-ink',
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
  icon?: ReactNode;
}

export function Badge({ tone = 'neutral', icon, className, children, ...rest }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex h-6 max-w-full items-center gap-1 rounded-full px-2.5 text-caption font-medium whitespace-nowrap',
        tones[tone],
        className,
      )}
      {...rest}
    >
      {icon}
      <span className="truncate">{children}</span>
    </span>
  );
}

/** Evidence grades from the master prompt §8.4: shape + text + colour, never colour alone. */
export type EvidenceGrade =
  | 'MEASURED'
  | 'OFFICIAL'
  | 'PEER_REVIEWED'
  | 'EXTENSION'
  | 'MODELLED'
  | 'COMMUNITY'
  | 'AI_DRAFT'
  | 'TRADITION'
  | 'UNKNOWN';

const evidenceMeta: Record<EvidenceGrade, { glyph: string; tone: Tone; label: string; description: string }> =
  {
    MEASURED: {
      glyph: '●',
      tone: 'accent',
      label: 'Measured',
      description: 'Logged by you or an instrument, with method and time',
    },
    OFFICIAL: {
      glyph: '◆',
      tone: 'info',
      label: 'Official',
      description: 'Government or standards-body source',
    },
    PEER_REVIEWED: {
      glyph: '◆',
      tone: 'info',
      label: 'Peer-reviewed',
      description: 'Published, peer-reviewed research',
    },
    EXTENSION: {
      glyph: '◇',
      tone: 'info',
      label: 'Extension',
      description: 'University extension, RHS or botanic-garden guidance',
    },
    MODELLED: {
      glyph: '▲',
      tone: 'dusk',
      label: 'Modelled',
      description: 'Forecast, reanalysis, climate model or computed estimate',
    },
    COMMUNITY: { glyph: '◇', tone: 'clay', label: 'Community', description: 'Curated community data' },
    AI_DRAFT: {
      glyph: '✦',
      tone: 'pollen',
      label: 'AI draft',
      description: 'Generated and not yet verified',
    },
    TRADITION: {
      glyph: '◌',
      tone: 'neutral',
      label: 'Tradition',
      description: 'Gardening lore without trial evidence',
    },
    UNKNOWN: {
      glyph: '?',
      tone: 'neutral',
      label: 'Unknown',
      description: 'No data — not zero, and not safe',
    },
  };

export function evidenceLabel(grade: EvidenceGrade): string {
  return evidenceMeta[grade].label;
}

export interface EvidenceBadgeProps {
  grade: EvidenceGrade;
  /** Compact shows only the glyph with an accessible label. */
  compact?: boolean;
  className?: string;
}

export function EvidenceBadge({ grade, compact = false, className }: EvidenceBadgeProps) {
  const meta = evidenceMeta[grade];
  if (compact) {
    return (
      <span
        className={cn(
          'inline-flex size-5 items-center justify-center rounded-full text-[0.7rem]',
          tones[meta.tone],
          className,
        )}
        title={`${meta.label}: ${meta.description}`}
        role="img"
        aria-label={`Evidence: ${meta.label}`}
      >
        <span aria-hidden="true">{meta.glyph}</span>
      </span>
    );
  }
  return (
    <Badge
      tone={meta.tone}
      title={meta.description}
      className={className}
      icon={<span aria-hidden="true">{meta.glyph}</span>}
    >
      <span className="sr-only">Evidence: </span>
      {meta.label}
    </Badge>
  );
}

export type Likelihood = 'LIKELY' | 'POSSIBLE' | 'UNLIKELY' | 'UNKNOWN';

const likelihoodMeta: Record<Likelihood, { tone: Tone; label: string }> = {
  LIKELY: { tone: 'warning', label: 'Likely' },
  POSSIBLE: { tone: 'info', label: 'Possible' },
  UNLIKELY: { tone: 'neutral', label: 'Unlikely' },
  UNKNOWN: { tone: 'neutral', label: 'Unknown' },
};

/** Categorical likelihood. Never a percentage (master prompt §6.8). */
export function LikelihoodChip({ value }: { value: Likelihood }) {
  const meta = likelihoodMeta[value];
  return <Badge tone={meta.tone}>{meta.label}</Badge>;
}

export interface FreshnessPillProps {
  /** ISO time the value was retrieved or measured. */
  at?: string | null;
  stale?: boolean;
  now?: number;
}

export function relativeAge(atIso: string, now = Date.now()): string {
  const ms = Math.max(0, now - Date.parse(atIso));
  const min = Math.round(ms / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

export function FreshnessPill({ at, stale = false, now }: FreshnessPillProps) {
  if (!at) return <Badge tone="neutral">No data</Badge>;
  return (
    <Badge tone={stale ? 'warning' : 'neutral'} title={new Date(at).toLocaleString()}>
      {stale ? `Stale · ${relativeAge(at, now)}` : relativeAge(at, now)}
    </Badge>
  );
}

export interface TaxonNameProps {
  scientificName: string;
  cultivar?: string | null;
  authorship?: string | null;
  className?: string;
}

/** Italic binomial, upright single-quoted cultivar, optional smaller authority. */
export function TaxonName({ scientificName, cultivar, authorship, className }: TaxonNameProps) {
  return (
    <span className={className}>
      <span className="taxon">{scientificName}</span>
      {cultivar ? <span> ‘{cultivar}’</span> : null}
      {authorship ? <span className="ml-1 text-[0.85em] text-muted">{authorship}</span> : null}
    </span>
  );
}

export interface MetricProps {
  label: ReactNode;
  value: ReactNode;
  unit?: ReactNode;
  hint?: ReactNode;
  evidence?: EvidenceGrade;
  className?: string;
}

export function Metric({ label, value, unit, hint, evidence, className }: MetricProps) {
  return (
    <div className={cn('flex flex-col gap-0.5', className)}>
      <div className="flex items-center gap-1.5 text-caption text-muted">
        <span>{label}</span>
        {evidence && <EvidenceBadge grade={evidence} compact />}
      </div>
      <div className="flex items-baseline gap-1">
        <span className="tabular font-display text-h2 text-ink">{value}</span>
        {unit && <span className="text-body-s text-muted">{unit}</span>}
      </div>
      {hint && <p className="text-caption text-muted">{hint}</p>}
    </div>
  );
}
