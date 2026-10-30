import { gardenStory, todayIn, type Story } from '@plantpal/domain';
import type { Garden } from '@plantpal/schemas';
import { Button, Card, CheckboxField, EmptyState, Notice, PageHeader, Spinner } from '@plantpal/ui';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronLeft, ChevronRight, Download, Printer } from 'lucide-react';
import { useState } from 'react';
import { Page } from '../../app/Page';
import { db } from '../../data/db';
import { useActiveGarden, useMediaUrl } from '../../data/queries';
import { GardenLoading, NoGarden } from '../../features/garden/NoGarden';
import { gardenBloomWheel } from '../../features/nature/bloomData';
import { useFormat } from '../../i18n';
import { downloadBlob } from '../../lib/download';

export const Route = createFileRoute('/nature/story')({
  validateSearch: (s: Record<string, unknown>): { year?: number } => {
    const y = Number(s.year);
    return Number.isInteger(y) && y >= 2000 && y <= 2100 ? { year: y } : {};
  },
  component: StoryPage,
});

const alive = <T extends { deletedAt: number | null }>(r: T) => r.deletedAt === null;
const MONTHS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

function StoryPage() {
  const { garden, gardens } = useActiveGarden();
  if (garden === undefined || gardens === undefined)
    return (
      <Page>
        <GardenLoading />
      </Page>
    );
  if (garden === null)
    return (
      <Page>
        <NoGarden />
      </Page>
    );
  return <StoryFor garden={garden} />;
}

