import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';
import type { Table } from 'dexie';
import type { z } from 'zod';
import {
  ARCHIVE_FORMAT,
  ARCHIVE_FORMAT_VERSION,
  ArchiveManifest,
  CareEvent,
  CareSchedule,
  Container,
  Draft,
  Garden,
  Harvest,
  HealthCase,
  LegacyAchievements,
  Media,
  Observation,
  Plan,
  PlanItem,
  SoilTest,
  Specimen,
  TaskLog,
  Zone,
  type ArchiveFile,
  SpeciesDraftRecord,
  Layout,
  LayoutVersion,
} from '@plantpal/schemas';
import { localDateOf, toCsv, type CsvColumn } from '@plantpal/domain';
import { CLIENT_SCHEMA, db, getMeta, setMeta } from './db';
import { sha256Hex } from './media';
import { withQuotaRecovery } from './storage';
import { ensureWorkspace } from './commands';

/** Exported record tables and their schemas. Workspaces, the outbox and secrets are never exported. */
const TABLES = {
  gardens: Garden,
  zones: Zone,
  containers: Container,
  specimens: Specimen,
  careEvents: CareEvent,
  observations: Observation,
  harvests: Harvest,
  media: Media,
  soilTests: SoilTest,
  healthCases: HealthCase,
  drafts: Draft,
  plans: Plan,
  planItems: PlanItem,
  careSchedules: CareSchedule,
  taskLogs: TaskLog,
  speciesDrafts: SpeciesDraftRecord,
  layouts: Layout,
  layoutVersions: LayoutVersion,
} as const;
export type ArchiveTable = keyof typeof TABLES;
const TABLE_NAMES = Object.keys(TABLES) as ArchiveTable[];

const MAX_ARCHIVE_BYTES = 1024 * 1024 * 1024; // 1 GiB uncompressed
const MAX_FILES = 50_000;

const tableOf = (t: ArchiveTable) => db[t] as unknown as Table<{ id: string; workspaceId: string }, string>;

const mediaExt = (mime: string | null) =>
  mime === 'image/jpeg' ? 'jpg' : mime === 'image/png' ? 'png' : 'webp';

function stamp(now: number): string {
  return localDateOf(now, 'UTC');
}

export const APP_VERSION = '3.0.0-alpha.0';

// ---------------------------------------------------------------- export

export async function buildArchive(
  now = Date.now(),
): Promise<{ blob: Blob; filename: string; manifest: ArchiveManifest }> {
  const ws = await ensureWorkspace(now);
  const files: Zippable = {};
  const entries: ArchiveFile[] = [];
  const counts: Record<string, number> = {};

  const add = async (path: string, bytes: Uint8Array, compress: boolean) => {
    files[path] = [bytes, { level: compress ? 6 : 0 }];
    entries.push({ path, sha256: await sha256Hex(bytes), bytes: bytes.byteLength });
  };

  for (const t of TABLE_NAMES) {
    const rows = (await tableOf(t).where('workspaceId').equals(ws.id).toArray()) as unknown[];
    counts[t] = rows.length;
    await add(`data/${t}.json`, strToU8(JSON.stringify(rows)), true);
  }
  const achievements = await getMeta('legacyAchievements');
  if (achievements) {
    counts.legacyAchievements = 1;
    await add('data/legacyAchievements.json', strToU8(JSON.stringify(achievements)), true);
  }

  const media = (await db.media.where('workspaceId').equals(ws.id).toArray()).filter(
    (m) => m.kind === 'stored' && m.deletedAt === null,
  );
  let mediaFiles = 0;
  for (const m of media) {
    const blob = await db.mediaBlobs.get(m.id);
    if (!blob) continue;
    await add(
      `media/${m.id}.${mediaExt(blob.full.type)}`,
      new Uint8Array(await blob.full.arrayBuffer()),
      false,
    );
    await add(
      `media/${m.id}.thumb.${mediaExt(blob.thumb.type)}`,
      new Uint8Array(await blob.thumb.arrayBuffer()),
      false,
    );
    mediaFiles++;
  }
  counts.mediaFiles = mediaFiles;

  const manifest: ArchiveManifest = {
    format: ARCHIVE_FORMAT,
    formatVersion: ARCHIVE_FORMAT_VERSION,
    exportedAt: new Date(now).toISOString(),
    app: { name: 'PlantPal', version: APP_VERSION },
    clientSchema: CLIENT_SCHEMA,
    counts,
    files: entries,
  };
  files['manifest.json'] = [strToU8(JSON.stringify(manifest, null, 2)), { level: 6 }];
  const zipped = zipSync(files);
  return {
    blob: new Blob([zipped.slice().buffer], { type: 'application/zip' }),
    filename: `plantpal-backup-${stamp(now)}.zip`,
    manifest,
  };
}

