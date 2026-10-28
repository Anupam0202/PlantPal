/** OKLCH → sRGB conversion and WCAG 2.x contrast, used by tests and charts. */
export interface Oklch {
  l: number;
  c: number;
  h: number;
  alpha: number;
}

const NUMBER = /^(?:\d+(?:\.\d*)?|\.\d+)$/;

/** Parses `<number>` or `<number>%` (with an optional unit suffix such as `deg`) without backtracking-prone regexes. */
function parseComponent(token: string | undefined, pctScale: number, suffix = ''): number {
  if (token === undefined) throw new Error('Missing oklch() component');
  let t = token.toLowerCase();
  if (suffix && t.endsWith(suffix)) t = t.slice(0, -suffix.length);
  const pct = t.endsWith('%');
  if (pct) t = t.slice(0, -1);
  if (!NUMBER.test(t)) throw new Error(`Invalid oklch() component: ${token}`);
  const v = parseFloat(t);
  return pct ? (v / 100) * pctScale : v;
}

export function parseOklch(input: string): Oklch {
  const s = input.trim();
  const open = s.toLowerCase().indexOf('oklch(');
  const close = open === -1 ? -1 : s.indexOf(')', open);
  if (open === -1 || close === -1) throw new Error(`Not an oklch() colour: ${input}`);
  const segments = s.slice(open + 6, close).split('/');
  if (segments.length > 2) throw new Error(`Not an oklch() colour: ${input}`);
  const main = (segments[0] ?? '').trim().split(/\s+/);
  if (main.length !== 3) throw new Error(`Not an oklch() colour: ${input}`);
  const alphaToken = segments[1]?.trim();
  return {
    l: parseComponent(main[0], 1),
    c: parseComponent(main[1], 0.4),
    h: parseComponent(main[2], 360, 'deg'),
    alpha: alphaToken === undefined ? 1 : parseComponent(alphaToken, 1),
  };
}

/** Linear-light sRGB components (may be outside 0..1 before clamping). */
export function oklchToLinearSrgb({ l, c, h }: Oklch): [number, number, number] {
  const hr = (h * Math.PI) / 180;
  const a = c * Math.cos(hr);
  const b = c * Math.sin(hr);
  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.291485548 * b;
  const L = l_ ** 3;
  const M = m_ ** 3;
  const S = s_ ** 3;
  return [
    4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S,
    -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S,
    -0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S,
  ];
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

export function relativeLuminance(color: Oklch): number {
  const [r, g, b] = oklchToLinearSrgb(color).map(clamp01) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Composite a translucent foreground over an opaque background in linear sRGB. */
export function compositeLuminance(fg: Oklch, bg: Oklch): number {
  if (fg.alpha >= 1) return relativeLuminance(fg);
  const f = oklchToLinearSrgb(fg).map(clamp01);
  const b = oklchToLinearSrgb(bg).map(clamp01);
  const mix = f.map((v, i) => v * fg.alpha + b[i]! * (1 - fg.alpha)) as [number, number, number];
  return 0.2126 * mix[0] + 0.7152 * mix[1] + 0.0722 * mix[2];
}

export function contrastRatio(fg: string, bg: string): number {
  const b = parseOklch(bg);
  const lf = compositeLuminance(parseOklch(fg), b);
  const lb = relativeLuminance(b);
  const [hi, lo] = lf > lb ? [lf, lb] : [lb, lf];
  return (hi + 0.05) / (lo + 0.05);
}

export function toCssHex(color: Oklch): string {
  const enc = (v: number) => {
    const x = clamp01(v);
    const s = x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055;
    return Math.round(s * 255)
      .toString(16)
      .padStart(2, '0');
  };
  const [r, g, b] = oklchToLinearSrgb(color);
  return `#${enc(r)}${enc(g)}${enc(b)}`;
}
