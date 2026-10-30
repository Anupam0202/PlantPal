import { germinationRate } from '@plantpal/domain';
import type { SEED_LOT_ORIGINS, SEED_LOT_UNITS, SeedLot } from '@plantpal/schemas';
import { usePrefs, type LocalePref } from '../../state/prefs';

type Origin = (typeof SEED_LOT_ORIGINS)[number];
type Unit = (typeof SEED_LOT_UNITS)[number];

/** Seed library and propagation lineage (§6.13). */
const en = {
  title: 'Seed library',
  intro: 'Seeds you saved, bought or were given, how well they sprout, and what grew from them.',
  add: 'Add seed lot',
  addTitle: 'New seed lot',
  empty: 'No seeds kept yet',
  emptyBody: 'Save seeds from a plant that did well, or add a packet you bought.',
  name: 'Name',
  fromPlant: 'Saved from',
  noPlant: 'Not from a plant here',
  origin: 'Where they came from',
  origins: {
    saved: 'Saved from my plant',
    bought: 'Bought',
    gift: 'A gift',
    swap: 'Swapped',
  } satisfies Record<Origin, string>,
  collectedOn: 'Collected or bought on',
  quantity: 'How many',
  unit: 'Unit',
  units: { seeds: 'seeds', g: 'g', packets: 'packets', heads: 'seed heads' } satisfies Record<Unit, string>,
  storage: 'Stored where and how',
  notes: 'Notes',
  save: 'Save seed lot',
  saved: 'Seed lot saved',
  germination: 'Germination',
  germinationRate: (pct: number) => `${pct}% sprouted`,
  untested: 'Not tested yet',
  addTest: 'Add germination test',
  testedOn: 'Tested on',
  sown: 'Sown',
  sprouted: 'Sprouted',
  days: 'Days to sprout (optional)',
  testSaved: 'Test added',
  testRow: (sprouted: number, sown: number, days: number | null) =>
    `${sprouted} of ${sown} sprouted${days ? ` in ${days} days` : ''}`,
  grown: 'Grown from this lot',
  noneGrown: 'Nothing grown from it yet.',
  grow: 'Grow a plant from this lot',
  offer: 'Offer on the exchange',
  offered: 'Listed on the exchange',
  offerFailed: 'Couldn’t list it. Please try again.',
  offerNeeds: 'Offering seeds needs an account and a community profile.',
  delete: 'Delete seed lot',
  deleted: 'Seed lot deleted',
  saveSeeds: 'Save seeds from this plant',
  family: 'Family tree',
  familyIntro: 'Where this plant came from and what grew from it.',
  ancestors: 'Came from',
  descendants: 'Grew into',
  noFamily: 'No recorded parents or offspring yet.',
  lot: 'Seed lot',
  plant: 'Plant',
  biosecurity:
    'Local rules on sharing seeds and plants vary. PlantPal records are not official phytosanitary documents or plant passports.',
};

export type SeedMessages = typeof en;

const hi: SeedMessages = {
  ...en,
  title: 'बीज संग्रह',
  add: 'बीज संग्रह जोड़ें',
  save: 'बीज संग्रह सहेजें',
  germination: 'अंकुरण',
  family: 'परिवार वृक्ष',
};

const es: SeedMessages = {
  ...en,
  title: 'Banco de semillas',
  add: 'Añadir lote de semillas',
  save: 'Guardar lote',
  germination: 'Germinación',
  family: 'Árbol familiar',
};

const catalogs: Record<LocalePref, SeedMessages> = { en, hi, es };

export function useSeedT(): SeedMessages {
  return catalogs[usePrefs((s) => s.locale)];
}

/** "80% sprouted", or "Not tested yet". */
export function rateLabel(s: SeedMessages, lot: Pick<SeedLot, 'germinationTests'>): string {
  const r = germinationRate(lot.germinationTests);
  return r === null ? s.untested : s.germinationRate(Math.round(r * 100));
}