/** Spreadsheet-friendly CSV files (formula-safe) for plants, care, notes and harvests, zipped together. */
export async function buildCsvExport(now = Date.now()): Promise<{ blob: Blob; filename: string }> {
  const ws = await ensureWorkspace(now);
  const live = <T extends { deletedAt: number | null }>(rows: T[]) =>
    rows.filter((r) => r.deletedAt === null);
  const gardens = live(await db.gardens.where('workspaceId').equals(ws.id).toArray());
  const gardenName = new Map(gardens.map((g) => [g.id, g.name]));
  const specimens = (await db.specimens.where('workspaceId').equals(ws.id).toArray()).filter(
    (s) => s.deletedAt === null,
  );
  const plantName = new Map(specimens.map((s) => [s.id, s.displayName]));
  const gardenIds = new Set(gardens.map((g) => g.id));
  const inGardens = <T extends { gardenId: string; deletedAt: number | null }>(rows: T[]) =>
    rows.filter((r) => r.deletedAt === null && gardenIds.has(r.gardenId));

  const care = inGardens(await db.careEvents.toArray());
  const obs = inGardens(await db.observations.toArray());
  const harvests = inGardens(await db.harvests.toArray());

  const plantCols: CsvColumn<Specimen>[] = [
    { header: 'id', value: (r) => r.id },
    { header: 'garden', value: (r) => gardenName.get(r.gardenId) },
    { header: 'name', value: (r) => r.displayName },
    { header: 'scientific_name', value: (r) => r.scientificName },
    { header: 'identity_level', value: (r) => r.identityLevel },
    { header: 'status', value: (r) => r.status },
    { header: 'origin', value: (r) => r.origin },
    { header: 'planted_on', value: (r) => r.plantedOn },
    { header: 'notes', value: (r) => r.notes },
  ];
  const careCols: CsvColumn<CareEvent>[] = [
    { header: 'date', value: (r) => (r.dateUncertain ? '' : r.occurredOn) },
    { header: 'garden', value: (r) => gardenName.get(r.gardenId) },
    { header: 'plant', value: (r) => (r.specimenId ? plantName.get(r.specimenId) : '') },
    { header: 'kind', value: (r) => r.kind },
    { header: 'water_ml', value: (r) => r.amountMl },
    { header: 'water_source', value: (r) => r.waterSource },
    { header: 'notes', value: (r) => r.notes },
  ];
  const obsCols: CsvColumn<Observation>[] = [
    { header: 'date', value: (r) => (r.dateUncertain ? '' : r.occurredOn) },
    { header: 'garden', value: (r) => gardenName.get(r.gardenId) },
    { header: 'plant', value: (r) => (r.specimenId ? plantName.get(r.specimenId) : '') },
    { header: 'kind', value: (r) => r.kind },
    { header: 'milestone', value: (r) => r.milestone },
    { header: 'title', value: (r) => r.title },
    { header: 'height_cm', value: (r) => r.values.heightCm },
    { header: 'spread_cm', value: (r) => r.values.spreadCm },
    { header: 'leaf_count', value: (r) => r.values.leafCount },
    { header: 'flower_count', value: (r) => r.values.flowerCount },
    { header: 'fruit_count', value: (r) => r.values.fruitCount },
    { header: 'notes', value: (r) => r.notes },
  ];
  const harvestCols: CsvColumn<Harvest>[] = [
    { header: 'date', value: (r) => (r.dateUncertain ? '' : r.harvestedOn) },
    { header: 'garden', value: (r) => gardenName.get(r.gardenId) },
    { header: 'plant', value: (r) => (r.specimenId ? plantName.get(r.specimenId) : r.plantName) },
    { header: 'mass_g', value: (r) => r.massG },
    { header: 'count', value: (r) => r.count },
    { header: 'count_label', value: (r) => r.countLabel },
    {
      header: 'as_recorded',
      value: (r) => (r.original ? `${r.original.quantity ?? ''} ${r.original.unit}`.trim() : ''),
    },
    { header: 'notes', value: (r) => r.notes },
  ];

  const zipped = zipSync({
    'plants.csv': strToU8(
      toCsv(
        specimens.filter((s) => !s.holding),
        plantCols,
      ),
    ),
    'care-log.csv': strToU8(toCsv(care, careCols)),
    'notes-and-observations.csv': strToU8(toCsv(obs, obsCols)),
    'harvests.csv': strToU8(toCsv(harvests, harvestCols)),
  });
  return {
    blob: new Blob([zipped.slice().buffer], { type: 'application/zip' }),
    filename: `plantpal-spreadsheets-${stamp(now)}.zip`,
  };
}

