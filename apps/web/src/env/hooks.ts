import { useQuery } from '@tanstack/react-query';
import { roundCoords } from '@plantpal/providers';
import type { Garden } from '@plantpal/schemas';
import { useEffect, useState } from 'react';
import { getEnvSource } from './source';

export interface Coords {
  lat: number;
  lon: number;
}

export function gardenCoords(garden: Garden | null | undefined): Coords | null {
  const p = garden?.place;
  return p && p.lat !== null && p.lon !== null ? { lat: p.lat, lon: p.lon } : null;
}

/** Query keys use rounded coordinates: precise positions never enter caches or devtools. */
const key = (name: string, c: Coords | null, step = 0.05) =>
  ['env', name, c ? roundCoords(c.lat, c.lon, step) : null] as const;

const common = { retry: false, refetchOnWindowFocus: true, networkMode: 'always' } as const;

export function useForecast(c: Coords | null) {
  return useQuery({
    queryKey: key('forecast', c),
    queryFn: ({ signal }) => getEnvSource().forecast(c!.lat, c!.lon, signal),
    enabled: c !== null,
    staleTime: 15 * 60_000,
    refetchInterval: 30 * 60_000,
    ...common,
  });
}

export function useAir(c: Coords | null) {
  return useQuery({
    queryKey: key('air', c),
    queryFn: ({ signal }) => getEnvSource().air(c!.lat, c!.lon, signal),
    enabled: c !== null,
    staleTime: 15 * 60_000,
    ...common,
  });
}

export function useElevation(c: Coords | null) {
  return useQuery({
    queryKey: key('elevation', c, 0.01),
    queryFn: ({ signal }) => getEnvSource().elevation(c!.lat, c!.lon, signal),
    enabled: c !== null,
    staleTime: Number.POSITIVE_INFINITY,
    ...common,
  });
}

export function useSolarClimatology(c: Coords | null) {
  return useQuery({
    queryKey: key('solar', c, 0.1),
    queryFn: ({ signal }) => getEnvSource().solarClimatology(c!.lat, c!.lon, signal),
    enabled: c !== null,
    staleTime: Number.POSITIVE_INFINITY,
    ...common,
  });
}

/** Local climate (hardiness, frost, season length); fetched once per coarse cell and cached for a year. */
export function useClimateProfile(c: Coords | null) {
  return useQuery({
    queryKey: key('climate', c, 0.1),
    queryFn: ({ signal }) => getEnvSource().climateProfile(c!.lat, c!.lon, signal),
    enabled: c !== null,
    staleTime: Number.POSITIVE_INFINITY,
    ...common,
  });
}

/** Climate model change; only fetched on request because the download is large (~3 MB). */
export function useClimateProjection(c: Coords | null, enabled: boolean) {
  return useQuery({
    queryKey: key('projection', c, 0.1),
    queryFn: ({ signal }) => getEnvSource().climateProjection(c!.lat, c!.lon, signal),
    enabled: c !== null && enabled,
    staleTime: Number.POSITIVE_INFINITY,
    ...common,
  });
}

export function usePlaceSearch(query: string, lang: string) {
  const [debounced, setDebounced] = useState(query);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);
  return useQuery({
    queryKey: ['env', 'places', debounced.toLowerCase(), lang],
    queryFn: ({ signal }) => getEnvSource().searchPlaces(debounced, lang, signal),
    enabled: debounced.length >= 2,
    staleTime: 60 * 60_000,
    retry: false,
  });
}

export function useProviderStatus() {
  return useQuery({
    queryKey: ['env', 'status'],
    queryFn: () => getEnvSource().status(),
    refetchInterval: 30_000,
    retry: false,
  });
}

/** Re-renders every `intervalMs` (for clocks and the sky). */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
