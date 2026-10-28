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
export async function mockProviders(page: Page, opts: { airDown?: boolean } = {}) {
  const sent: string[] = [];
  const state = { airDown: opts.airDown ?? false };
  const reply = (body: unknown) => (route: Route) => {
    sent.push(route.request().url());
    return route.fulfill({ status: 200, headers: cors, body: JSON.stringify(body) });
  };
  await page.route('https://geocoding-api.open-meteo.com/**', reply(fixtures.geocodingFixture));
  await page.route('https://api.open-meteo.com/v1/forecast**', (route) => {
    const url = new URL(route.request().url());
    const south = Number(url.searchParams.get('latitude')) < 0;
    return reply(
      fixtures.forecastFixture({
        start: todayIn(south ? 'Australia/Sydney' : 'Asia/Kolkata'),
        currentHour: new Date().getUTCHours(),
        timezone: south ? 'Australia/Sydney' : 'Asia/Kolkata',
        utcOffsetSeconds: south ? 39600 : 19800,
      }),
    )(route);
  });
  await page.route('https://api.open-meteo.com/v1/elevation**', reply(fixtures.elevationFixture(559)));
  await page.route('https://air-quality-api.open-meteo.com/**', (route) => {
    sent.push(route.request().url());
    if (state.airDown) return route.fulfill({ status: 503, headers: cors, body: '{}' });
    return route.fulfill({ status: 200, headers: cors, body: JSON.stringify(fixtures.airFixture()) });
  });
  await page.route('https://power.larc.nasa.gov/**', reply(fixtures.solarFixture()));
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
