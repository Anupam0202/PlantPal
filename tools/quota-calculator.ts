/**
 * Quota calculator (§15.5, release gate 10). Puts the declared envelope against the free limits and
 * fails when a default deployment would use more than 70% of any of them.
 *
 *   pnpm check:quota            # table for both modes; exit 1 if the default mode is over 70%
 *
 * Limits were researched in October 2026 for the specification (§15.3) and must be re-verified on
 * the providers' pages before launch. The envelope is an assumption, not observed demand.
 */
import { forecastUrl, airUrl, PROVIDERS } from '../packages/providers/src';

export const RESEARCHED = '2026-10-27';
export const THRESHOLD = 0.7;

export interface Limit {
  id: string;
  label: string;
  perDay: number;
  source: string;
}

export const LIMITS: Limit[] = [
  {
    id: 'open-meteo',
    label: 'Open-Meteo free API (non-commercial), weighted calls per day per IP',
    perDay: 10_000,
    source: 'https://open-meteo.com/en/pricing',
  },
  {
    id: 'workers',
    label: 'Cloudflare Workers Free: requests per day (static assets not counted)',
    perDay: 100_000,
    source: 'https://developers.cloudflare.com/workers/platform/limits/',
  },
  {
    id: 'd1-writes',
    label: 'Cloudflare D1 Free: rows written per day',
    perDay: 100_000,
    source: 'https://developers.cloudflare.com/d1/platform/pricing/',
  },
  {
    id: 'd1-reads',
    label: 'Cloudflare D1 Free: rows read per day',
    perDay: 5_000_000,
    source: 'https://developers.cloudflare.com/d1/platform/pricing/',
  },
  {
    id: 'durable-objects',
    label: 'Cloudflare Durable Objects Free (SQLite): requests per day',
    perDay: 100_000,
    source: 'https://developers.cloudflare.com/durable-objects/platform/pricing/',
  },
  {
    id: 'overpass',
    label: 'Overpass API (overpass-api.de) fair use: queries per day',
    perDay: 10_000,
    source: 'https://dev.overpass-api.de/overpass-doc/en/preface/commons.html',
  },
];

/** The declared envelope (§15.5). */
export const ENVELOPE = {
  dailyActiveUsers: 1_000,
  coarseCells: 300,
  /** Hours a day with someone active in a cell (worst case: every cell, every waking hour). */
  activeHours: 14,
  /** Share of daily active users with an account who sync. */
  syncingShare: 0.5,
  /** API requests per syncing user per day: pulls on focus and each visible minute, pushes, account calls. */
  apiRequestsPerSyncingUser: 40,
  /** Community calls per daily active user when the community is on (it is off by default). */
  communityRequestsPerUser: 0,
  /** Rows written per synced change: record, change log, idempotency key. */
  rowsPerChange: 3,
  changesPerSyncingUser: 10,
  rowsReadPerRequest: 10,
};

/** Open-Meteo counts a request with more than 10 variables or more than 14 days as several calls. */
export function openMeteoWeight(url: string): number {
  const p = new URL(url).searchParams;
  const vars = ['current', 'hourly', 'daily', 'minutely_15']
    .map((k) => (p.get(k) ?? '').split(',').filter(Boolean).length)
    .reduce((a, b) => a + b, 0);
  const days = Number(p.get('forecast_days') ?? 7) + Number(p.get('past_days') ?? 0);
  return Math.max(1, vars / 10) * Math.max(1, days / 14);
}

export type Mode = 'direct' | 'gateway';

export interface Row {
  limit: Limit;
  worst: number;
  typical: number;
  note: string;
}

