import { expect, type Page, type Route } from '@playwright/test';
import { fixtures } from '../../../packages/providers/src';

const cors = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };

function todayIn(tz: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/** Answers provider requests with fixtures shaped like the real APIs, and records what was sent. */
export async function mockProviders(
  page: Page,
  opts: {
    airDown?: boolean;
    allDown?: boolean;
    /** Edit the forecast before it is served (e.g. a frosty night). */
    patchForecast?: (f: ReturnType<typeof fixtures.forecastFixture>) => void;
  } = {},
) {
  const sent: string[] = [];
  const state = { airDown: opts.airDown ?? false };
  if (opts.allDown) {
    // Every provider host answers 503: the app must still work through manual answers.
    for (const host of [
      'https://geocoding-api.open-meteo.com/**',
      'https://api.open-meteo.com/**',
      'https://air-quality-api.open-meteo.com/**',
      'https://archive-api.open-meteo.com/**',
      'https://power.larc.nasa.gov/**',
    ])
      await page.route(host, (route) => {
        sent.push(route.request().url());
        return route.fulfill({ status: 503, headers: cors, body: '{}' });
      });
    return { sent, state };
  }
  const reply = (body: unknown) => (route: Route) => {
    sent.push(route.request().url());
    return route.fulfill({ status: 200, headers: cors, body: JSON.stringify(body) });
  };
  await page.route('https://geocoding-api.open-meteo.com/**', reply(fixtures.geocodingFixture));
  await page.route('https://api.open-meteo.com/v1/forecast**', (route) => {
    const url = new URL(route.request().url());
    const south = Number(url.searchParams.get('latitude')) < 0;
    const body = fixtures.forecastFixture({
      start: todayIn(south ? 'Australia/Sydney' : 'Asia/Kolkata'),
      currentHour: new Date().getUTCHours(),
      timezone: south ? 'Australia/Sydney' : 'Asia/Kolkata',
      utcOffsetSeconds: south ? 39600 : 19800,
    });
    opts.patchForecast?.(body);
    return reply(body)(route);
  });
  await page.route('https://api.open-meteo.com/v1/elevation**', reply(fixtures.elevationFixture(559)));
  await page.route('https://air-quality-api.open-meteo.com/**', (route) => {
    sent.push(route.request().url());
    if (state.airDown) return route.fulfill({ status: 503, headers: cors, body: '{}' });
    return route.fulfill({ status: 200, headers: cors, body: JSON.stringify(fixtures.airFixture()) });
  });
  await page.route('https://power.larc.nasa.gov/**', reply(fixtures.solarFixture()));
  // Species lookups: GBIF backbone match, Wikimedia Commons photos and Wikidata names.
  await page.route('https://api.gbif.org/v1/species/match**', (route) => {
    const name = new URL(route.request().url()).searchParams.get('name') ?? '';
    return reply(fixtures.speciesMatchFixture(name))(route);
  });
  await page.route('https://commons.wikimedia.org/w/api.php**', (route) => {
    const q = (new URL(route.request().url()).searchParams.get('gsrsearch') ?? '')
      .replace(/"|filetype:bitmap/g, '')
      .trim();
    return reply(fixtures.commonsFixture(q))(route);
  });
  await page.route('https://www.wikidata.org/w/api.php**', (route) => {
    const u = new URL(route.request().url());
    if (u.searchParams.get('action') === 'wbgetentities')
      return reply(fixtures.wikidataLabelsFixture(u.searchParams.get('ids') ?? ''))(route);
    const key = Number((u.searchParams.get('srsearch') ?? '').split('=')[1]);
    return reply(fixtures.wikidataSearchFixture(key))(route);
  });
  // Nature nearby: iNaturalist species counts and GBIF occurrence search.
  await page.route('https://api.inaturalist.org/**', (route) => {
    const iconic = new URL(route.request().url()).searchParams.get('iconic_taxa');
    const group = iconic === 'Aves' ? 'birds' : iconic === 'Plantae' ? 'plants' : 'insects';
    return reply(fixtures.inatSpeciesCountsFixture(group))(route);
  });
  await page.route('https://api.gbif.org/v1/occurrence/search**', (route) => {
    const k = new URL(route.request().url()).searchParams.get('kingdomKey');
    return reply(fixtures.gbifNearbyFixtureFor(k === '6' ? 'plants' : 'animals'))(route);
  });
  // Commons thumbnails: a tiny image so pages render without the network.
  await page.route('https://upload.wikimedia.org/**', (route) =>
    route.fulfill({
      status: 200,
      headers: { 'content-type': 'image/png' },
      body: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
        'base64',
      ),
    }),
  );
  await page.route('https://climate-api.open-meteo.com/**', (route) => {
    const url = new URL(route.request().url());
    const from = Number(url.searchParams.get('start_date')?.slice(0, 4));
    const to = Number(url.searchParams.get('end_date')?.slice(0, 4));
    const models = (url.searchParams.get('models') ?? '').split(',').filter(Boolean);
    return reply(fixtures.dailyFixture({ from, to, models, mean: from >= 2031 ? 16.3 : 15 }))(route);
  });
  await page.route('https://archive-api.open-meteo.com/**', (route) => {
    const url = new URL(route.request().url());
    const from = Number(url.searchParams.get('start_date')?.slice(0, 4));
    const to = Number(url.searchParams.get('end_date')?.slice(0, 4));
    // A warm, frost-free series (Pune-like), enough years for hardiness and frost statistics.
    return reply(fixtures.dailyFixture({ from, to, mean: 25, amplitude: 4, diurnal: 7 }))(route);
  });
  return { sent, state };
}

export async function createGardenAt(page: Page, query: string, place: string) {
  await page.goto('/garden/new');
  await page.getByLabel('Garden name').fill('Balcony');
  await page.getByRole('searchbox', { name: 'Search for a town or area' }).fill(query);
  await page
    .getByRole('list', { name: 'Places found' })
    .getByRole('button', { name: new RegExp(place) })
    .click();
  await expect(page.getByText(/° [NS], .*° [EW]/).first()).toBeVisible();
}