// ---------------------------------------------------------------- import

export type ImportErrorCode =
  'not-a-zip' | 'no-manifest' | 'bad-manifest' | 'newer-version' | 'checksum' | 'too-large';

export class ImportError extends Error {
  constructor(
    readonly code: ImportErrorCode,
    detail?: string,
  ) {
    super(detail ?? code);
    this.name = 'ImportError';
  }
}

export interface ImportPreview {
  manifest: ArchiveManifest;
  tables: Record<
    ArchiveTable,
    { incoming: number; new: number; same: number; conflicts: number; invalid: number }
  >;
  unknownFiles: string[];
  invalid: Array<{ table: string; index: number; detail: string }>;
  records: Record<ArchiveTable, Array<{ id: string; workspaceId: string }>>;
  conflictIds: Record<ArchiveTable, string[]>;
  mediaFiles: Map<string, { full?: Uint8Array; thumb?: Uint8Array }>;
  achievements: LegacyAchievements | null;
}

const MIME_BY_EXT: Record<string, string> = { webp: 'image/webp', jpg: 'image/jpeg', png: 'image/png' };

/** Reads and verifies an archive (manifest, checksums, schemas) and compares it with what is on this device. */
export async function readArchive(file: Blob): Promise<ImportPreview> {
  let entries: Record<string, Uint8Array>;
  const bytes = new Uint8Array(await file.arrayBuffer());
  try {
    let total = 0;
    let n = 0;
    entries = unzipSync(bytes, {
      filter: (f) => {
        n++;
        total += f.originalSize;
        if (n > MAX_FILES + 1 || total > MAX_ARCHIVE_BYTES) throw new ImportError('too-large');
        return true;
      },
    });
  } catch (e) {
    if (e instanceof ImportError) throw e;
    throw new ImportError('not-a-zip');
  }
  const manifestBytes = entries['manifest.json'];
  if (!manifestBytes) throw new ImportError('no-manifest');
  let manifestJson: unknown;
  try {
    manifestJson = JSON.parse(strFromU8(manifestBytes));
  } catch {
    throw new ImportError('bad-manifest');
  }
  const parsed = ArchiveManifest.safeParse(manifestJson);
  if (!parsed.success) throw new ImportError('bad-manifest', parsed.error.issues[0]?.message);
  const manifest = parsed.data;
  if (manifest.formatVersion > ARCHIVE_FORMAT_VERSION) throw new ImportError('newer-version');

  const listed = new Set(manifest.files.map((f) => f.path));
  for (const f of manifest.files) {
    const data = entries[f.path];
    if (!data || data.byteLength !== f.bytes || (await sha256Hex(data)) !== f.sha256)
      throw new ImportError('checksum', f.path);
  }
  const unknownFiles = Object.keys(entries).filter(
    (p) => p !== 'manifest.json' && (!listed.has(p) || !isKnownPath(p)),
  );

  const ws = await ensureWorkspace();
  const invalid: ImportPreview['invalid'] = [];
  const records = {} as ImportPreview['records'];
  const tables = {} as ImportPreview['tables'];
  const conflictIds = {} as ImportPreview['conflictIds'];

  for (const t of TABLE_NAMES) {
    const data = entries[`data/${t}.json`];
    const rows: Array<{ id: string; workspaceId: string }> = [];
    let bad = 0;
    if (data && listed.has(`data/${t}.json`)) {
      let arr: unknown;
      try {
        arr = JSON.parse(strFromU8(data));
      } catch {
        arr = null;
      }
      if (Array.isArray(arr)) {
        arr.forEach((row, index) => {
          const r = (TABLES[t] as z.ZodType).safeParse(row);
          if (r.success)
            rows.push({ ...(r.data as { id: string; workspaceId: string }), workspaceId: ws.id });
          else {
            bad++;
            const issue = r.error.issues[0];
            invalid.push({
              table: t,
              index,
              detail: issue ? `${issue.path.join('.')}: ${issue.message}` : 'invalid',
            });
          }
        });
      } else {
        invalid.push({ table: t, index: -1, detail: 'not a list' });
      }
    }
    const existing = await tableOf(t).bulkGet(rows.map((r) => r.id));
    let same = 0;
    const conflicts: string[] = [];
    rows.forEach((r, i) => {
      const ex = existing[i];
      if (!ex) return;
      if (JSON.stringify(ex) === JSON.stringify(r)) same++;
      else conflicts.push(r.id);
    });
    records[t] = rows;
    conflictIds[t] = conflicts;
    tables[t] = {
      incoming: rows.length,
      new: rows.length - same - conflicts.length,
      same,
      conflicts: conflicts.length,
      invalid: bad,
    };
  }

  const mediaFiles: ImportPreview['mediaFiles'] = new Map();
  for (const path of Object.keys(entries)) {
    const m = /^media\/([0-9A-HJKMNP-TV-Z]{26})(\.thumb)?\.(webp|jpg|png)$/.exec(path);
    if (!m || !listed.has(path)) continue;
    const id = m[1] ?? '';
    const cur = mediaFiles.get(id) ?? {};
    const data = entries[path];
    if (m[2]) cur.thumb = data;
    else cur.full = data;
    mediaFiles.set(id, cur);
  }

  let achievements: LegacyAchievements | null = null;
  const ach = entries['data/legacyAchievements.json'];
  if (ach && listed.has('data/legacyAchievements.json')) {
    try {
      const r = LegacyAchievements.safeParse(JSON.parse(strFromU8(ach)));
      achievements = r.success ? r.data : null;
    } catch {
      achievements = null;
    }
  }

  return { manifest, tables, unknownFiles, invalid, records, conflictIds, mediaFiles, achievements };
}

