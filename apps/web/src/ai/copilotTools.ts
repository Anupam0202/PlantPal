/**
 * The Copilot's tools (§18.6), run on this device. Read tools see only the active garden's records;
 * proposal tools check every id against them and bind the proposal; nothing here writes until the
 * person confirms (see `applyProposal`).
 */
import { taxonById } from '@plantpal/catalog';
import { careQueue, evaluate, todayIn } from '@plantpal/domain';
import {
  bindProposal,
  checkBinding,
  type BindingProblem,
  type CopilotExecutor,
  type Proposal,
  type ProposalPayload,
  type ProposalTool,
} from '@plantpal/ai';
import type { Garden, Zone } from '@plantpal/schemas';
import {
  addObservation,
  createSchedule,
  logCare,
  openHealthCase,
  savePlan,
  updateSchedule,
} from '../data/commands';
import { db, getMeta } from '../data/db';
import { getEnvSource } from '../env/source';
import {
  CATALOG_TAXA,
  CATALOG_VERSION,
  climateFactsOf,
  contextOf,
  ENGINE_VERSION,
  inputsHash,
  planItemsOf,
} from '../features/plan/engine';
import { monthIn } from '../features/plan/usePlanContext';

const alive = <T extends { deletedAt: number | null }>(r: T | undefined): r is T =>
  Boolean(r && r.deletedAt === null);
const DAY = 86_400_000;

export interface CopilotScope {
  garden: Garden;
  /** Who is acting: the signed-in person, or this device for a guest garden. */
  actor: string;
}

/** The active garden and the acting identity; null when there is no garden yet. */
export async function copilotScope(): Promise<CopilotScope | null> {
  const gardens = (await db.gardens.toArray()).filter(alive);
  const activeId = await getMeta<string | null>('activeGardenId');
  const garden = gardens.find((g) => g.id === activeId) ?? gardens[0];
  if (!garden) return null;
  const actor = (await getMeta<string>('deviceId')) ?? `workspace:${garden.workspaceId}`;
  return { garden, actor };
}

async function plantsOf(gardenId: string) {
  return (await db.specimens.where('gardenId').equals(gardenId).toArray()).filter(alive);
}
async function zonesOf(gardenId: string) {
  return (await db.zones.where('gardenId').equals(gardenId).toArray()).filter(alive);
}

function eligibilityFor(garden: Garden, zone: Zone) {
  return contextOf({
    normals: null,
    lat: garden.place?.lat ?? null,
    region: garden.region,
    profile: garden.profile,
    zone,
    climate: climateFactsOf(null, garden.profile?.manualClimate),
    month: monthIn(garden.timezone),
  });
}

/** Facts for one taxon, as the catalogue cites them (toxicity only from cited sources). */
function speciesFacts(taxonKey: string, country: string | null) {
  const t = taxonById(taxonKey);
  if (!t) return { error: 'Unknown taxon key' };
  return {
    taxonKey: t.id,
    scientificName: t.scientificName,
    commonName: t.names.en,
    family: t.family,
    traits: t.traits.map((a) => ({
      trait: a.trait,
      value: a.value,
      unit: a.unit,
      evidence: a.evidence,
      reviewed: a.review === 'reviewed',
    })),
    toxicity: t.toxicity.map((x) => ({ group: x.group, status: x.status, source: x.sourceId })),
    statusInRegion: country ? (t.regions.find((r) => r.region === country)?.status ?? 'UNKNOWN') : 'UNKNOWN',
  };
}

