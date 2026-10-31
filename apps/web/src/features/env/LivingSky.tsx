import type { Forecast, Garden } from '@plantpal/schemas';
import { moonPhase, skyPhase, startOfLocalDay, sunPosition, sunTimes, todayIn } from '@plantpal/domain';
import { prefersReducedMotion } from '@plantpal/ui/motion';
import { Moon, Sunrise, Sunset } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { gardenCoords, useNow } from '../../env/hooks';
import { isWet, weatherKind } from '../../env/weather';
import { useFormat, useT } from '../../i18n';
import { usePrefs } from '../../state/prefs';
import { WeatherIcon } from './WeatherIcon';

/** Lit-area path for a moon of radius 18 centred at (20, 20); `fraction` 0 = new, 0.5 = full. */
function moonPath(fraction: number): string {
  const r = 18;
  const waxing = fraction < 0.5;
  const rx = Math.abs(Math.cos(2 * Math.PI * fraction)) * r;
  const crescent = fraction < 0.25 || fraction > 0.75;
  const limb = waxing ? 1 : 0;
  const term = waxing ? (crescent ? 0 : 1) : crescent ? 1 : 0;
  return `M20,2 A${r},${r} 0 0,${limb} 20,38 A${rx.toFixed(2)},${r} 0 0,${term} 20,2 Z`;
}

