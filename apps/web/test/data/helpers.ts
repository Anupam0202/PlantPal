import { db } from '../../src/data/db';
import type { ProcessedImage } from '../../src/data/media';

export async function resetDb(): Promise<void> {
  db.close();
  await db.delete();
  await db.open();
}

/** Stand-in for the canvas pipeline, which happy-dom cannot run. Produces deterministic "images". */
export async function fakeProcess(input: Blob): Promise<ProcessedImage> {
  const bytes = new Uint8Array(await input.arrayBuffer());
  const full = new Blob([bytes.slice(0, 8), new Uint8Array([1, 2, 3])], { type: 'image/webp' });
  const thumb = new Blob([new Uint8Array([4, 5])], { type: 'image/webp' });
  return { full, thumb, width: 10, height: 8, sha256: 'a'.repeat(64) };
}
