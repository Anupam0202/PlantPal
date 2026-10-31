import type { ImagePart } from '@plantpal/ai';
import { useEffect, useState } from 'react';
import { db } from '../../data/db';
import { imageForAi } from '../../data/media';

/** Small copies (≤ 1536 px, re-encoded, no metadata) of stored photos, prepared for an AI request. */
export function useAiPhotos(items: ReadonlyArray<{ id: string; label: string }>) {
  const [ready, setReady] = useState<Array<{ label: string; image: ImagePart }>>([]);
  const key = items.map((i) => i.id).join(',');
  useEffect(() => {
    let live = true;
    void Promise.all(
      items.map(async (i) => {
        const b = await db.mediaBlobs.get(i.id);
        if (!b) return null;
        const image: ImagePart = await imageForAi(b.full);
        return { label: i.label, image };
      }),
    )
      .then((r) => {
        if (live) setReady(r.filter((x): x is { label: string; image: ImagePart } => x !== null));
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by the photo ids
  }, [key]);
  return ready;
}
