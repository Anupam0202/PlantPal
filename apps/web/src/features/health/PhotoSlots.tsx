import type { Media } from '@plantpal/schemas';
import { Button, Spinner } from '@plantpal/ui';
import { Camera, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { deleteMedia, storeImage } from '../../data/commands';
import { useMedia } from '../../data/queries';
import { useT } from '../../i18n';
import { reportError } from '../garden/errors';
import { MediaThumb } from '../garden/Media';

export const SLOTS = ['whole', 'leafTop', 'leafUnder', 'stem', 'soil'] as const;
export type Slot = (typeof SLOTS)[number];

/** Guided photo slots (§6.8). Photos are processed on the device; location data is removed. */
export function PhotoSlots({
  gardenId,
  value,
  onChange,
  labels,
}: {
  gardenId: string | null;
  value: Partial<Record<Slot, string>>;
  onChange: (v: Partial<Record<Slot, string>>) => void;
  labels: Record<Slot, string>;
}) {
  const t = useT();
  const ids = Object.values(value).filter((x): x is string => Boolean(x));
  const media = useMedia(ids);
  const byId = new Map((media ?? []).map((m: Media) => [m.id, m]));
  const inputs = useRef<Partial<Record<Slot, HTMLInputElement | null>>>({});
  const [busy, setBusy] = useState<Slot | null>(null);

  const pick = async (slot: Slot, files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setBusy(slot);
    try {
      const m = await storeImage(file, { gardenId, link: null });
      const old = value[slot];
      if (old) void deleteMedia(old);
      onChange({ ...value, [slot]: m.id });
    } catch (e) {
      reportError(t, e);
    } finally {
      setBusy(null);
      const el = inputs.current[slot];
      if (el) el.value = '';
    }
  };

  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {SLOTS.map((slot) => {
        const id = value[slot];
        const m = id ? byId.get(id) : undefined;
        return (
          <li key={slot} className="flex flex-col gap-1.5 rounded-md border border-line p-2">
            <span className="text-caption font-medium text-ink">{labels[slot]}</span>
            {m ? (
              <div className="relative">
                <MediaThumb media={m} className="aspect-square w-full" />
                <button
                  type="button"
                  onClick={() => {
                    onChange({ ...value, [slot]: undefined });
                    void deleteMedia(m.id);
                  }}
                  className="absolute -top-2 -right-2 inline-flex size-8 items-center justify-center rounded-full border border-line bg-raised text-ink shadow-1 hover:bg-sunken"
                  aria-label={`${t.photo.remove}: ${labels[slot]}`}
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
              </div>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={busy !== null}
                onClick={() => inputs.current[slot]?.click()}
                aria-label={`${t.photo.add}: ${labels[slot]}`}
              >
                {busy === slot ? <Spinner /> : <Camera className="size-4" aria-hidden="true" />}
                {t.photo.add}
              </Button>
            )}
            <input
              ref={(el) => {
                inputs.current[slot] = el;
              }}
              type="file"
              accept="image/*"
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              data-testid={`photo-slot-${slot}`}
              onChange={(e) => void pick(slot, e.currentTarget.files)}
            />
          </li>
        );
      })}
    </ul>
  );
}