function useDocumentVisible() {
  const [visible, setVisible] = useState(
    () => typeof document === 'undefined' || document.visibilityState === 'visible',
  );
  useEffect(() => {
    const on = () => setVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, []);
  return visible;
}

// Deterministic "random" layout for raindrops (no Math.random during render).
const DROPS = Array.from({ length: 48 }, (_, i) => ({
  left: (i * 37) % 100,
  delay: ((i * 53) % 90) / 100,
  duration: 0.7 + ((i * 29) % 40) / 100,
}));

/**
 * Generative sky from real data (§6.18): sun altitude sets the gradient, cloud cover adds clouds,
 * precipitation adds a light rain layer (≤ 60 drops, paused when hidden, off for reduced motion or
 * low-data mode), and the moon shows its real phase at night, mirrored in the southern hemisphere.
 */
export function LivingSky({
  garden,
  forecast,
  children,
}: {
  garden: Garden;
  forecast: Forecast | undefined;
  children?: ReactNode;
}) {
  const t = useT();
  const f = useFormat();
  const now = useNow(60_000);
  const visible = useDocumentVisible();
  const motion = usePrefs((s) => s.motion);
  const lowData = usePrefs((s) => s.lowData);
  const reduced = motion === 'reduce' || (motion === 'system' && prefersReducedMotion());
  const coords = gardenCoords(garden);
  const tz = garden.timezone;

  const sky = useMemo(() => {
    if (!coords) return null;
    const pos = sunPosition(now, coords.lat, coords.lon);
    const soon = sunPosition(now + 10 * 60_000, coords.lat, coords.lon);
    const noon = startOfLocalDay(todayIn(tz, now), tz) + 12 * 3600_000;
    const times = sunTimes(noon, coords.lat, coords.lon);
    return { pos, phase: skyPhase(pos.elevation, soon.elevation > pos.elevation), times };
  }, [coords, now, tz]);

  const moon = moonPhase(now);
  const cloud = forecast?.current.cloudCoverPct.value ?? 0;
  const kind = weatherKind(forecast?.current.weatherCode.value);
  const raining = isWet(kind) || (forecast?.current.precipitationMm.value ?? 0) > 0;
  const night = sky ? sky.pos.elevation < -4 : false;
  const south = (coords?.lat ?? 0) < 0;

  // Sun position across the sky: x from the day's progress, y from elevation.
  let sunX = 50;
  let sunY = 30;
  if (sky?.times.sunrise && sky.times.sunset) {
    const p = (now - sky.times.sunrise) / (sky.times.sunset - sky.times.sunrise);
    sunX = 8 + Math.min(1, Math.max(0, p)) * 84;
  }
  if (sky) sunY = 80 - Math.max(-10, Math.min(90, sky.pos.elevation)) * 0.75;

  const time = (ms: number | null) => (ms === null ? '—' : f.time(new Date(ms), tz));
  const temp = forecast?.current.temperatureC.value;

  return (
    <section
      aria-labelledby="sky-title"
      className={`sky ${sky ? `sky-${sky.phase}` : 'sky-static'} ${visible ? '' : 'sky-paused'} relative overflow-hidden rounded-xl shadow-2`}
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        {sky && !night && sky.pos.elevation > -2 && (
          <div
            className="absolute size-14 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              left: `${sunX}%`,
              top: `${sunY}%`,
              background: 'radial-gradient(circle, #fff7d6 0%, #ffd77a 45%, rgb(255 215 122 / 0) 70%)',
              opacity: 1 - (cloud / 100) * 0.6,
            }}
          />
        )}
        {night && (
          <svg
            viewBox="0 0 40 40"
            className="absolute top-6 right-8 size-12"
            style={south ? { transform: 'scaleX(-1)' } : undefined}
          >
            <circle cx="20" cy="20" r="18" fill="rgb(255 255 255 / 0.12)" />
            <path d={moonPath(moon.fraction)} fill="#f4f1de" />
          </svg>
        )}
        {cloud > 10 &&
          [
            { left: '5%', top: '12%', w: 220, h: 70 },
            { left: '45%', top: '6%', w: 260, h: 80 },
            { left: '70%', top: '22%', w: 200, h: 60 },
          ].map((c, i) => (
            <div
              key={i}
              className="sky-cloud"
              style={{
                left: c.left,
                top: c.top,
                width: c.w,
                height: c.h,
                opacity: Math.min(0.95, cloud / 100),
                animationDelay: `${-i * 20}s`,
              }}
            />
          ))}
        {cloud > 60 && (
          <div
            className="absolute inset-0"
            style={{ background: 'rgb(90 100 110 / 0.35)', opacity: (cloud - 60) / 40 }}
          />
        )}
        {raining &&
          !reduced &&
          !lowData &&
          visible &&
          DROPS.map((d, i) => (
            <span
              key={i}
              className="sky-drop"
              style={{
                left: `${d.left}%`,
                animationDelay: `${d.delay}s`,
                animationDuration: `${d.duration}s`,
              }}
            />
          ))}
      </div>

      <div className="relative flex min-h-56 flex-col justify-end p-3 pt-20 sm:p-4 sm:pt-24">
        <div className="flex max-w-xl flex-col gap-3 rounded-lg bg-surface p-4 shadow-2">
          <h2 id="sky-title" className="sr-only">
            {t.env.outsideNow}
          </h2>
          <div className="flex items-center gap-4">
            <span className="text-accent-ink">
              <WeatherIcon kind={kind} isDay={!night} className="size-10" />
            </span>
            <div className="min-w-0">
              <p className="font-display text-display-l leading-none text-ink">
                {temp === null || temp === undefined ? '—' : `${f.number(temp)}°`}
              </p>
              <p className="mt-1 text-body-s text-muted">
                {t.env.weather[kind]}
                {forecast?.current.apparentTemperatureC.value != null
                  ? ` · ${t.env.feelsLike(`${f.number(forecast.current.apparentTemperatureC.value)}°`)}`
                  : ''}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-body-s text-ink">
            <span>
              {t.env.localTime} {f.time(new Date(now), tz)}
            </span>
            {sky?.times.polar === 'day' && <span>{t.env.polarDay}</span>}
            {sky?.times.polar === 'night' && <span>{t.env.polarNight}</span>}
            {sky && sky.times.polar === null && (
              <>
                <span className="inline-flex items-center gap-1">
                  <Sunrise className="size-4 text-muted" aria-hidden="true" />
                  <span className="sr-only">{t.env.sunrise}</span>
                  {time(sky.times.sunrise)}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Sunset className="size-4 text-muted" aria-hidden="true" />
                  <span className="sr-only">{t.env.sunset}</span>
                  {time(sky.times.sunset)}
                </span>
              </>
            )}
            {night && (
              <span className="inline-flex items-center gap-1">
                <Moon className="size-4 text-muted" aria-hidden="true" />
                {t.env.moon[moon.name]}
              </span>
            )}
          </div>
          {children}
        </div>
      </div>
    </section>
  );
}
