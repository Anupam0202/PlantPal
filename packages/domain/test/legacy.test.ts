import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { Specimen } from '@plantpal/schemas';
import { buildLegacyBackup, LEGACY_KEYS, parseLegacyBackup, planLegacyMigration } from '../src/legacy/plan';
import { FAKE_KEY, legacyFixture, TINY_PNG } from './fixtures/legacy';

const WS = '01JB0000000000000000000000';
const ctx = { workspaceId: WS, timeZone: 'Europe/London', now: Date.UTC(2026, 9, 27) };

describe('legacy migration plan (W11)', () => {
  const plan = planLegacyMigration(legacyFixture, ctx);
  const { records } = plan;
  const codes = (code: string) => plan.problems.filter((p) => p.code === code);

  it('detects earlier PlantPal data and reports counts per type', () => {
    expect(plan.detected).toBe(true);
    expect(plan.counts.plants).toEqual({ found: 6, migrated: 4, skipped: 2 });
    expect(plan.counts.journal).toEqual({ found: 11, migrated: 10, skipped: 1 });
    expect(plan.counts.harvests).toEqual({ found: 6, migrated: 6, skipped: 0 });
    expect(plan.counts.gardens.migrated).toBe(2);
    expect(plan.counts.zones.migrated).toBe(2);
    expect(plan.counts.soil.migrated).toBe(3);
    expect(plan.counts.scans.migrated).toBe(2);
    expect(plan.counts.pins.migrated).toBe(1);
    expect(plan.counts.listings.migrated).toBe(1);
    expect(plan.counts.achievements.migrated).toBe(1);
  });

  it('accounts for every skipped record with a problem entry', () => {
    expect(
      codes('duplicate')
        .map((p) => p.legacyId)
        .sort(),
    ).toEqual(['j1', 'p1']);
    expect(codes('invalid-item').length).toBe(1);
    for (const [cat, c] of Object.entries(plan.counts)) {
      if (c.skipped === 0) continue;
      const key = Object.values(LEGACY_KEYS).find((k) =>
        k.includes(cat === 'plants' ? 'garden-plants' : cat),
      );
      expect(
        plan.problems.some((p) => p.key === key),
        `${cat} skips are explained`,
      ).toBe(true);
    }
  });

  it('never reads, migrates or backs up the plaintext API key', () => {
    expect(plan.hasPlaintextKey).toBe(true);
    expect(codes('plaintext-key')).toHaveLength(1);
    expect(JSON.stringify(plan)).not.toContain(FAKE_KEY);
    const backup = buildLegacyBackup(legacyFixture, '2026-10-27T00:00:00.000Z');
    expect(JSON.stringify(backup)).not.toContain(FAKE_KEY);
    expect(Object.keys(backup.keys)).not.toContain(LEGACY_KEYS.apiKey);
    expect(Object.keys(backup.keys)).toContain('plantpal-experimental-flag');
  });

  it('round-trips the backup file back into a plan with the same ids', () => {
    const backup = buildLegacyBackup(legacyFixture, '2026-10-27T00:00:00.000Z');
    const restored = parseLegacyBackup(JSON.stringify(backup));
    expect(restored).not.toBeNull();
    const again = planLegacyMigration(restored ?? {}, ctx);
    expect(again.records.specimens.map((s) => s.id)).toEqual(records.specimens.map((s) => s.id));
    expect(again.hasPlaintextKey).toBe(false);
    expect(parseLegacyBackup('{"format":"other"}')).toBeNull();
    expect(parseLegacyBackup('not json')).toBeNull();
  });

  it('is deterministic, so re-running or resuming never duplicates', () => {
    const again = planLegacyMigration(legacyFixture, { ...ctx, now: ctx.now + 86_400_000 });
    const ids = (p: typeof plan) =>
      Object.values(p.records)
        .flat()
        .map((r) => r.id)
        .sort();
    expect(ids(again)).toEqual(ids(plan));
    expect(new Set(ids(plan)).size).toBe(ids(plan).length);
  });

  it('uses the saved place and time zone for gardens and garden-local dates', () => {
    const def = records.gardens.find((g) => g.name === 'My garden');
    expect(def?.timezone).toBe('Asia/Kolkata');
    expect(def?.hemisphere).toBe('north');
    expect(def?.place).toEqual({ label: 'Pune, India', lat: 18.5204, lon: 73.8567 });
    const balcony = records.gardens.find((g) => g.name === 'Balcony');
    expect(balcony?.place).toEqual({ label: 'Pune', lat: 18.52, lon: 73.86 });
    expect(records.zones.find((z) => z.gardenId === balcony?.id)?.kind).toBe('balcony');
  });

  it('maps plants, keeping removed plants archived with history and extra fields preserved', () => {
    const tomato = records.specimens.find((s) => s.displayName === 'Tomato');
    expect(tomato?.identityLevel).toBe('species');
    expect(tomato?.plantedOn).toBe('2025-03-01');
    expect(tomato?.notes).toBe('Location: South railing');
    expect(tomato?.source?.extra).toEqual({ description: 'A sunny fruiting plant' });
    const mint = records.specimens.find((s) => s.displayName === 'Mint');
    expect(mint?.status).toBe('archived');
    expect(mint?.identityLevel).toBe('genus');
    expect(records.specimens.find((s) => s.displayName === 'Basil')?.status).toBe('dormant');
    expect(records.specimens.some((s) => s.displayName === 'Unnamed plant')).toBe(true);
    expect(codes('multi-garden')[0]?.legacyId).toBe('p2');
    for (const s of records.specimens) expect(Specimen.safeParse(s).success).toBe(true);
  });

  it('keeps orphan journal entries under an "Unlinked notes" holding record', () => {
    const holding = records.specimens.find((s) => s.holding);
    expect(holding?.displayName).toBe('Unlinked notes');
    const orphan = records.observations.find((o) => o.source?.legacyId === 'j8');
    expect(orphan?.specimenId).toBe(holding?.id);
    expect(orphan?.notes).toBe('from a deleted plant');
  });

  it('turns watering into care events in whole millilitres, never inventing zero', () => {
    const j1 = records.careEvents.find((e) => e.source?.legacyId === 'j1');
    expect(j1).toMatchObject({
      kind: 'water',
      amountMl: 1500,
      occurredOn: '2025-03-02',
      dateUncertain: false,
    });
    const j2 = records.careEvents.find((e) => e.source?.legacyId === 'j2');
    expect(j2?.amountMl).toBeNull();
    expect(j2?.source?.extra).toEqual({ waterAmountLiters: '2L' });
    const j9 = records.careEvents.find((e) => e.source?.legacyId === 'j9');
    expect(j9).toMatchObject({ kind: 'feed', dateUncertain: true });
  });

  it('maps milestones, measurements and unknown types, dropping only invalid values', () => {
    expect(records.observations.find((o) => o.source?.legacyId === 'j3')).toMatchObject({
      kind: 'milestone',
      milestone: 'planted',
    });
    expect(records.observations.find((o) => o.source?.legacyId === 'j5')?.values).toEqual({
      heightCm: 22.5,
      leafCount: 14,
    });
    expect(records.observations.find((o) => o.source?.legacyId === 'j6')?.weather).toEqual({
      temperatureC: 31,
      humidityPct: 40,
      description: 'Sunny',
      evidence: 'UNKNOWN',
    });
    expect(records.observations.find((o) => o.source?.legacyId === 'j7')?.kind).toBe('pest');
    expect(records.observations.find((o) => o.source?.legacyId === 'j10')?.kind).toBe('note');
    expect(codes('unknown-type')).toHaveLength(1);
  });

  it('recovers inline photos, keeps web links flagged, and flags unusable ones', () => {
    expect(plan.mediaToDecode).toHaveLength(1);
    expect(plan.mediaToDecode[0]?.dataUrl).toBe(TINY_PNG);
    const byFlag = (f: string | null) => records.media.filter((m) => m.flag === f);
    expect(byFlag(null)).toHaveLength(1);
    expect(byFlag('external-unverified')[0]?.externalUrl).toBe('https://example.org/basil.jpg');
    expect(byFlag('broken')).toHaveLength(1);
    const j4 = records.observations.find((o) => o.source?.legacyId === 'j4');
    expect(j4?.mediaIds).toEqual([plan.mediaToDecode[0]?.mediaId]);
  });

  it('never converts counts or volumes into mass (S1)', () => {
    const h = (id: string) => records.harvests.find((r) => r.source?.legacyId === id);
    expect(h('h1')).toMatchObject({ massG: 1200, count: null });
    expect(h('h2')).toMatchObject({ massG: 300, specimenId: h('h1')?.specimenId });
    expect(h('h3')).toMatchObject({ massG: null, count: 6, countLabel: 'pieces' });
    expect(h('h4')).toMatchObject({ massG: null, count: null, original: { quantity: 2.5, unit: 'bunches' } });
    expect(h('h5')).toMatchObject({ massG: null, count: null, specimenId: null, plantName: 'Mulberry' });
    expect(h('h6')).toMatchObject({ massG: null, count: null });
  });

  it('labels photo soil estimates as AI drafts and never treats them as measurements (S6)', () => {
    const s = (id: string) => records.soilTests.find((r) => r.source?.legacyId === id);
    expect(s('s1')).toMatchObject({
      method: 'photo-estimate',
      ph: 6.4,
      phEvidence: 'AI_DRAFT',
      texture: null,
      observations: {},
    });
    expect(s('s1')?.aiText).toBe('Looks like loam.');
    expect(s('s2')).toMatchObject({ method: 'home-kit-ph', ph: 7.1, phEvidence: 'MEASURED' });
    expect(s('s3')).toMatchObject({
      method: 'lab',
      ph: null,
      texture: { sandPct: 30, siltPct: 50, clayPct: 20 },
    });
    expect(s('s3')?.observations).toEqual({ nitrogen: 'low', phosphorus: 'medium', potassium: 'high' });
  });

  it('keeps health checks as closed AI-draft cases and community items as private drafts', () => {
    expect(records.healthCases).toHaveLength(2);
    expect(records.healthCases[0]?.entries[0]?.evidence).toBe('AI_DRAFT');
    expect(records.healthCases.find((c) => c.title.startsWith('Basil'))?.specimenId).toBe(
      records.specimens.find((s) => s.displayName === 'Basil')?.id,
    );
    expect(records.drafts.map((d) => d.kind).sort()).toEqual(['community-pin', 'exchange-listing']);
  });

  it('snapshots earlier achievements read-only and keeps the theme', () => {
    expect(plan.achievements).toEqual({
      xp: 640,
      level: 3,
      streakDays: 4,
      joinedOn: '2025-02-20',
      badges: [{ badgeId: 'first-seed', tier: 'bronze', earnedOn: '2025-03-01' }],
    });
    expect(plan.theme).toBe('dark');
    expect(codes('unknown-key')[0]?.key).toBe('plantpal-experimental-flag');
  });

  it('reports damaged data without throwing', () => {
    const p = planLegacyMigration(
      {
        'plantpal-garden-plants': '{not json',
        'plantpal-garden-journal': '{"a":1}',
        'plantpal-harvests': 'null',
      },
      ctx,
    );
    expect(p.problems.map((x) => x.code).sort()).toEqual(['not-a-list', 'unreadable']);
    expect(p.detected).toBe(false);
  });

  it('detects nothing when there is no earlier PlantPal data', () => {
    const p = planLegacyMigration({ 'pp-prefs': '{}' }, ctx);
    expect(p.detected).toBe(false);
    expect(Object.values(p.records).flat()).toHaveLength(0);
  });

  it('never throws on arbitrary stored values and never migrates more than it found', () => {
    const keys = Object.values(LEGACY_KEYS);
    fc.assert(
      fc.property(
        fc.dictionary(
          fc.constantFrom(...keys),
          fc.oneof(
            fc.string(),
            fc.json(),
            fc.jsonValue().map((v) => JSON.stringify([v, v])),
          ),
        ),
        (raw) => {
          const p = planLegacyMigration(raw, ctx);
          for (const c of Object.values(p.counts)) expect(c.migrated).toBeLessThanOrEqual(c.found);
          expect(JSON.stringify(p.records)).toBeDefined();
        },
      ),
      { numRuns: 300 },
    );
  });
});