async function read(scope: CopilotScope, name: string, args: Record<string, unknown>): Promise<unknown> {
  const g = scope.garden;
  switch (name) {
    case 'get_garden_overview': {
      const [zones, plants] = await Promise.all([zonesOf(g.id), plantsOf(g.id)]);
      return {
        garden: {
          name: g.name,
          timezone: g.timezone,
          hemisphere: g.hemisphere,
          country: g.region?.countryCode ?? null,
        },
        spaces: zones.map((z) => ({
          id: z.id,
          name: z.name,
          kind: z.kind,
          covered: z.covered,
          sunHoursByMonth: z.sun?.monthlyHours ?? null,
        })),
        plants: plants.map((p) => ({
          id: p.id,
          name: p.displayName,
          scientificName: p.scientificName,
          spaceId: p.zoneId,
          status: p.status,
          plantedOn: p.plantedOn,
        })),
      };
    }
    case 'get_specimen': {
      const p = await db.specimens.get(String(args.specimenId ?? ''));
      if (!alive(p) || p.gardenId !== g.id) return { error: 'No plant with that id in this garden' };
      const schedules = (await db.careSchedules.where('specimenId').equals(p.id).toArray()).filter(alive);
      return {
        id: p.id,
        name: p.displayName,
        scientificName: p.scientificName,
        cultivar: p.cultivar,
        spaceId: p.zoneId,
        containerId: p.containerId,
        status: p.status,
        plantedOn: p.plantedOn,
        notes: p.notes,
        schedules: schedules.map((s) => ({
          id: s.id,
          kind: s.kind,
          title: s.title,
          rule: s.rule,
          pausedUntil: s.pausedUntil,
        })),
      };
    }
    case 'get_recent_activity': {
      const days = Math.min(90, Math.max(1, Number(args.days ?? 14)));
      const since = Date.now() - days * DAY;
      const sid = typeof args.specimenId === 'string' ? args.specimenId : null;
      const keep = (r: {
        gardenId: string;
        specimenId: string | null;
        occurredAt: number;
        deletedAt: number | null;
      }) =>
        r.deletedAt === null &&
        r.gardenId === g.id &&
        r.occurredAt >= since &&
        (!sid || r.specimenId === sid);
      const care = (await db.careEvents.where('gardenId').equals(g.id).toArray()).filter(keep);
      const notes = (await db.observations.where('gardenId').equals(g.id).toArray()).filter(keep);
      return {
        care: care
          .sort((a, b) => b.occurredAt - a.occurredAt)
          .slice(0, 40)
          .map((c) => ({
            on: c.occurredOn,
            plantId: c.specimenId,
            kind: c.kind,
            amountMl: c.amountMl,
            notes: c.notes,
          })),
        notes: notes
          .sort((a, b) => b.occurredAt - a.occurredAt)
          .slice(0, 30)
          .map((o) => ({
            on: o.occurredOn,
            plantId: o.specimenId,
            kind: o.kind,
            title: o.title,
            text: o.notes,
          })),
      };
    }
    case 'get_conditions': {
      if (g.place?.lat == null || g.place.lon == null) return { error: 'The garden has no location' };
      const f = await getEnvSource().forecast(g.place.lat, g.place.lon);
      return { provenance: f.provenance, current: f.current, daily: f.daily };
    }
    case 'get_climate_fit': {
      if (g.place?.lat == null || g.place.lon == null) return { error: 'The garden has no location' };
      const c = await getEnvSource().climateProfile(g.place.lat, g.place.lon);
      return { ...c, months: undefined };
    }
    case 'search_catalog': {
      const q = String(args.query ?? '')
        .trim()
        .toLowerCase();
      if (q.length < 2) return { results: [] };
      return {
        results: CATALOG_TAXA.filter(
          (t) =>
            t.scientificName.toLowerCase().includes(q) ||
            Object.values(t.names).some((n) => n?.toLowerCase().includes(q)),
        )
          .slice(0, 10)
          .map((t) => ({ taxonKey: t.id, scientificName: t.scientificName, commonName: t.names.en })),
      };
    }
    case 'get_species_facts':
      return speciesFacts(String(args.taxonKey ?? ''), g.region?.countryCode ?? null);
    case 'check_eligibility': {
      const t = taxonById(String(args.taxonKey ?? ''));
      const z = await db.zones.get(String(args.zoneId ?? ''));
      if (!t) return { error: 'Unknown taxon key' };
      if (!alive(z) || z.gardenId !== g.id) return { error: 'No space with that id in this garden' };
      const c = evaluate(t, eligibilityFor(g, z));
      return {
        status: c.status,
        findings: c.findings.map((f) => ({
          rule: f.rule,
          outcome: f.outcome,
          reason: f.code,
          params: f.params,
        })),
        nativeStatus: c.nativeStatus,
      };
    }
    case 'get_tasks': {
      const schedules = (await db.careSchedules.where('gardenId').equals(g.id).toArray()).filter(alive);
      const logs = (await db.taskLogs.where('gardenId').equals(g.id).toArray()).map((l) => ({
        ...l,
        voidedAt: l.deletedAt,
      }));
      const q = careQueue({
        schedules,
        logs,
        today: todayIn(g.timezone),
        timeZone: g.timezone,
        now: Date.now(),
      });
      const from = String(args.fromDate ?? '');
      const to = String(args.toDate ?? '9999-12-31');
      return {
        tasks: [...q.overdue, ...q.dueToday, ...q.thisWeek]
          .filter((o) => (!from || o.date >= from || q.overdue.includes(o)) && o.date <= to)
          .map((o) => ({
            date: o.date,
            overdue: q.overdue.includes(o),
            kind: o.kind,
            title: o.title,
            plantId: o.specimenId,
            scheduleId: o.scheduleId,
          })),
      };
    }
    default:
      return { error: `Unknown tool ${name}` };
  }
}

