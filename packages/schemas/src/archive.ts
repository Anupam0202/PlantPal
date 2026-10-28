import { z } from 'zod';

export const ARCHIVE_FORMAT = 'plantpal-archive';
export const ARCHIVE_FORMAT_VERSION = 1;

export const ArchiveFile = z.object({
  path: z
    .string()
    .min(1)
    .max(200)
    .regex(/^(data|media)\/[A-Za-z0-9._-]+$/, 'Unexpected file path in archive'),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  bytes: z.number().int().nonnegative(),
});
export type ArchiveFile = z.infer<typeof ArchiveFile>;

/** `manifest.json` at the root of every PlantPal export archive. */
export const ArchiveManifest = z.object({
  format: z.literal(ARCHIVE_FORMAT),
  formatVersion: z.number().int().positive(),
  exportedAt: z.string(),
  app: z.object({ name: z.string(), version: z.string() }),
  clientSchema: z.number().int().positive(),
  counts: z.record(z.string(), z.number().int().nonnegative()),
  files: z.array(ArchiveFile).max(50_000),
});
export type ArchiveManifest = z.infer<typeof ArchiveManifest>;
