/// <reference lib="webworker" />
import { sunHoursGrid, type SunGridOptions } from '@plantpal/domain';
import type { LayoutBody } from '@plantpal/schemas';

/** Direct-sun hours on the plan's grid, computed off the main thread (§6.7). */
self.onmessage = (e: MessageEvent<{ id: number; body: LayoutBody; opts: SunGridOptions }>) => {
  const { id, body, opts } = e.data;
  try {
    const g = sunHoursGrid(body, opts);
    (self as unknown as Worker).postMessage({ id, grid: g }, [g.hours.buffer]);
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, error: (err as Error).message });
  }
};