/** Builds the card text from checked data (never from model prose). */
async function propose(
  scope: CopilotScope,
  tool: ProposalTool,
  payload: ProposalPayload,
): Promise<{ ok: true; proposal: Proposal } | { ok: false; error: string }> {
  const g = scope.garden;
  const versions: Record<string, number> = { [g.id]: g.version };
  const plant = async (id: string) => {
    const p = await db.specimens.get(id);
    return alive(p) && p.gardenId === g.id ? p : null;
  };
  let summary: string;
  if ('specimenId' in payload) {
    const p = await plant(payload.specimenId);
    if (!p) return { ok: false, error: 'No plant with that id in this garden' };
    versions[p.id] = p.version;
    if (tool === 'propose_care_event') {
      const e = payload as ProposalPayload<'propose_care_event'>;
      summary = `${e.kind}${e.amountMl ? ` ${e.amountMl} ml` : ''} · ${p.displayName}`;
    } else if (tool === 'propose_observation') {
      summary = `${(payload as ProposalPayload<'propose_observation'>).title} · ${p.displayName}`;
    } else if (tool === 'propose_task') {
      const t = payload as ProposalPayload<'propose_task'>;
      if (t.dueOn < todayIn(g.timezone)) return { ok: false, error: 'The date is in the past' };
      summary = `${t.title} · ${p.displayName} · ${t.dueOn}`;
    } else summary = `${(payload as ProposalPayload<'propose_health_case'>).title} · ${p.displayName}`;
  } else if (tool === 'propose_schedule_change') {
    const c = payload as ProposalPayload<'propose_schedule_change'>;
    const s = await db.careSchedules.get(c.scheduleId);
    if (!alive(s) || s.gardenId !== g.id)
      return { ok: false, error: 'No schedule with that id in this garden' };
    if (c.pausedUntil && c.pausedUntil < todayIn(g.timezone))
      return { ok: false, error: 'The date is in the past' };
    versions[s.id] = s.version;
    summary = `${s.title}: ${c.everyDays ? `every ${c.everyDays} days` : ''}${c.everyDays && c.pausedUntil ? ', ' : ''}${c.pausedUntil ? `paused until ${c.pausedUntil}` : ''}`;
  } else {
    const c = payload as ProposalPayload<'propose_plan_items'>;
    const z = await db.zones.get(c.zoneId);
    if (!alive(z) || z.gardenId !== g.id) return { ok: false, error: 'No space with that id in this garden' };
    const ctx = eligibilityFor(g, z);
    const names: string[] = [];
    for (const key of c.taxonKeys) {
      const t = taxonById(key);
      if (!t) return { ok: false, error: `Unknown taxon key ${key}` };
      if (evaluate(t, ctx).status === 'EXCLUDED')
        return { ok: false, error: `${t.scientificName} does not suit this space` };
      names.push(t.names.en);
    }
    versions[z.id] = z.version;
    summary = `${names.join(', ')} · ${z.name}`;
  }
  const now = Date.now();
  return {
    ok: true,
    proposal: {
      id: crypto.randomUUID(),
      tool,
      payload,
      summary,
      binding: await bindProposal(tool, payload, {
        actor: scope.actor,
        workspaceId: g.workspaceId,
        versions,
        now,
      }),
    },
  };
}

