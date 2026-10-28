// @vitest-environment node
// Data-layer tests run in Node so IndexedDB stores real Blobs (happy-dom Blobs are not cloneable).
import { beforeEach, describe, expect, it } from 'vitest';
import { planLegacyMigration } from '@plantpal/domain';
import { ensureWorkspace } from '../../src/data/commands';
import { db } from '../../src/data/db';
import { getMigrationState, runLegacyMigration } from '../../src/data/legacy/run';
import {
  deletePlaintextKey,
  hasLegacyData,
  readLegacyStorage,
  removeLegacyData,
} from '../../src/data/legacy/storage';
import { FAKE_KEY, legacyFixture } from '../../../../packages/domain/test/fixtures/legacy';
import { fakeProcess, resetDb } from './helpers';

const NOW = Date.UTC(2026, 9, 27);

function memoryStorage(entries: Record<string, string>): Storage {
  const map = new Map(Object.entries(entries));
  return {
    get length() {
      return map.size;
    },
    key: (i: number) => [...map.keys()][i] ?? null,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
  };
}

async function plan() {
  const ws = await ensureWorkspace(NOW);
  return {
    ws,
    plan: planLegacyMigration(readLegacyStorage(memoryStorage(legacyFixture)), {
      workspaceId: ws.id,
      timeZone: 'UTC',
      now: NOW,
    }),
  };
}

describe('legacy storage access', () => {
  it('never reads the plaintext key value into memory', () => {
    const raw = readLegacyStorage(memoryStorage(legacyFixture));
    expect(raw['plantpal-user-gemini-api-key']).toBe('[present]');
    expect(JSON.stringify(raw)).not.toContain(FAKE_KEY);
    expect(raw['pp-prefs']).toBeUndefined();
  });

  it('detects data, deletes the key on request and cleans up on confirmation', () => {
    const s = memoryStorage({ ...legacyFixture, 'pp-prefs': '{}' });
    expect(hasLegacyData(s)).toBe(true);
    deletePlaintextKey(s);
    expect(s.getItem('plantpal-user-gemini-api-key')).toBeNull();
    expect(removeLegacyData(s)).toBe(Object.keys(legacyFixture).length - 1);
    expect(s.getItem('pp-prefs')).toBe('{}');
    expect(hasLegacyData(s)).toBe(false);
    expect(hasLegacyData(memoryStorage({ 'plantpal-theme': 'dark' }))).toBe(false);
  });
});

describe('legacy migration runner (W11)', () => {
  beforeEach(resetDb);

  it('migrates everything, recovers inline photos and verifies counts', async () => {
    const { ws, plan: p } = await plan();
    const state = await runLegacyMigration(p, { workspaceId: ws.id, process: fakeProcess, now: () => NOW });
    expect(state.status).toBe('done');
    expect(state.verification?.ok).toBe(true);
    expect(state.verification?.photos).toEqual({ expected: 1, recovered: 1, failed: 0 });
    expect(await db.specimens.count()).toBe(p.records.specimens.length);
    expect(await db.careEvents.count()).toBe(p.records.careEvents.length);
    expect((await db.specimens.toArray()).every((s) => s.workspaceId === ws.id)).toBe(true);
    expect((await db.meta.get('legacyAchievements'))?.value).toMatchObject({ xp: 640 });
    const recovered = await db.media.get(p.mediaToDecode[0]?.mediaId ?? '');
    expect(recovered).toMatchObject({ metadataStripped: true, mime: 'image/webp', flag: null });
  });

  it('resumes after an interruption without duplicates', async () => {
    const { ws, plan: p } = await plan();
    await expect(
      runLegacyMigration(p, { workspaceId: ws.id, process: fakeProcess, interruptAfter: 'specimens' }),
    ).rejects.toThrow(/Interrupted/);
    const mid = await getMigrationState();
    expect(mid?.status).toBe('failed');
    expect(mid?.completed).toEqual(['gardens', 'zones', 'specimens']);
    expect(await db.careEvents.count()).toBe(0);

    const done = await runLegacyMigration(p, { workspaceId: ws.id, process: fakeProcess });
    expect(done.status).toBe('done');
    expect(await db.specimens.count()).toBe(p.records.specimens.length);
    expect(await db.observations.count()).toBe(p.records.observations.length);
  });

  it('is safe to run again and never overwrites later edits', async () => {
    const { ws, plan: p } = await plan();
    await runLegacyMigration(p, { workspaceId: ws.id, process: fakeProcess });
    const tomato = (await db.specimens.toArray()).find((s) => s.displayName === 'Tomato');
    await db.specimens.put({ ...tomato!, displayName: 'Roma tomato', version: 2 });
    const again = await runLegacyMigration(p, { workspaceId: ws.id, process: fakeProcess });
    expect(again.status).toBe('done');
    expect(await db.specimens.count()).toBe(p.records.specimens.length);
    expect((await db.specimens.get(tomato!.id))?.displayName).toBe('Roma tomato');
  });

  it('flags photos that cannot be decoded instead of failing', async () => {
    const { ws, plan: p } = await plan();
    const state = await runLegacyMigration(p, {
      workspaceId: ws.id,
      process: () => Promise.reject(new Error('decode')),
    });
    expect(state.status).toBe('done');
    expect(state.verification?.photos).toEqual({ expected: 1, recovered: 0, failed: 1 });
    expect((await db.media.get(p.mediaToDecode[0]?.mediaId ?? ''))?.flag).toBe('broken');
  });
});
