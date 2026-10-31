/** Key-order independent JSON, so the same payload always hashes the same. */
export function canonicalJson(v: unknown): string {
  return JSON.stringify(v, (_k, x: unknown) =>
    x && typeof x === 'object' && !Array.isArray(x)
      ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : x,
  );
}

/** SHA-256 of the canonical payload, hex. Works in Workers, browsers and Node. */
export async function payloadHash(v: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalJson(v ?? null));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
