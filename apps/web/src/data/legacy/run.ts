import type { Table } from 'dexie';
import type { LegacyMigrationPlan, LegacyRecords } from '@plantpal/domain';
import { db, getMeta, setMeta } from '../db';
import { dataUrlToBlob, processImage, type ProcessedImage } from '../media';
import { withQuotaRecovery } from '../storage';

export const MIGRATION_META = 'legacyMigration';

/** Steps run in this order; each one commits atomically together with its progress marker. */
export const MIGRATION_STEPS = [
  'gardens',
  'zones',
  'specimens',
  'media',
  'careEvents',
  'observations',
  'harvests',
  'soilTests',
  'healthCases',
  'drafts',
  'photos',
  'achievements',
] as const;
export type MigrationStep = (typeof MIGRATION_STEPS)[number];

export interface MigrationState {
  status: 'running' | 'done' | 'failed';
  startedAt: number;
  finishedAt: number | null;
  completed: MigrationStep[];
  backupAt: number | null;
  error: string | null;
  verification: Verification | null;
}

export interface Verification {
  ok: boolean;
  tables: Record<keyof LegacyRecords, { expected: number; found: number }>;
  photos: { expected: number; recovered: number; failed: number };
}

export interface RunOptions {
  workspaceId: string;
  onProgress?: (step: MigrationStep, index: number, total: number) => void;
  /** Image pipeline; injectable for tests that run without a canvas. */
  process?: (blob: Blob) => Promise<ProcessedImage>;
  /** Test hook: throw after this step commits, to simulate a crash or closed tab. */
  interruptAfter?: MigrationStep;
  now?: () => number;
}

const tableFor = (k: keyof LegacyRecords) =>
  db[k] as unknown as Table<{ id: string; workspaceId: string }, string>;

export async function getMigrationState(): Promise<MigrationState | undefined> {
  return getMeta<MigrationState>(MIGRATION_META);
}

export async function markBackupTaken(at = Date.now()): Promise<void> {
  const s = await getMigrationState();
  await setMeta(MIGRATION_META, {
    status: s?.status ?? 'running',
    startedAt: s?.startedAt ?? at,
    finishedAt: s?.finishedAt ?? null,
    completed: s?.completed ?? [],
    backupAt: at,
    error: null,
    verification: s?.verification ?? null,
  } satisfies MigrationState);
}

/**
 * Applies a plan in idempotent steps. Records are only added when missing (ids are deterministic),
 * so re-running, or resuming after an interruption, never duplicates or overwrites edits.
 */
export async function runLegacyMigration(
  plan: LegacyMigrationPlan,
  opts: RunOptions,
): Promise<MigrationState> {
  const now = opts.now ?? Date.now;
  const process = opts.process ?? processImage;
  const prev = await getMigrationState();
  let state: MigrationState = {
    status: 'running',
    startedAt: prev?.startedAt ?? now(),
    finishedAt: null,
    completed: prev?.status === 'done' ? [] : (prev?.completed ?? []),
    backupAt: prev?.backupAt ?? null,
    error: null,
    verification: null,
  };
  await setMeta(MIGRATION_META, state);

  // Records are re-homed into this device's workspace.
  const rehome = <T extends { workspaceId: string }>(rows: T[]) =>
    rows.map((r) => ({ ...r, workspaceId: opts.workspaceId }));

  const total = MIGRATION_STEPS.length;
  try {
    for (const [i, step] of MIGRATION_STEPS.entries()) {
      opts.onProgress?.(step, i, total);
      if (state.completed.includes(step)) continue;

      if (step === 'photos') {
        await recoverPhotos(plan, process);
      } else if (step === 'achievements') {
        await withQuotaRecovery(() =>
          db.transaction('rw', db.meta, async () => {
            if (plan.achievements && !(await getMeta('legacyAchievements')))
              await setMeta('legacyAchievements', plan.achievements);
          }),
        );
      } else {
        const rows = rehome(plan.records[step] as Array<{ id: string; workspaceId: string }>);
        const table = tableFor(step);
        await withQuotaRecovery(() =>
          db.transaction('rw', table, db.meta, async () => {
            for (let k = 0; k < rows.length; k += 200) {
              const chunk = rows.slice(k, k + 200);
              const existing = await table.bulkGet(chunk.map((r) => r.id));
              const missing = chunk.filter((_, j) => !existing[j]);
              if (missing.length > 0) await table.bulkAdd(missing);
            }
            state = { ...state, completed: [...state.completed, step] };
            await setMeta(MIGRATION_META, state);
          }),
        );
        if (opts.interruptAfter === step) throw new Error(`Interrupted after ${step}`);
        continue;
      }
      state = { ...state, completed: [...state.completed, step] };
      await setMeta(MIGRATION_META, state);
      if (opts.interruptAfter === step) throw new Error(`Interrupted after ${step}`);
    }
    const verification = await verifyMigration(plan);
    state = {
      ...state,
      status: verification.ok ? 'done' : 'failed',
      finishedAt: now(),
      verification,
      error: verification.ok ? null : 'verification',
    };
    await setMeta(MIGRATION_META, state);
    return state;
  } catch (e) {
    state = { ...state, status: 'failed', error: e instanceof Error ? e.message : String(e) };
    await setMeta(MIGRATION_META, state);
    throw e;
  }
}

/** Decodes inline photos from the earlier app, re-encodes them (dropping EXIF/GPS) and stores them. Failures are flagged, not fatal. */
async function recoverPhotos(
  plan: LegacyMigrationPlan,
  process: (b: Blob) => Promise<ProcessedImage>,
): Promise<void> {
  for (const { mediaId, dataUrl } of plan.mediaToDecode) {
    if (await db.mediaBlobs.get(mediaId)) continue;
    const media = await db.media.get(mediaId);
    if (!media) continue;
    try {
      const img = await process(dataUrlToBlob(dataUrl));
      await withQuotaRecovery(() =>
        db.transaction('rw', db.media, db.mediaBlobs, async () => {
          await db.mediaBlobs.put({ id: mediaId, full: img.full, thumb: img.thumb });
          await db.media.put({
            ...media,
            mime: img.full.type,
            width: img.width,
            height: img.height,
            bytes: img.full.size,
            sha256: img.sha256,
            metadataStripped: true,
            flag: null,
          });
        }),
      );
    } catch {
      await db.media.put({ ...media, kind: 'external', externalUrl: null, flag: 'broken' });
    }
  }
}

/** Checks that every planned record exists in the store. */
export async function verifyMigration(plan: LegacyMigrationPlan): Promise<Verification> {
  const tables = {} as Verification['tables'];
  let ok = true;
  for (const key of Object.keys(plan.records) as Array<keyof LegacyRecords>) {
    const ids = plan.records[key].map((r) => r.id);
    const found = (await tableFor(key).bulkGet(ids)).filter(Boolean).length;
    tables[key] = { expected: ids.length, found };
    if (found !== ids.length) ok = false;
  }
  const blobs = await db.mediaBlobs.bulkGet(plan.mediaToDecode.map((m) => m.mediaId));
  const recovered = blobs.filter(Boolean).length;
  return {
    ok,
    tables,
    photos: { expected: plan.mediaToDecode.length, recovered, failed: plan.mediaToDecode.length - recovered },
  };
}
