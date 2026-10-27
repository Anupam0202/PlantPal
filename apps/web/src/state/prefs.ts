import { create } from 'zustand';

/**
 * Per-device viewing preferences. These are conveniences (not garden records),
 * so a small localStorage mirror is acceptable and lets theme-init.js avoid a flash.
 */
export type ThemePref = 'system' | 'light' | 'dark';
export type ContrastPref = 'system' | 'more';
export type MotionPref = 'system' | 'reduce';
export type UnitsPref = 'metric' | 'imperial';
export type LocalePref = 'en' | 'hi' | 'es';

export interface Prefs {
  theme: ThemePref;
  contrast: ContrastPref;
  motion: MotionPref;
  units: UnitsPref;
  locale: LocalePref;
  lowData: boolean;
}

const KEY = 'pp-prefs';

function detectLocale(): LocalePref {
  const lang = (typeof navigator !== 'undefined' ? navigator.language : 'en').toLowerCase();
  if (lang.startsWith('hi')) return 'hi';
  if (lang.startsWith('es')) return 'es';
  return 'en';
}

function detectUnits(): UnitsPref {
  const lang = typeof navigator !== 'undefined' ? navigator.language : 'en-GB';
  // Countries that commonly use US customary units for gardening measurements.
  return /-(US|LR|MM)$/i.test(lang) ? 'imperial' : 'metric';
}

export const defaultPrefs = (): Prefs => ({
  theme: 'system',
  contrast: 'system',
  motion: 'system',
  units: detectUnits(),
  locale: detectLocale(),
  lowData: false,
});

function load(): Prefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultPrefs();
    const parsed = JSON.parse(raw) as Partial<Prefs>;
    const d = defaultPrefs();
    return {
      theme: parsed.theme === 'light' || parsed.theme === 'dark' ? parsed.theme : d.theme,
      contrast: parsed.contrast === 'more' ? 'more' : 'system',
      motion: parsed.motion === 'reduce' ? 'reduce' : 'system',
      units: parsed.units === 'imperial' || parsed.units === 'metric' ? parsed.units : d.units,
      locale:
        parsed.locale === 'hi' || parsed.locale === 'es' || parsed.locale === 'en' ? parsed.locale : d.locale,
      lowData: parsed.lowData === true,
    };
  } catch {
    return defaultPrefs();
  }
}

interface PrefsState extends Prefs {
  set: (patch: Partial<Prefs>) => void;
}

export const usePrefs = create<PrefsState>((set) => ({
  ...load(),
  set: (patch) =>
    set((s) => {
      const next = { ...s, ...patch };
      try {
        const { set: _ignored, ...plain } = next;
        void _ignored;
        localStorage.setItem(KEY, JSON.stringify(plain));
      } catch {
        /* private mode: preferences last for this session only */
      }
      return next;
    }),
}));

/** Reflects preferences onto <html> data attributes used by the design tokens. */
export function applyPrefsToDocument(p: Prefs): void {
  const d = document.documentElement;
  if (p.theme === 'system') delete d.dataset.theme;
  else d.dataset.theme = p.theme;
  if (p.contrast === 'more') d.dataset.contrast = 'more';
  else delete d.dataset.contrast;
  if (p.motion === 'reduce') d.dataset.motion = 'reduce';
  else delete d.dataset.motion;
  d.lang = p.locale;
  d.dir = 'ltr';
}
