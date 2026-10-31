import type { UsageRecord } from './client';
import type { VaultStore } from './vault';

export interface DayUsage {
  date: string;
  byModel: Record<string, { requests: number; inputTokens: number; outputTokens: number }>;
}

/** Local usage meter (§18.4): requests and tokens per model per day, kept for 31 days. */
export class UsageMeter {
  constructor(private readonly store: VaultStore) {}

  async all(): Promise<DayUsage[]> {
    return (await this.store.get<DayUsage[]>('usage').catch(() => undefined)) ?? [];
  }

  async record(u: UsageRecord, date: string): Promise<void> {
    const days = await this.all();
    let day = days.find((d) => d.date === date);
    if (!day) {
      day = { date, byModel: {} };
      days.push(day);
    }
    const m = (day.byModel[u.model] ??= { requests: 0, inputTokens: 0, outputTokens: 0 });
    m.requests += 1;
    m.inputTokens += u.inputTokens;
    m.outputTokens += u.outputTokens;
    days.sort((a, b) => (a.date < b.date ? -1 : 1));
    await this.store.put('usage', days.slice(-31));
  }

  async today(date: string): Promise<{ requests: number; tokens: number }> {
    const day = (await this.all()).find((d) => d.date === date);
    let requests = 0;
    let tokens = 0;
    for (const m of Object.values(day?.byModel ?? {})) {
      requests += m.requests;
      tokens += m.inputTokens + m.outputTokens;
    }
    return { requests, tokens };
  }

  async clear(): Promise<void> {
    await this.store.delete('usage');
  }
}

/** True when the next request would go over the person's own daily soft cap (null = no cap). */
export function overSoftCap(requestsToday: number, cap: number | null): boolean {
  return cap !== null && cap > 0 && requestsToday >= cap;
}
