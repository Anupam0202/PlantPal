import type { Conflict, LoadEstimate } from '@plantpal/domain';
import { itemVolumeL } from '@plantpal/domain';
import type { LayoutBody } from '@plantpal/schemas';
import { Button, Card, Notice } from '@plantpal/ui';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useDesignerT } from './messages';
import type { Designer } from './useDesigner';

const n = (v: number) => (Math.round(v * 100) / 100).toString();

/** Table view: every item with coordinates and dimensions (non-visual parity, §6.7). */
export function ItemTable({ d }: { d: Designer }) {
  const m = useDesignerT();
  return (
    <div
      className="overflow-x-auto rounded-lg border border-line"
      role="region"
      aria-label={m.tableCaption}
      tabIndex={0}
    >
      <table className="w-full text-left text-body-s" data-testid="layout-table">
        <caption className="p-2 text-left text-caption text-muted">{m.tableCaption}</caption>
        <thead>
          <tr className="text-muted">
            <th scope="col" className="p-2 font-medium">
              {m.cols.item}
            </th>
            <th scope="col" className="p-2 text-right font-medium">
              {m.cols.x}
            </th>
            <th scope="col" className="p-2 text-right font-medium">
              {m.cols.y}
            </th>
            <th scope="col" className="p-2 font-medium">
              {m.cols.size}
            </th>
            <th scope="col" className="p-2 text-right font-medium">
              {m.cols.rotation}
            </th>
          </tr>
        </thead>
        <tbody>
          {d.body.items.map((i) => (
            <tr
              key={i.id}
              className={`border-t border-line ${d.selected?.id === i.id ? 'bg-accent-soft' : ''}`}
            >
              <th scope="row" className="p-2 font-normal">
                <button
                  type="button"
                  className="text-left text-accent-ink underline"
                  onClick={() => d.select(i.id)}
                >
                  {m.kinds[i.kind]}
                  {i.label ? ` “${i.label}”` : ''}
                </button>
              </th>
              <td className="tabular p-2 text-right">{n(i.x)}</td>
              <td className="tabular p-2 text-right">{n(i.y)}</td>
              <td className="tabular p-2">
                {i.shape === 'line'
                  ? `→ ${n(i.x2)}, ${n(i.y2)}${i.heightM ? ` · h ${n(i.heightM)}` : ''}`
                  : i.shape === 'round'
                    ? `⌀ ${n(i.diameterM)}${i.depthM ? ` · d ${n(i.depthM)}` : ''}`
                    : `${n(i.lengthM)} × ${n(i.widthM)}${i.depthM ? ` · d ${n(i.depthM)}` : ''}${i.heightM ? ` · h ${n(i.heightM)}` : ''}`}
              </td>
              <td className="tabular p-2 text-right">{i.shape === 'rect' ? `${n(i.rotationDeg)}°` : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Conflicts and the saturated-load estimate, with its assumptions and the structural caveat. */
export function ChecksPanel({
  d,
  conflicts,
  load,
}: {
  d: Designer;
  conflicts: Conflict[];
  load: LoadEstimate;
}) {
  const m = useDesignerT();
  return (
    <Card className="flex flex-col gap-3" data-testid="checks">
      <p className="font-medium text-ink">{m.conflicts}</p>
      {conflicts.length === 0 ? (
        <p className="flex items-center gap-2 text-body-s text-muted">
          <CheckCircle2 className="size-4 text-accent-ink" aria-hidden="true" />
          {m.noConflicts}
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5 text-body-s">
          {conflicts.map((c, i) => (
            <li key={i} className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
              <button
                type="button"
                className="text-left text-ink underline decoration-dotted"
                onClick={() => d.select(c.itemIds[0] ?? null)}
              >
                {m.conflictText[c.kind](c.params)}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="border-t border-line pt-3 text-body-s">
        <p className="font-medium text-ink">{m.load}</p>
        <p className="text-ink" data-testid="load">
          {m.loadLine(load.totalKg, load.areaM2, load.kgPerM2)}
        </p>
        <p className="text-caption text-muted">{m.loadAssumptions}</p>
        {load.unknown.length > 0 && (
          <p className="text-caption text-muted">{m.loadUnknown(load.unknown.join(', '))}</p>
        )}
        <Notice tone="warning" className="mt-2">
          {m.loadWarning}
        </Notice>
      </div>
    </Card>
  );
}

/** Things to buy for this layout (feeds Resources & Costs later). */
export function ShoppingList({ body }: { body: LayoutBody }) {
  const m = useDesignerT();
  const lines = new Map<string, number>();
  let soil = 0;
  for (const i of body.items) {
    if (i.kind === 'plant' || i.kind === 'note' || (i.shape === 'line' && i.kind !== 'trellis')) continue;
    if (['wall', 'railing', 'door', 'window', 'overhang', 'path'].includes(i.kind)) continue;
    const size =
      i.shape === 'round'
        ? `⌀ ${Math.round(i.diameterM * 100)} cm`
        : i.shape === 'rect'
          ? `${Math.round(i.lengthM * 100)} × ${Math.round(i.widthM * 100)} cm`
          : '';
    const vol = itemVolumeL(i);
    if (vol !== null) soil += vol;
    const key = `${m.kinds[i.kind]}${size ? ` ${size}` : ''}${vol !== null ? ` (≈ ${vol} L)` : ''}`;
    lines.set(key, (lines.get(key) ?? 0) + 1);
  }
  return (
    <Card className="flex flex-col gap-2 text-body-s" data-testid="shopping">
      <p className="font-medium text-ink">{m.shopping}</p>
      {lines.size === 0 ? (
        <p className="text-muted">{m.shoppingEmpty}</p>
      ) : (
        <ul className="flex flex-col gap-0.5 text-ink">
          {[...lines].map(([k, c]) => (
            <li key={k}>
              {c} × {k}
            </li>
          ))}
          {soil > 0 && <li>≈ {soil} L potting mix</li>}
        </ul>
      )}
      {lines.size > 0 && (
        <Button
          size="sm"
          variant="ghost"
          className="self-start"
          onClick={() =>
            void navigator.clipboard?.writeText([...lines].map(([k, c]) => `${c} × ${k}`).join('\n'))
          }
        >
          {m.copyList}
        </Button>
      )}
    </Card>
  );
}
