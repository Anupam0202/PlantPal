import type { SpaceDetectInput } from '@plantpal/ai';
import type { SpaceDetections } from '@plantpal/schemas';
import { Badge, Button, Card, NumberInput, Notice } from '@plantpal/ui';
import { ImagePlus } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { toast } from 'sonner';
import { AiButton, AiFlow } from '../../ai/AiButton';
import { useAiAction } from '../../ai/useAiAction';
import { imageForAi } from '../../data/media';
import { usePrefs } from '../../state/prefs';
import { useDesignerT } from './messages';
import { placeDetections } from './photoPlan';
import type { Designer } from './useDesigner';

interface Picked {
  url: string;
  w: number;
  h: number;
  image: SpaceDetectInput['image'];
}

/**
 * F9 Photo-to-Plan (Labs). The photo is resized and stripped on this device, sent only after the
 * preview, and never stored. Gemini only marks items; the person sets the scale and checks sizes.
 */
export function PhotoPlan({ d }: { d: Designer }) {
  const m = useDesignerT();
  const locale = usePrefs((s) => s.locale);
  const units = usePrefs((s) => s.units);
  const input = useRef<HTMLInputElement>(null);
  const radioName = useId();
  const [photo, setPhoto] = useState<Picked | null>(null);
  const [ref, setRef] = useState(0);
  const [widthCm, setWidthCm] = useState<number | null>(null);

  useEffect(() => () => (photo ? URL.revokeObjectURL(photo.url) : undefined), [photo]);

  const ai = useAiAction<SpaceDetectInput, SpaceDetections>(
    'space-detect',
    () => (photo ? { policy: { locale, units, seasonModel: 'not relevant' }, image: photo.image } : null),
    { onResult: () => setRef(0) },
  );

  const pick = async (file: File | undefined) => {
    if (!file) return;
    ai.reset();
    try {
      const bitmap = await createImageBitmap(file);
      const { width: w, height: h } = bitmap;
      bitmap.close();
      const image = await imageForAi(file);
      setPhoto({ url: URL.createObjectURL(file), w, h, image });
    } catch {
      toast.error(m.photoPlanBadPhoto);
    }
  };

  const items = ai.result?.imageUsable ? ai.result.items : [];

  const place = () => {
    if (!photo || !widthCm) return;
    const drafts = placeDetections(items, {
      imgW: photo.w,
      imgH: photo.h,
      refIndex: ref,
      refWidthCm: widthCm,
      body: d.body,
      draftNote: m.photoPlanDraft,
    });
    if (drafts.length === 0) return;
    d.setBody((b) => ({ ...b, items: [...b.items, ...drafts] }));
    toast.success(m.photoPlanPlaced(drafts.length));
    ai.reset();
    setPhoto(null);
    setWidthCm(null);
  };

  return (
    <Card className="flex flex-col gap-3" data-testid="photo-plan">
      <div className="flex items-center gap-2">
        <p className="font-medium text-ink">{m.photoPlan}</p>
        <Badge tone="warning">{m.labsBadge}</Badge>
      </div>
      <p className="text-caption text-muted">{m.photoPlanHint}</p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={() => input.current?.click()}>
          <ImagePlus className="size-4" aria-hidden="true" />
          {photo ? m.photoPlanChange : m.photoPlanChoose}
        </Button>
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          data-testid="photo-plan-input"
          onChange={(e) => {
            const f = e.currentTarget.files?.[0];
            e.currentTarget.value = '';
            void pick(f);
          }}
        />
        {photo && <AiButton ai={ai} label={m.photoPlanMark} size="sm" />}
      </div>
      <AiFlow ai={ai} fallback={m.photoPlanFallback} />
      {ai.result && !ai.result.imageUsable && (
        <p className="text-body-s text-muted">{ai.result.abstainReason}</p>
      )}
      {photo && (
        <div className="relative">
          <img src={photo.url} alt={m.photoPlanAlt} className="w-full rounded border border-line" />
          {items.length > 0 && (
            <svg
              viewBox="0 0 1000 1000"
              preserveAspectRatio="none"
              className="pointer-events-none absolute inset-0 size-full"
              aria-hidden="true"
            >
              {items.map((it, i) => {
                const [y0, x0, y1, x1] = it.box_2d as [number, number, number, number];
                return (
                  <g key={i}>
                    <rect
                      x={x0}
                      y={y0}
                      width={x1 - x0}
                      height={y1 - y0}
                      fill="none"
                      stroke={i === ref ? '#f2b705' : '#2e7d32'}
                      strokeWidth={i === ref ? 8 : 4}
                      vectorEffect="non-scaling-stroke"
                    />
                    <text x={x0 + 8} y={y0 + 40} fontSize={36} fill="#fff" stroke="#000" strokeWidth={1}>
                      {i + 1}
                    </text>
                  </g>
                );
              })}
            </svg>
          )}
        </div>
      )}
      {items.length > 0 && (
        <>
          <fieldset className="flex flex-col gap-1.5 text-body-s">
            <legend className="mb-1 font-medium text-ink">{m.photoPlanScale}</legend>
            {items.map((it, i) => (
              <label key={i} className="flex items-center gap-2 text-ink">
                <input
                  type="radio"
                  name={radioName}
                  checked={ref === i}
                  onChange={() => setRef(i)}
                  className="size-4 accent-[var(--pp-accent)]"
                />
                {i + 1}. {m.photoLabels[it.label]}
                {it.note ? ` · ${it.note}` : ''}
              </label>
            ))}
          </fieldset>
          <NumberInput
            label={m.photoPlanWidth}
            value={widthCm}
            onValueChange={setWidthCm}
            min={1}
            max={2000}
            step={1}
          />
          <Notice tone="warning">{m.photoPlanCheck}</Notice>
          <Button size="sm" className="self-start" onClick={place} disabled={!widthCm}>
            {m.photoPlanPlace}
          </Button>
        </>
      )}
    </Card>
  );
}
