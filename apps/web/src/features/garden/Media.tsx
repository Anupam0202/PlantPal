import { Button, cn, Spinner } from '@plantpal/ui';
import type { Media } from '@plantpal/schemas';
import { Camera, ImageOff, Link2, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { deleteMedia, storeImage } from '../../data/commands';
import { useMedia, useMediaUrl } from '../../data/queries';
import { useT } from '../../i18n';
import { reportError } from './errors';

/** Thumbnail of a stored photo, or an honest placeholder for links and unrecoverable photos. */
export function MediaThumb({
  media,
  className,
  size = 'md',
}: {
  media: Media;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const t = useT();
  const url = useMediaUrl(media.kind === 'stored' ? media.id : null, size === 'lg' ? 'full' : 'thumb');
  const box = cn(
    'overflow-hidden rounded-md bg-sunken',
    size === 'sm' && 'size-14',
    size === 'md' && 'size-24',
    size === 'lg' && 'aspect-[4/3] w-full',
    className,
  );
  if (media.kind === 'external' && media.externalUrl) {
    return (
      <a
        href={media.externalUrl}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className={cn(
          box,
          'flex flex-col items-center justify-center gap-1 p-2 text-center text-caption text-muted underline',
        )}
      >
        <Link2 className="size-5" aria-hidden="true" />
        {t.journal.photoLink}
      </a>
    );
  }
  if (media.flag === 'broken' || (media.kind === 'stored' && url === null && media.bytes === null)) {
    return (
      <div
        className={cn(
          box,
          'flex flex-col items-center justify-center gap-1 p-2 text-center text-caption text-muted',
        )}
        role="img"
        aria-label={t.journal.photoBroken}
      >
        <ImageOff className="size-5" aria-hidden="true" />
        <span aria-hidden="true">{t.journal.photoBroken}</span>
      </div>
    );
  }
  return (
    <div className={box}>
      {url ? (
        <img src={url} alt={media.alt} className="size-full object-cover" loading="lazy" decoding="async" />
      ) : (
        <div className="skeleton size-full" aria-hidden="true" />
      )}
    </div>
  );
}

export function MediaStrip({ ids, size = 'md' }: { ids: readonly string[]; size?: 'sm' | 'md' }) {
  const media = useMedia(ids);
  if (!media || media.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-2">
      {media.map((m) => (
        <li key={m.id}>
          <MediaThumb media={m} size={size} />
        </li>
      ))}
    </ul>
  );
}

/**
 * Picks and processes photos on the device. Stored photos start unlinked; the caller links them to the
 * entry it saves (see `linkMedia`) and calls `discard` if the form is cancelled.
 */
export function PhotoField({
  gardenId,
  value,
  onChange,
  max = 4,
  label,
}: {
  gardenId: string | null;
  value: string[];
  onChange: (ids: string[]) => void;
  max?: number;
  label?: string;
}) {
  const t = useT();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const media = useMedia(value);

  const onFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBusy(true);
    const added: string[] = [];
    try {
      for (const file of Array.from(files).slice(0, max - value.length)) {
        const m = await storeImage(file, { gardenId, link: null });
        added.push(m.id);
      }
    } catch (e) {
      reportError(t, e);
    } finally {
      setBusy(false);
      if (added.length > 0) onChange([...value, ...added]);
      if (input.current) input.current.value = '';
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <span className="text-body-s font-medium text-ink">{label ?? t.plant.photo}</span>
      {media && media.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {media.map((m) => (
            <li key={m.id} className="relative">
              <MediaThumb media={m} />
              <button
                type="button"
                onClick={() => {
                  onChange(value.filter((id) => id !== m.id));
                  void deleteMedia(m.id);
                }}
                className="absolute -top-2 -right-2 inline-flex size-8 items-center justify-center rounded-full border border-line bg-raised text-ink shadow-1 hover:bg-sunken"
                aria-label={t.photo.remove}
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center gap-3">
        <input
          ref={input}
          type="file"
          accept="image/*"
          multiple={max - value.length > 1}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          data-testid="photo-input"
          onChange={(e) => void onFiles(e.currentTarget.files)}
        />
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={busy || value.length >= max}
          onClick={() => input.current?.click()}
        >
          {busy ? <Spinner /> : <Camera className="size-4" aria-hidden="true" />}
          {busy ? t.photo.processing : value.length > 0 ? t.photo.change : t.photo.add}
        </Button>
      </div>
      <p className="text-caption text-muted">{t.photo.privacy}</p>
    </div>
  );
}
