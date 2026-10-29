/** The current time, read in event handlers (kept out of render so components stay pure). */
export const clockNow = (): number => Date.now();
