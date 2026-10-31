import type { GreenKind } from '@plantpal/schemas';
import { usePrefs, type LocalePref } from '../../state/prefs';

/** Corridor map (§6.16) and the community hex map (§20). */
const en = {
  unavailable: 'The map can’t be shown on this device. The list below has the same information.',
  basemapMissing: 'Background map unavailable right now; the hexagons are still accurate.',
  corridor: {
    title: 'Green corridor',
    hub: 'Green corridor',
    hubBody: 'How your garden links to mapped parks, woods and gardens nearby.',
    intro:
      'Green spaces close together let insects and birds move between them. Your garden can be a stepping stone.',
    needLocation: 'Set your garden’s location to see the green space around it.',
    addLocation: 'Add a location',
    needServer: 'The corridor map needs the PlantPal server, which isn’t available here.',
    failed: 'Couldn’t load mapped green space. Please try again later.',
    retry: 'Try again',
    loading: 'Looking up mapped green space…',
    mapLabel: 'Map of mapped green space around your garden',
    steppingStone: (distance: string, kind: string) =>
      `Your garden is a stepping stone ${distance} from the nearest mapped ${kind}.`,
    inside: (kind: string) => `Your garden is inside mapped ${kind}.`,
    none: 'No mapped green space within about 1 km. Every planted balcony or yard here counts even more.',
    share: (pct: number) => `About ${pct}% of the area around you is mapped green space.`,
    nearest: 'Nearest mapped green space',
    unnamed: 'Unnamed',
    away: (distance: string) => `${distance} away`,
    here: 'You are here',
    legend: 'Darker hexagons have more mapped green space (each is about 0.1 km²).',
    honesty:
      'This is mapped land cover from OpenStreetMap, not habitat quality, and mapping is more complete in some places than others.',
    truncated: 'Only the largest areas are shown here.',
    privacy:
      'Only a coarse area (about 5 km²) is sent to look this up. Distances are worked out on this device.',
    kinds: {
      park: 'park',
      wood: 'wood',
      meadow: 'meadow or grassland',
      allotment: 'allotment',
      cemetery: 'cemetery',
      garden: 'garden',
      'green-roof': 'green roof',
    } satisfies Record<GreenKind, string>,
  },
  community: {
    tab: 'Map',
    mapLabel: 'Map of active growers in your area',
    intro:
      'Hexagons of about 5 km² with active growers. An area appears only when at least five people are active there, so no one can be singled out.',
    empty: 'Not enough active growers to show the map yet',
    emptyBody:
      'Areas appear once at least five people nearby have shared something in the last 90 days. This protects everyone’s privacy.',
    growers: (n: number) => `${n} active growers`,
    where: (distance: string, direction: string) => `${distance} ${direction} of the area centre`,
    centre: 'At the area centre',
    directions: ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'],
  },
};

export type MapMessages = typeof en;
const catalogs: Record<LocalePref, MapMessages> = {
  en,
  hi: { ...en, corridor: { ...en.corridor, title: 'हरित गलियारा', hub: 'हरित गलियारा' } },
  es: { ...en, corridor: { ...en.corridor, title: 'Corredor verde', hub: 'Corredor verde' } },
};

export function useMapT(): MapMessages {
  return catalogs[usePrefs((s) => s.locale)];
}
