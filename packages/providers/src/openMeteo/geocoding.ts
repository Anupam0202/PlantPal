import { z } from 'zod';
import type { PlaceSearch } from '@plantpal/schemas';
import { ProviderError } from '../core/errors';
import { num, provenance } from '../core/provenance';

export const GEOCODING_ENDPOINT = 'https://geocoding-api.open-meteo.com/v1/search';

export function geocodingUrl(name: string, language: string, count = 8): string {
  const q = new URLSearchParams({
    name: name.trim().slice(0, 100),
    count: String(count),
    language,
    format: 'json',
  });
  return `${GEOCODING_ENDPOINT}?${q.toString()}`;
}

const Item = z.object({
  id: z.number(),
  name: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  elevation: z.number().optional(),
  timezone: z.string().optional(),
  population: z.number().optional(),
  country: z.string().optional(),
  country_code: z.string().optional(),
  admin1: z.string().optional(),
});
const Raw = z.object({ results: z.array(z.unknown()).optional() });

export function parsePlaces(json: unknown, ctx: { retrievedAt: string; demo?: boolean }): PlaceSearch {
  const r = Raw.safeParse(json);
  if (!r.success)
    throw new ProviderError('BAD_RESPONSE', 'open-meteo-geocoding', 'Unexpected geocoding shape');
  const results = (r.data.results ?? []).flatMap((x) => {
    const p = Item.safeParse(x);
    if (!p.success) return [];
    const i = p.data;
    return [
      {
        id: i.id,
        name: i.name,
        admin1: i.admin1 ?? null,
        country: i.country ?? null,
        countryCode: i.country_code ?? null,
        lat: i.latitude,
        lon: i.longitude,
        timezone: i.timezone ?? null,
        population: num(i.population),
        elevationM: num(i.elevation),
      },
    ];
  });
  return {
    provenance: provenance('open-meteo-geocoding', {
      retrievedAt: ctx.retrievedAt,
      lat: null,
      lon: null,
      demo: ctx.demo,
    }),
    results,
  };
}
