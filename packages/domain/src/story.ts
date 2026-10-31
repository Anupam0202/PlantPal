import type { LocalDate } from './dates';

/** Garden Story (§6.14): a year told from the records, with nothing estimated or invented. */
export interface StoryInput {
  year: number;
  plantings: Array<{ name: string; plantedOn: LocalDate | null }>;
  harvests: Array<{
    name: string;
    massG: number | null;
    count: number | null;
    countLabel: string | null;
    on: LocalDate;
  }>;
  visits: Array<{
    protocol: string;
    on: LocalDate;
    records: Array<{ group: string; taxonName: string | null; count: number | null; state: string }>;
  }>;
  rain: Array<{ on: LocalDate; litres: number }>;
  photos: Array<{ id: string; on: LocalDate }>;
}

export interface Story {
  year: number;
  firstPlantings: Array<{ name: string; on: LocalDate }>;
  /** Weighed and counted totals per plant, kept apart (S1): heaviest first, then most counted. */
  harvests: Array<{ name: string; massG: number; count: number; countLabel: string | null }>;
  visits: number;
  /** Individuals seen per group in timed counts and sightings. */
  visitors: Array<{ group: string; individuals: number }>;
  /** Named species or groups from sightings, alphabetical. */
  named: string[];
  rainLitres: number;
  /** One photo per month at most, in month order. */
  photos: string[];
  empty: boolean;
}

export function gardenStory(i: StoryInput): Story {
  const inYear = (on: LocalDate) => on.startsWith(`${i.year}-`);
  const firstPlantings = i.plantings
    .filter((p): p is { name: string; plantedOn: LocalDate } => p.plantedOn !== null && inYear(p.plantedOn))
    .sort((a, b) => (a.plantedOn < b.plantedOn ? -1 : 1))
    .slice(0, 8)
    .map((p) => ({ name: p.name, on: p.plantedOn }));

  const byPlant = new Map<
    string,
    { name: string; massG: number; count: number; countLabel: string | null }
  >();
  for (const h of i.harvests.filter((x) => inYear(x.on))) {
    const key = h.name.trim().toLowerCase();
    const cur = byPlant.get(key) ?? { name: h.name.trim(), massG: 0, count: 0, countLabel: null };
    cur.massG += h.massG ?? 0;
    cur.count += h.count ?? 0;
    cur.countLabel ??= h.countLabel;
    byPlant.set(key, cur);
  }
  const harvests = [...byPlant.values()]
    .sort((a, b) => b.massG - a.massG || b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, 5);

  const visits = i.visits.filter((v) => inYear(v.on));
  const groups = new Map<string, number>();
  const named = new Set<string>();
  for (const v of visits) {
    if (v.protocol === 'phenology') continue;
    for (const r of v.records) {
      if (r.count !== null && r.count > 0) groups.set(r.group, (groups.get(r.group) ?? 0) + r.count);
      if (r.taxonName && (r.state === 'YES' || (r.count ?? 0) > 0)) named.add(r.taxonName);
    }
  }
  const visitors = [...groups.entries()]
    .map(([group, individuals]) => ({ group, individuals }))
    .sort((a, b) => b.individuals - a.individuals);

  const rainLitres = Math.round(i.rain.filter((r) => inYear(r.on)).reduce((t, r) => t + r.litres, 0));
  const months = new Map<string, string>();
  for (const p of [...i.photos].filter((x) => inYear(x.on)).sort((a, b) => (a.on < b.on ? -1 : 1)))
    if (!months.has(p.on.slice(0, 7))) months.set(p.on.slice(0, 7), p.id);

  const story: Story = {
    year: i.year,
    firstPlantings,
    harvests,
    visits: visits.length,
    visitors,
    named: [...named].sort(),
    rainLitres,
    photos: [...months.values()],
    empty: false,
  };
  story.empty =
    !firstPlantings.length && !harvests.length && !visits.length && !rainLitres && !story.photos.length;
  return story;
}
