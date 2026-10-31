import { useCallback, useEffect, useRef, useState } from 'react';

interface WakeLockLike {
  release: () => Promise<void>;
}

/**
 * A countdown for timed counts. Elapsed time comes from the clock, not from ticks, so a backgrounded
 * tab does not lose seconds. The screen is kept on while it runs, where the browser allows it.
 */
export function useCountdown(totalS: number) {
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [pausedMs, setPausedMs] = useState(0);
  const [pauseStart, setPauseStart] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [done, setDone] = useState(false);
  const lock = useRef<WakeLockLike | null>(null);

  const running = startedAt !== null && pauseStart === null && !done;
  const elapsedMs = startedAt === null ? 0 : (pauseStart ?? now) - startedAt - pausedMs;
  const elapsedS = Math.min(totalS, Math.max(0, Math.floor(elapsedMs / 1000)));
  const remainingS = totalS - elapsedS;

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [running]);

  useEffect(() => {
    if (running && remainingS <= 0) setDone(true);
  }, [running, remainingS]);

  useEffect(() => {
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<WakeLockLike> } };
    if (!running || !nav.wakeLock) return;
    let cancelled = false;
    nav.wakeLock
      .request('screen')
      .then((l) => {
        if (cancelled) void l.release().catch(() => undefined);
        else lock.current = l;
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      void lock.current?.release().catch(() => undefined);
      lock.current = null;
    };
  }, [running]);

  const start = useCallback(() => {
    const t = Date.now();
    setStartedAt(t);
    setNow(t);
    setPausedMs(0);
    setPauseStart(null);
    setDone(false);
  }, []);
  const pause = useCallback(() => setPauseStart(Date.now()), []);
  const resume = useCallback(() => {
    setPauseStart((p) => {
      if (p !== null) setPausedMs((ms) => ms + Date.now() - p);
      return null;
    });
  }, []);
  const finish = useCallback(() => {
    setNow(Date.now());
    setDone(true);
  }, []);

  return {
    startedAt,
    running,
    paused: pauseStart !== null,
    done,
    elapsedS,
    remainingS,
    start,
    pause,
    resume,
    finish,
  };
}

export const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