export function createExecutor(scope: CopilotScope, search: CopilotExecutor['search']): CopilotExecutor {
  return {
    read: (name, args) => read(scope, name, args),
    propose: (tool, payload) => propose(scope, tool, payload),
    search,
  };
}

/** Current versions of the records a proposal was bound to (undefined when gone). */
async function versionsNow(ids: string[]): Promise<Record<string, number | undefined>> {
  const out: Record<string, number | undefined> = {};
  for (const id of ids) {
    const r =
      (await db.gardens.get(id)) ??
      (await db.specimens.get(id)) ??
      (await db.zones.get(id)) ??
      (await db.careSchedules.get(id));
    out[id] = r && r.deletedAt === null ? r.version : undefined;
  }
  return out;
}

/**
 * Applies a confirmed proposal after re-checking its binding. A stale or expired proposal is never
 * applied: the caller asks the Copilot again.
 */
export async function applyProposal(
  p: Proposal,
): Promise<{ ok: true } | { ok: false; problem: BindingProblem | 'gone' }> {
  const scope = await copilotScope();
  if (!scope) return { ok: false, problem: 'gone' };
  const problem = await checkBinding(p, {
    actor: scope.actor,
    workspaceId: scope.garden.workspaceId,
    versions: await versionsNow(Object.keys(p.binding.versions)),
    now: Date.now(),
  });
  if (problem) return { ok: false, problem };
  const g = scope.garden;
  switch (p.tool) {
    case 'propose_care_event': {
      const e = p.payload as ProposalPayload<'propose_care_event'>;
      await logCare({
        gardenId: g.id,
        specimenIds: [e.specimenId],
        kind: e.kind,
        amountMl: e.kind === 'water' ? e.amountMl : null,
        waterSource: e.kind === 'water' ? 'tap' : null,
        notes: e.notes,
      });
      break;
    }
    case 'propose_observation': {
      const o = p.payload as ProposalPayload<'propose_observation'>;
      await addObservation({
        gardenId: g.id,
        specimenId: o.specimenId,
        kind: o.kind,
        milestone: null,
        title: o.title,
        notes: o.notes,
      });
      break;
    }
    case 'propose_task': {
      const t = p.payload as ProposalPayload<'propose_task'>;
      await createSchedule(g.id, {
        specimenId: t.specimenId,
        zoneId: null,
        kind: 'custom',
        title: t.title,
        rule: { freq: 'daily', interval: 1, startOn: t.dueOn, until: t.dueOn },
        origin: 'user',
      });
      break;
    }
    case 'propose_schedule_change': {
      const c = p.payload as ProposalPayload<'propose_schedule_change'>;
      const s = await db.careSchedules.get(c.scheduleId);
      if (!alive(s)) return { ok: false, problem: 'gone' };
      await updateSchedule(s.id, s.version, {
        ...(c.everyDays
          ? { rule: { ...s.rule, freq: 'daily' as const, interval: c.everyDays, byWeekday: undefined } }
          : {}),
        ...(c.pausedUntil ? { pausedUntil: c.pausedUntil } : {}),
      });
      break;
    }
    case 'propose_plan_items': {
      const c = p.payload as ProposalPayload<'propose_plan_items'>;
      const z = await db.zones.get(c.zoneId);
      if (!alive(z)) return { ok: false, problem: 'gone' };
      const ctx = eligibilityFor(g, z);
      const candidates = c.taxonKeys.map((k) => evaluate(taxonById(k)!, ctx));
      await savePlan(
        g.id,
        {
          name: `Copilot · ${z.name}`,
          catalogVersion: CATALOG_VERSION,
          engineVersion: ENGINE_VERSION,
          inputsHash: inputsHash({ ...ctx, month: 0 }),
        },
        planItemsOf(candidates, new Set(), z.id),
      );
      break;
    }
    case 'propose_health_case': {
      const h = p.payload as ProposalPayload<'propose_health_case'>;
      await openHealthCase({
        gardenId: g.id,
        specimenId: h.specimenId,
        title: h.title,
        entries: [{ kind: 'note', by: 'user', text: h.title }],
        followUpDays: [],
      });
      break;
    }
  }
  return { ok: true };
}
