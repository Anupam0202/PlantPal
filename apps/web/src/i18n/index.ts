import { useMemo } from 'react';
import { usePrefs, type LocalePref } from '../state/prefs';
import { en, type Messages } from './en';
import { es } from './es';
import { hi } from './hi';

const catalogs: Record<LocalePref, Messages> = { en, hi, es };

export const localeNames: Record<LocalePref, string> = { en: 'English', hi: 'हिन्दी', es: 'Español' };

/** Typed message catalogue for the current locale. Usage: `const t = useT(); t.nav.today`. */
export function useT(): Messages {
  const locale = usePrefs((s) => s.locale);
  return catalogs[locale];
}

export function getMessages(locale: LocalePref): Messages {
  return catalogs[locale];
}

/** Locale-aware number, date and list formatters. */
export function useFormat() {
  const locale = usePrefs((s) => s.locale);
  const tag = locale === 'hi' ? 'hi-IN' : locale === 'es' ? 'es' : undefined;
  return useMemo(
    () => ({
      number: (n: number, digits = 0) =>
        new Intl.NumberFormat(tag, { maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(n),
      date: (d: Date | string, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }) =>
        new Intl.DateTimeFormat(tag, opts).format(typeof d === 'string' ? new Date(d) : d),
      time: (d: Date | string, timeZone?: string) =>
        new Intl.DateTimeFormat(tag, {
          hour: 'numeric',
          minute: '2-digit',
          ...(timeZone ? { timeZone } : {}),
        }).format(typeof d === 'string' ? new Date(d) : d),
      list: (items: string[]) =>
        new Intl.ListFormat(tag, { style: 'long', type: 'conjunction' }).format(items),
    }),
    [tag],
  );
}
