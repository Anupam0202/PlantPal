import { fitWithin } from '@plantpal/domain';
import { MediaError } from './errors';

export const MAX_INPUT_BYTES = 30 * 1024 * 1024;
export const MAX_STORED_BYTES = 8 * 1024 * 1024;
export const FULL_EDGE = 2048;
export const THUMB_EDGE = 400;

export interface ProcessedImage {
  full: Blob;
  thumb: Blob;
  width: number;
  height: number;
  sha256: string;
}

/** Detects the real image type from magic bytes (file names and `type` can lie). */
export function sniffImageType(head: Uint8Array): string | null {
  const b = (i: number) => head[i] ?? -1;
  if (b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff) return 'image/jpeg';
  if (b(0) === 0x89 && b(1) === 0x50 && b(2) === 0x4e && b(3) === 0x47) return 'image/png';
  if (b(0) === 0x47 && b(1) === 0x49 && b(2) === 0x46) return 'image/gif';
  if (
    b(0) === 0x52 &&
    b(1) === 0x49 &&
    b(2) === 0x46 &&
    b(3) === 0x46 &&
    b(8) === 0x57 &&
    b(9) === 0x45 &&
    b(10) === 0x42 &&
    b(11) === 0x50
  )
    return 'image/webp';
  const ftyp = String.fromCharCode(b(4), b(5), b(6), b(7));
  if (ftyp === 'ftyp') {
    const brand = String.fromCharCode(b(8), b(9), b(10), b(11));
    if (brand.startsWith('avi')) return 'image/avif';
    if (/^(heic|heix|hevc|mif1|msf1)$/.test(brand)) return 'image/heic';
  }
  return null;
}

export async function sha256Hex(data: Blob | ArrayBuffer | Uint8Array): Promise<string> {
  const buf =
    data instanceof Blob ? await data.arrayBuffer() : data instanceof Uint8Array ? data.slice().buffer : data;
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest), (x) => x.toString(16).padStart(2, '0')).join('');
}

async function encode(bitmap: ImageBitmap, maxEdge: number, quality: number): Promise<Blob> {
  const { width, height } = fitWithin(bitmap.width, bitmap.height, maxEdge);
  let blob: Blob | null = null;
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new MediaError('decode-failed');
    ctx.drawImage(bitmap, 0, 0, width, height);
    blob = await canvas.convertToBlob({ type: 'image/webp', quality });
    if (blob.type !== 'image/webp') blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.85 });
  } else {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new MediaError('decode-failed');
    ctx.drawImage(bitmap, 0, 0, width, height);
    const toBlob = (type: string, q: number) =>
      new Promise<Blob | null>((res) => canvas.toBlob(res, type, q));
    blob = await toBlob('image/webp', quality);
    if (!blob || blob.type !== 'image/webp') blob = await toBlob('image/jpeg', 0.85);
  }
  if (!blob) throw new MediaError('decode-failed');
  return blob;
}

/**
 * Decode → apply EXIF orientation → resize (≤ 2048 px, thumbnail ≤ 400 px) → re-encode as WebP
 * (JPEG fallback). Re-encoding drops all metadata, including GPS position.
 */
export async function processImage(input: Blob): Promise<ProcessedImage> {
  if (input.size > MAX_INPUT_BYTES) throw new MediaError('too-large');
  const head = new Uint8Array(await input.slice(0, 16).arrayBuffer());
  const type = sniffImageType(head);
  if (!type) throw new MediaError('unsupported');
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(input, { imageOrientation: 'from-image' });
  } catch {
    throw new MediaError(type === 'image/heic' ? 'unsupported' : 'decode-failed');
  }
  try {
    const full = await encode(bitmap, FULL_EDGE, 0.82);
    if (full.size > MAX_STORED_BYTES) throw new MediaError('too-large-after-processing');
    const thumb = await encode(bitmap, THUMB_EDGE, 0.75);
    const dims = fitWithin(bitmap.width, bitmap.height, FULL_EDGE);
    return { full, thumb, width: dims.width, height: dims.height, sha256: await sha256Hex(full) };
  } finally {
    bitmap.close();
  }
}

/** Turns a `data:image/...;base64,` URL into a Blob without fetch (CSP blocks `data:` in connect-src). */
export function dataUrlToBlob(dataUrl: string): Blob {
  const m = /^data:([^;,]+);base64,(.*)$/s.exec(dataUrl);
  if (!m) throw new MediaError('unsupported');
  const bin = atob((m[2] ?? '').replace(/\s/g, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: m[1] ?? 'application/octet-stream' });
}
