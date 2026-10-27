import { useEffect } from 'react';
import { applyPrefsToDocument, usePrefs } from '../state/prefs';

/** Keeps <html> data attributes in sync with appearance preferences. */
export function ThemeController() {
  const theme = usePrefs((s) => s.theme);
  const contrast = usePrefs((s) => s.contrast);
  const motion = usePrefs((s) => s.motion);
  const units = usePrefs((s) => s.units);
  const locale = usePrefs((s) => s.locale);
  const lowData = usePrefs((s) => s.lowData);
  useEffect(() => {
    applyPrefsToDocument({ theme, contrast, motion, units, locale, lowData });
  }, [theme, contrast, motion, units, locale, lowData]);
  return null;
}
