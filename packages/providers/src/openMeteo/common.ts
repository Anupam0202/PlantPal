/** "+05:30" for 19800 seconds. */
export function offsetString(seconds: number): string {
  const sign = seconds < 0 ? '-' : '+';
  const abs = Math.abs(seconds);
  const h = Math.floor(abs / 3600);
  const m = Math.floor((abs % 3600) / 60);
  return `${sign}${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Open-Meteo returns local wall times without an offset when `timezone=auto`; this adds the offset. */
export function localToIso(local: string, offsetSeconds: number): string {
  const withSeconds = /T\d{2}:\d{2}$/.test(local) ? `${local}:00` : local;
  return `${withSeconds}${offsetString(offsetSeconds)}`;
}

export function localToEpoch(local: string, offsetSeconds: number): number {
  return Date.parse(localToIso(local, offsetSeconds));
}

/**
 * The value at the hour nearest to `now` that actually has data — never simply the last element,
 * and never a missing value turned into zero.
 */
export function nearestValid(
  times: readonly string[],
  values: ReadonlyArray<number | null>,
  now: number,
  offsetSeconds: number,
): { value: number | null; time: string | null } {
  let best = -1;
  let bestDist = Number.POSITIVE_INFINITY;
  for (let i = 0; i < times.length; i++) {
    const v = values[i];
    if (v === null || v === undefined) continue;
    const t = localToEpoch(times[i] ?? '', offsetSeconds);
    if (!Number.isFinite(t)) continue;
    const d = Math.abs(t - now);
    if (d < bestDist) {
      best = i;
      bestDist = d;
    }
  }
  // More than 3 hours away is not "current".
  if (best < 0 || bestDist > 3 * 3600_000) return { value: null, time: null };
  return { value: values[best] ?? null, time: localToIso(times[best] ?? '', offsetSeconds) };
}

export function checkUnits(
  provider: string,
  units: Record<string, unknown> | undefined,
  expected: Record<string, string>,
): string[] {
  const problems: string[] = [];
  for (const [k, u] of Object.entries(expected)) {
    const got = units?.[k];
    if (got !== undefined && got !== u)
      problems.push(`${provider}: ${k} in "${String(got)}", expected "${u}"`);
  }
  return problems;
}
