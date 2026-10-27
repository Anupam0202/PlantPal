import { motion, useReducedMotion } from 'motion/react';
import { cn } from './cn';

export interface SproutProps {
  /** Replays the animation when this key changes. */
  playKey?: string | number;
  size?: number;
  className?: string;
  label?: string;
}

/**
 * Success micro-animation (§9.3): a stem grows, two leaves unfurl, soil settles.
 * Under reduced motion it renders the final state instantly.
 */
export function Sprout({ playKey, size = 40, className, label }: SproutProps) {
  const reduce = useReducedMotion();
  const t = (delay: number, duration: number) =>
    reduce ? { duration: 0 } : { delay, duration, ease: [0.3, 0, 0, 1] as const };
  return (
    <svg
      key={playKey}
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      className={cn('text-accent-ink', className)}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <motion.path
        d="M10 42h28"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        initial={{ pathLength: reduce ? 1 : 0, opacity: 0.5 }}
        animate={{ pathLength: 1, opacity: 0.5 }}
        transition={t(0, 0.18)}
      />
      <motion.path
        d="M24 42V22"
        stroke="currentColor"
        strokeWidth="2.75"
        strokeLinecap="round"
        initial={{ pathLength: reduce ? 1 : 0 }}
        animate={{ pathLength: 1 }}
        transition={t(0.08, 0.22)}
      />
      <motion.path
        d="M24 28c-1-6-6-9.5-12-9.5 0 6 4.5 10.5 12 9.5Z"
        fill="currentColor"
        fillOpacity="0.85"
        style={{ originX: '24px', originY: '28px' }}
        initial={{ scale: reduce ? 1 : 0, rotate: reduce ? 0 : 25 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={t(0.24, 0.24)}
      />
      <motion.path
        d="M24 23c1-7 6.5-11 14-11 0 7.5-5.5 12-14 11Z"
        fill="currentColor"
        style={{ originX: '24px', originY: '23px' }}
        initial={{ scale: reduce ? 1 : 0, rotate: reduce ? 0 : -25 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={t(0.32, 0.26)}
      />
    </svg>
  );
}

export interface SproutProgressProps {
  step: number;
  total: number;
  label: string;
  className?: string;
}

/** Onboarding progress: one leaf per completed step, plus an accessible progressbar. */
export function SproutProgress({ step, total, label, className }: SproutProgressProps) {
  const clamped = Math.min(Math.max(step, 0), total);
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={clamped}
        aria-valuetext={`Step ${clamped} of ${total}`}
        className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-sunken"
      >
        <motion.div
          className="absolute inset-y-0 left-0 rounded-full bg-accent"
          initial={false}
          animate={{ width: `${(clamped / total) * 100}%` }}
          transition={{ type: 'spring', stiffness: 180, damping: 24 }}
        />
      </div>
      <span className="tabular text-caption text-muted" aria-hidden="true">
        {clamped}/{total}
      </span>
    </div>
  );
}