function isKnownPath(p: string): boolean {
  if (/^media\/[0-9A-HJKMNP-TV-Z]{26}(\.thumb)?\.(webp|jpg|png)$/.test(p)) return true;
  const m = /^data\/([A-Za-z]+)\.json$/.exec(p);
  return !!m && (TABLE_NAMES.includes(m[1] as ArchiveTable) || m[1] === 'legacyAchievements');
}

export interface ImportResult {
  added: number;
  replaced: number;
  kept: number;
  photos: number;
}

/**
 * Applies a verified preview. New records are added; records that differ from this device follow
 * `onConflict` ("keep" this device's copy or "replace" it with the archive's).
 */
export async function applyImport(
  preview: ImportPreview,
  onConflict: 'keep' | 'replace',
): Promise<ImportResult> {
  const result: ImportResult = { added: 0, replaced: 0, kept: 0, photos: 0 };
  const allTables = TABLE_NAMES.map(tableOf);
  await withQuotaRecovery(() =>
    db.transaction('rw', [...allTables, db.mediaBlobs, db.meta], async () => {
      for (const t of TABLE_NAMES) {
        const table = tableOf(t);
        const conflicts = new Set(preview.conflictIds[t]);
        const rows = preview.records[t];
        const existing = await table.bulkGet(rows.map((r) => r.id));
        const toPut = rows.filter((r, i) => {
          if (!existing[i]) {
            result.added++;
            return true;
          }
          if (conflicts.has(r.id)) {
            if (onConflict === 'replace') {
              result.replaced++;
              return true;
            }
            result.kept++;
          }
          return false;
        });
        if (toPut.length > 0) await table.bulkPut(toPut);
      }
      for (const [id, f] of preview.mediaFiles) {
        if (!f.full || !f.thumb) continue;
        if (await db.mediaBlobs.get(id)) continue;
        const media = await db.media.get(id);
        if (!media) continue;
        const type = media.mime ?? 'image/webp';
        await db.mediaBlobs.put({
          id,
          full: new Blob([f.full.slice().buffer], { type }),
          thumb: new Blob([f.thumb.slice().buffer], { type: MIME_BY_EXT.webp ?? type }),
        });
        result.photos++;
      }
      if (preview.achievements && !(await getMeta('legacyAchievements')))
        await setMeta('legacyAchievements', preview.achievements);
    }),
  );
  return result;
}
