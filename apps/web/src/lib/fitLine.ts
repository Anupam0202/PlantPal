/** Splits text into the letters a reader sees, so a cut never parts a Hindi letter from its vowel sign. */
export function graphemes(text: string): string[] {
  if (typeof Intl.Segmenter !== 'function') return Array.from(text);
  return Array.from(
    new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text),
    (s) => s.segment,
  );
}

/**
 * The line `make(part)`, no wider than `max`. When it is too wide, only `part` is shortened, at a letter
 * boundary and with an ellipsis, so the words around it (a year, a label) always show whole.
 */
export function fitLine(
  measure: (line: string) => number,
  max: number,
  make: (part: string) => string,
  part: string,
): string {
  const whole = make(part);
  if (measure(whole) <= max) return whole;
  const letters = graphemes(part);
  let best = make('…');
  let lo = 1;
  let hi = letters.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const line = make(`${letters.slice(0, mid).join('').trimEnd()}…`);
    if (measure(line) <= max) {
      best = line;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best;
}