function StoryFor({ garden }: { garden: Garden }) {
  const fmt = useFormat();
  const navigate = useNavigate({ from: '/nature/story' });
  const thisYear = Number(todayIn(garden.timezone).slice(0, 4));
  const { year = thisYear } = Route.useSearch();
  const [withPhotos, setWithPhotos] = useState(false);
  const [saving, setSaving] = useState(false);

  const data = useLiveQuery(async () => {
    const id = garden.id;
    const [specimens, harvests, visits, care, media] = await Promise.all([
      db.specimens.where('gardenId').equals(id).toArray(),
      db.harvests.where('gardenId').equals(id).toArray(),
      db.natureVisits.where('gardenId').equals(id).toArray(),
      db.careEvents.where('gardenId').equals(id).toArray(),
      db.media.where('gardenId').equals(id).toArray(),
    ]);
    const story = gardenStory({
      year,
      plantings: specimens.filter(alive).map((s) => ({ name: s.displayName, plantedOn: s.plantedOn })),
      harvests: harvests.filter(alive).map((h) => ({
        name: h.plantName,
        massG: h.massG,
        count: h.count,
        countLabel: h.countLabel,
        on: h.harvestedOn,
      })),
      visits: visits
        .filter(alive)
        .map((v) => ({ protocol: v.protocol, on: v.occurredOn, records: v.records })),
      rain: care
        .filter((c) => alive(c) && c.kind === 'water' && c.waterSource === 'rain' && c.amountMl !== null)
        .map((c) => ({ on: c.occurredOn, litres: (c.amountMl ?? 0) / 1000 })),
      photos: media
        .filter((m) => alive(m) && m.kind === 'stored')
        .map((m) => ({ id: m.id, on: new Date(m.createdAt).toISOString().slice(0, 10) })),
    });
    const wheel = gardenBloomWheel(garden, specimens.filter(alive), visits.filter(alive));
    const forage = Object.entries(wheel.months)
      .filter(([, m]) => m.state === 'FORAGE')
      .map(([k]) => Number(k));
    return { story, forage };
  }, [garden, year]);

  const go = (y: number) => void navigate({ search: { year: y }, replace: true });
  const kg = (g: number) => `${fmt.number(g / 1000, 1)} kg`;

  const saveImage = async () => {
    if (!data) return;
    setSaving(true);
    try {
      const blob = await storyCard(garden.name, data.story, withPhotos);
      downloadBlob(blob, `plantpal-story-${year}.png`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Page>
      <div className="print-story">
        <PageHeader title={`${year} in ${garden.name}`} eyebrow="Garden Story" />
        <div className="no-print mt-3 flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            icon={<ChevronLeft className="size-4" aria-hidden="true" />}
            onClick={() => go(year - 1)}
          >
            {year - 1}
          </Button>
          {year < thisYear && (
            <Button size="sm" variant="ghost" onClick={() => go(year + 1)}>
              {year + 1}
              <ChevronRight className="size-4" aria-hidden="true" />
            </Button>
          )}
        </div>
        {!data ? (
          <Spinner />
        ) : data.story.empty ? (
          <EmptyState
            className="mt-6"
            title={`Nothing recorded in ${year} yet`}
            description="Plantings, harvests, nature visits, rainwater and photos you record will tell this year’s story."
          />
        ) : (
          <div className="mt-6 flex flex-col gap-4">
            {data.story.firstPlantings.length > 0 && (
              <Card>
                <h2 className="text-h3 text-ink">First plantings</h2>
                <ul className="mt-2 flex flex-col gap-1 text-body-s">
                  {data.story.firstPlantings.map((p) => (
                    <li key={`${p.name}${p.on}`} className="flex justify-between gap-2">
                      <span className="text-ink">{p.name}</span>
                      <span className="text-muted">{fmt.date(new Date(`${p.on}T12:00:00Z`))}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
            <Card>
              <h2 className="text-h3 text-ink">Bloom for pollinators</h2>
              <p className="mt-1 text-body-s text-muted">
                Months with known forage now, from the catalogue and your own flowering checks.
              </p>
              <ol className="mt-3 grid grid-cols-12 gap-1" aria-label="Months with known forage">
                {MONTHS.map((m, i) => {
                  const on = data.forage.includes(i + 1);
                  return (
                    <li
                      key={i}
                      className={`rounded-sm py-1 text-center text-caption ${on ? 'bg-accent text-on-accent' : 'bg-sunken text-muted'}`}
                    >
                      <span aria-hidden="true">{m}</span>
                      <span className="sr-only">
                        {fmt.date(new Date(Date.UTC(2026, i, 15)), { month: 'long' })}:{' '}
                        {on ? 'forage' : 'no known forage'}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </Card>
            {data.story.harvests.length > 0 && (
              <Card>
                <h2 className="text-h3 text-ink">Top harvests</h2>
                <ul className="mt-2 flex flex-col gap-1 text-body-s">
                  {data.story.harvests.map((h) => (
                    <li key={h.name} className="flex justify-between gap-2">
                      <span className="text-ink">{h.name}</span>
                      <span className="text-muted">
                        {[
                          h.massG ? kg(h.massG) : null,
                          h.count ? `${h.count} ${h.countLabel ?? ''}`.trim() : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
            {data.story.visits > 0 && (
              <Card>
                <h2 className="text-h3 text-ink">Visitors observed</h2>
                <p className="mt-1 text-body-s text-muted">
                  {data.story.visits} nature visits. Counts reflect when and where you looked.
                </p>
                <ul className="mt-2 flex flex-col gap-1 text-body-s">
                  {data.story.visitors.map((v) => (
                    <li key={v.group} className="flex justify-between gap-2">
                      <span className="text-ink">{v.group}</span>
                      <span className="text-muted">{v.individuals}</span>
                    </li>
                  ))}
                </ul>
                {data.story.named.length > 0 && (
                  <p className="mt-2 text-body-s text-ink">{fmt.list(data.story.named)}</p>
                )}
              </Card>
            )}
            {data.story.rainLitres > 0 && (
              <Card>
                <h2 className="text-h3 text-ink">Rainwater used</h2>
                <p className="mt-1 text-body text-ink">
                  {fmt.number(data.story.rainLitres)} litres, as logged
                </p>
              </Card>
            )}
            {data.story.photos.length > 0 && (
              <Card className={withPhotos ? '' : 'no-print'}>
                <h2 className="text-h3 text-ink">Photo timeline</h2>
                <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {data.story.photos.map((id) => (
                    <li key={id}>
                      <Thumb id={id} />
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </div>
        )}
      </div>

      {data && !data.story.empty && (
        <Card className="no-print mt-6 flex flex-col gap-3">
          <h2 className="text-body font-semibold text-ink">Share this story</h2>
          <Notice>
            Only the garden’s name appears, never its address or coordinates. Check what you share first.
          </Notice>
          {data.story.photos.length > 0 && (
            <CheckboxField
              label="Include photos"
              description="Photos can show faces or details of where you live. Look through them before sharing."
              checked={withPhotos}
              onCheckedChange={setWithPhotos}
            />
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              loading={saving}
              icon={<Download className="size-4" aria-hidden="true" />}
              onClick={() => void saveImage()}
            >
              Save as image
            </Button>
            <Button
              variant="secondary"
              icon={<Printer className="size-4" aria-hidden="true" />}
              onClick={() => window.print()}
            >
              Print or save as PDF
            </Button>
          </div>
        </Card>
      )}
    </Page>
  );
}

function Thumb({ id }: { id: string }) {
  const url = useMediaUrl(id, 'thumb');
  const alt = useLiveQuery(async () => (await db.media.get(id))?.alt ?? '', [id]);
  return url ? (
    <img src={url} alt={alt ?? ''} className="aspect-square w-full rounded-md object-cover" />
  ) : (
    <div className="aspect-square w-full rounded-md bg-sunken" />
  );
}

/** A 1080 × 1350 image card drawn on a canvas: numbers from the records, photos only when chosen. */
async function storyCard(name: string, s: Story, withPhotos: boolean): Promise<Blob> {
  const W = 1080;
  const H = 1350;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const css = getComputedStyle(document.documentElement);
  const color = (v: string, fb: string) => css.getPropertyValue(v).trim() || fb;
  ctx.fillStyle = color('--color-surface', '#fbf8f1');
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = color('--color-accent', '#2f7d4f');
  ctx.fillRect(0, 0, W, 16);
  ctx.fillStyle = color('--color-ink', '#1d2a22');
  ctx.font = '600 64px Fraunces Variable, Georgia, serif';
  ctx.fillText(`${s.year} in ${name}`.slice(0, 32), 72, 150);
  ctx.font = '400 36px Inter Variable, system-ui, sans-serif';
  const lines = [
    s.firstPlantings.length ? `${s.firstPlantings.length} new plantings` : null,
    s.harvests.length
      ? `Harvest: ${s.harvests
          .slice(0, 3)
          .map((h) => (h.massG ? `${h.name} ${(h.massG / 1000).toFixed(1)} kg` : `${h.name} ${h.count}`))
          .join(', ')}`
      : null,
    s.visits ? `${s.visits} nature visits` : null,
    s.rainLitres ? `${s.rainLitres} litres of rainwater used` : null,
  ].filter((x): x is string => Boolean(x));
  lines.forEach((l, i) => ctx.fillText(l.slice(0, 48), 72, 260 + i * 64));
  if (withPhotos && s.photos.length) {
    const size = 300;
    for (const [i, id] of s.photos.slice(0, 6).entries()) {
      const row = await db.mediaBlobs.get(id);
      if (!row?.thumb) continue;
      const bmp = await createImageBitmap(row.thumb);
      const x = 72 + (i % 3) * (size + 18);
      const y = 560 + Math.floor(i / 3) * (size + 18);
      const scale = Math.max(size / bmp.width, size / bmp.height);
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, size, size);
      ctx.clip();
      ctx.drawImage(
        bmp,
        x + (size - bmp.width * scale) / 2,
        y + (size - bmp.height * scale) / 2,
        bmp.width * scale,
        bmp.height * scale,
      );
      ctx.restore();
    }
  }
  ctx.fillStyle = color('--color-muted', '#5b6b60');
  ctx.font = '400 28px Inter Variable, system-ui, sans-serif';
  ctx.fillText('From my PlantPal records', 72, H - 72);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not draw the image'))), 'image/png'),
  );
}