export function load(mode: Mode, e = ENVELOPE): Row[] {
  const L = Object.fromEntries(LIMITS.map((l) => [l.id, l])) as Record<string, Limit>;
  const ttlH = (id: 'open-meteo-forecast' | 'open-meteo-air') => PROVIDERS[id].ttlMs / 3_600_000;
  const forecastW = openMeteoWeight(forecastUrl(18.5, 73.85));
  const airW = openMeteoWeight(airUrl(18.5, 73.85));
  const fetchesWorst = (id: 'open-meteo-forecast' | 'open-meteo-air') =>
    e.coarseCells * Math.ceil(e.activeHours / ttlH(id));
  const syncing = e.dailyActiveUsers * e.syncingShare;
  const api = syncing * e.apiRequestsPerSyncingUser + e.dailyActiveUsers * e.communityRequestsPerUser;
  // In gateway mode every environment read also goes through the Worker (one request per page view
  // that needs it; about 6 a day per user).
  const envViaWorker = mode === 'gateway' ? e.dailyActiveUsers * 6 : 0;
  const greenSpace = e.coarseCells / 90; // per tile, cached 90 days

  const meteoWorst =
    mode === 'gateway'
      ? fetchesWorst('open-meteo-forecast') * forecastW + fetchesWorst('open-meteo-air') * airW
      : // Direct mode: each browser calls Open-Meteo from its own IP, so the busiest IP is one person.
        2 * (forecastW + airW) * 4;
  const meteoTypical = mode === 'gateway' ? meteoWorst * 0.36 : 2 * (forecastW + airW);

  return [
    {
      limit: L['open-meteo']!,
      worst: meteoWorst,
      typical: meteoTypical,
      note:
        mode === 'gateway'
          ? `forecast ${forecastW.toFixed(1)} and air ${airW.toFixed(1)} weighted calls per fetch, TTL ${ttlH('open-meteo-forecast')} h and ${ttlH('open-meteo-air')} h, ${e.coarseCells} cells × ${e.activeHours} h`
          : 'browsers call Open-Meteo directly; the busiest IP is one household',
    },
    {
      limit: L.workers!,
      worst: api + envViaWorker + greenSpace,
      typical: (api + envViaWorker + greenSpace) * 0.6,
      note: `${syncing} syncing users × ${e.apiRequestsPerSyncingUser} requests${mode === 'gateway' ? ' + environment reads' : ''}`,
    },
    {
      limit: L['d1-writes']!,
      worst: syncing * e.changesPerSyncingUser * e.rowsPerChange,
      typical: syncing * e.changesPerSyncingUser * e.rowsPerChange * 0.5,
      note: `${e.changesPerSyncingUser} changes × ${e.rowsPerChange} rows per syncing user`,
    },
    {
      limit: L['d1-reads']!,
      worst: (api + envViaWorker) * e.rowsReadPerRequest,
      typical: (api + envViaWorker) * e.rowsReadPerRequest * 0.5,
      note: `${e.rowsReadPerRequest} rows per request (indexed)`,
    },
    {
      limit: L['durable-objects']!,
      // Each API request takes a token from the limiter object; live pings add one per synced push.
      worst: api + envViaWorker + syncing * e.changesPerSyncingUser,
      typical: (api + envViaWorker) * 0.6,
      note: 'rate limiter per request plus garden-room pings',
    },
    {
      limit: L.overpass!,
      worst: greenSpace * 10,
      typical: greenSpace,
      note: 'green space cached per coarse tile for 90 days; worst case all tiles expire together',
    },
  ];
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

function print(mode: Mode) {
  const rows = load(mode);
  console.log(
    `\n${mode === 'direct' ? 'Default deployment (direct provider mode)' : 'Gateway mode (VITE_API_BASE_URL set)'}`,
  );
  for (const r of rows) {
    const share = r.worst / r.limit.perDay;
    console.log(
      `  ${share > THRESHOLD ? '✗' : '✓'} ${r.limit.label}: worst ${Math.round(r.worst).toLocaleString('en')} (${pct(share)}), typical ${Math.round(r.typical).toLocaleString('en')} (${pct(r.typical / r.limit.perDay)}) — ${r.note}`,
    );
  }
  return rows.filter((r) => r.worst / r.limit.perDay > THRESHOLD);
}

if (process.argv[1]?.endsWith('quota-calculator.ts')) {
  console.log(
    `Quota envelope: ${ENVELOPE.dailyActiveUsers} daily active users, ${ENVELOPE.coarseCells} coarse cells. Limits researched ${RESEARCHED}; re-verify before launch.`,
  );
  const over = print('direct');
  const gatewayOver = print('gateway');
  if (gatewayOver.length)
    console.log(
      `\nGateway mode is opt-in. Over ${pct(THRESHOLD)}: ${gatewayOver.map((r) => r.limit.id).join(', ')}. Mitigations before enabling it: longer TTLs, a coarser grid, or keep Open-Meteo direct.`,
    );
  if (over.length) {
    console.error(
      `\nThe default deployment exceeds ${pct(THRESHOLD)} of: ${over.map((r) => r.limit.id).join(', ')}`,
    );
    process.exit(1);
  }
}
