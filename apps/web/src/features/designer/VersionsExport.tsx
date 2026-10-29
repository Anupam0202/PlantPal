import { fromLayoutExport, layoutSvg, LayoutImportError, toLayoutExport } from '@plantpal/domain';
import type { Layout, LayoutBody, LayoutItem } from '@plantpal/schemas';
import { Button, Card, TextField } from '@plantpal/ui';
import { Download, FileJson, Printer, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { useLayoutVersions } from '../../data/queries';
import { useFormat } from '../../i18n';
import { downloadBlob } from '../../lib/download';
import { useDesignerT } from './messages';

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'layout';
const svgUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

export function diffLayouts(a: LayoutBody, b: LayoutBody) {
  const ia = new Map(a.items.map((i) => [i.id, i]));
  const ib = new Map(b.items.map((i) => [i.id, i]));
  const geo = (i: LayoutItem) =>
    [i.x, i.y, i.x2, i.y2, i.lengthM, i.widthM, i.diameterM, i.rotationDeg].join(',');
  return {
    added: [...ib.keys()].filter((k) => !ia.has(k)).length,
    removed: [...ia.keys()].filter((k) => !ib.has(k)).length,
    moved: [...ib.entries()].filter(([k, v]) => ia.has(k) && geo(ia.get(k)!) !== geo(v)).length,
  };
}

/** Saved versions with a compare view (§6.7). */
export function VersionsPanel({
  layout,
  body,
  dirty,
  onSave,
  spreadM,
  blocked = null,
}: {
  layout: Layout;
  body: LayoutBody;
  dirty: boolean;
  onSave: (note: string) => Promise<void>;
  /** Why saving is not possible right now (shown instead of saving). */
  blocked?: string | null;
  spreadM: (i: LayoutItem) => number | null;
}) {
  const m = useDesignerT();
  const fmt = useFormat();
  const versions = useLayoutVersions(layout.id);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [compare, setCompare] = useState<number | null>(null);
  const other = versions?.find((v) => v.version === compare);
  return (
    <Card className="flex flex-col gap-3" data-testid="versions">
      <p className="font-medium text-ink">{m.versions}</p>
      {dirty && <p className="text-caption text-warning">{m.unsaved}</p>}
      {blocked && <p className="text-caption text-warning">{blocked}</p>}
      <TextField label={m.saveNote} value={note} onValueChange={setNote} maxLength={200} />
      <Button
        size="sm"
        className="self-start"
        disabled={busy || !dirty || Boolean(blocked)}
        onClick={() => {
          setBusy(true);
          void onSave(note)
            .then(() => setNote(''))
            .finally(() => setBusy(false));
        }}
      >
        {m.save}
      </Button>
      <ul className="flex flex-col gap-1 text-body-s">
        {versions?.map((v) => (
          <li key={v.id} className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-ink">
              {m.version(
                v.version,
                fmt.date(new Date(v.savedAt), {
                  day: 'numeric',
                  month: 'short',
                  hour: 'numeric',
                  minute: '2-digit',
                }),
              )}
              {v.note ? ` · ${v.note}` : ''}
            </span>
            {v.version !== layout.version && (
              <Button
                size="sm"
                variant="ghost"
                aria-label={m.compareWith(v.version)}
                onClick={() => setCompare(v.version)}
              >
                {m.compare}
              </Button>
            )}
          </li>
        ))}
      </ul>
      {other && (
        <div className="flex flex-col gap-2 border-t border-line pt-3" data-testid="compare">
          <p className="font-medium text-ink">{m.compareTitle(other.version, layout.version)}</p>
          {(() => {
            const d = diffLayouts(other.body, body);
            return (
              <p className="text-body-s text-ink">
                {m.diffAdded(d.added)} · {m.diffRemoved(d.removed)} · {m.diffMoved(d.moved)}
              </p>
            );
          })()}
          <div className="grid grid-cols-2 gap-2">
            <img
              src={svgUrl(layoutSvg(other.body, { title: `v${other.version}`, spreadM }))}
              alt={m.versionAlt(other.version)}
              className="w-full rounded border border-line"
            />
            <img
              src={svgUrl(layoutSvg(body, { title: m.plan, spreadM }))}
              alt={m.plan}
              className="w-full rounded border border-line"
            />
          </div>
          <Button size="sm" variant="ghost" className="self-start" onClick={() => setCompare(null)}>
            {m.closeCompare}
          </Button>
        </div>
      )}
    </Card>
  );
}

/** Export as JSON (local metric frame), SVG, PNG or print to PDF; import a JSON layout. */
export function ExportPanel({
  body,
  spreadM,
  onImport,
}: {
  body: LayoutBody;
  spreadM: (i: LayoutItem) => number | null;
  onImport: (b: LayoutBody) => Promise<void>;
}) {
  const m = useDesignerT();
  const file = useRef<HTMLInputElement>(null);
  const [printing, setPrinting] = useState<string | null>(null);
  const name = slug(body.name);
  const svg = () => layoutSvg(body, { title: body.name, spreadM });

  const png = async () => {
    const s = svg();
    const url = URL.createObjectURL(new Blob([s], { type: 'image/svg+xml' }));
    try {
      const img = new Image();
      await new Promise<void>((res, rej) => {
        img.onload = () => res();
        img.onerror = () => rej(new Error('image'));
        img.src = url;
      });
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || 1200;
      canvas.height = img.naturalHeight || 800;
      canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
      if (blob) downloadBlob(blob, `${name}.png`);
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  return (
    <Card className="flex flex-col gap-2" data-testid="export">
      <p className="font-medium text-ink">{m.export}</p>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="secondary"
          onClick={() =>
            downloadBlob(
              new Blob([JSON.stringify(toLayoutExport(body), null, 2)], { type: 'application/json' }),
              `${name}.layout.json`,
            )
          }
        >
          <FileJson className="size-4" aria-hidden="true" />
          {m.exportJson}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => downloadBlob(new Blob([svg()], { type: 'image/svg+xml' }), `${name}.svg`)}
        >
          <Download className="size-4" aria-hidden="true" />
          {m.exportSvg}
        </Button>
        <Button size="sm" variant="secondary" onClick={() => void png()}>
          <Download className="size-4" aria-hidden="true" />
          {m.exportPng}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            setPrinting(svgUrl(svg()));
            setTimeout(() => {
              window.print();
              setPrinting(null);
            }, 300);
          }}
        >
          <Printer className="size-4" aria-hidden="true" />
          {m.exportPrint}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => file.current?.click()}>
          <Upload className="size-4" aria-hidden="true" />
          {m.importJson}
        </Button>
        <input
          ref={file}
          type="file"
          accept="application/json,.json"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          data-testid="layout-import"
          onChange={(e) => {
            const f = e.currentTarget.files?.[0];
            e.currentTarget.value = '';
            if (!f) return;
            void f
              .text()
              .then((t) => onImport(fromLayoutExport(JSON.parse(t))))
              .then(() => toast.success(m.imported))
              .catch((err: unknown) =>
                toast.error(
                  err instanceof LayoutImportError && err.code === 'geojson'
                    ? m.importGeojson
                    : m.importFailed,
                ),
              );
          }}
        />
      </div>
      {printing && (
        <div className="print-area" aria-hidden="true">
          <img src={printing} alt="" />
        </div>
      )}
    </Card>
  );
}
