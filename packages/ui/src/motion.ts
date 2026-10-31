/** Motion tokens (§9.2). Durations are seconds for Motion; CSS uses the --ease-* tokens. */
export const duration = { instant: 0.08, quick: 0.15, base: 0.22, gentle: 0.32, scenic: 0.6 } as const;

export const ease = {
  standard: [0.2, 0, 0, 1],
  emphasized: [0.3, 0, 0, 1],
  exit: [0.4, 0, 1, 1],
} as const;

export const spring = {
  ui: { type: 'spring', stiffness: 380, damping: 32, mass: 1 },
  sheet: { type: 'spring', stiffness: 300, damping: 34 },
  gentle: { type: 'spring', stiffness: 180, damping: 24 },
  joy: { type: 'spring', stiffness: 260, damping: 16 },
} as const;

export const stagger = { step: 0.03, max: 8 } as const;

/** Delay for the nth item of a list reveal, capped so long lists don't wait. */
export function staggerDelay(index: number): number {
  return Math.min(index, stagger.max) * stagger.step;
}

/** True when the user (OS or in-app setting) asked for reduced motion. */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  if (document.documentElement.dataset.motion === 'reduce') return true;
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

/** Light haptic tick on devices that support it (Android Chrome). Never required for meaning. */
export function haptic(ms = 10): void {
  if (prefersReducedMotion()) return;
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* unsupported */
  }
}
