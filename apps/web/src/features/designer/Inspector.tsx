import { isSimplePolygon, itemVolumeL, polygonArea, type Vec } from '@plantpal/domain';
import type { LayoutItem, Specimen } from '@plantpal/schemas';
import {
  Button,
  Card,
  IconButton,
  Notice,
  NumberInput,
  SegmentedControl,
  SelectField,
  SwitchField,
  TextField,
} from '@plantpal/ui';
import { Copy, Plus, Trash2 } from 'lucide-react';
import { CATALOG_TAXA } from '../plan/engine';
import { useDesignerT } from './messages';
import type { Designer } from './useDesigner';

const ROUNDABLE = new Set(['container', 'tank', 'bird-bath', 'compost', 'seating']);
const HAS_DEPTH = new Set(['container', 'bed']);
const HAS_HEIGHT = new Set(['wall', 'railing', 'trellis', 'overhang', 'tank', 'compost', 'seating']);
const CAN_SHADE = new Set(['railing', 'trellis', 'tank', 'compost', 'seating', 'bed']);
const NONE = '__none';

/** Numeric property panel: every value the canvas shows can be typed exactly (§6.7 parity). */
export function Inspector({ d, specimens }: { d: Designer; specimens: Specimen[] }) {
  const m = useDesignerT();
  const it = d.selected;
  if (!it)
    return (
      <Card className="flex flex-col gap-3" data-testid="inspector">
        <p className="text-body-s text-muted">{m.nothingSelected}</p>
        <OutlineEditor d={d} />
      </Card>
    );
  const up = (patch: Partial<LayoutItem>) => d.update(it.id, patch);
  const num = (
    key: 'x' | 'y' | 'x2' | 'y2' | 'lengthM' | 'widthM' | 'diameterM' | 'rotationDeg',
    min?: number,
    max = 1000,
  ) => (
    <NumberInput
      label={m.fields[key]}
      value={it[key]}
      onValueChange={(v) => v !== null && up({ [key]: Math.round(v * 100) / 100 })}
      step={key === 'rotationDeg' ? 15 : 0.1}
      min={min}
      max={max}
    />
  );
  const nullable = (key: 'heightM' | 'depthM' | 'volumeL', max: number, step = 0.1) => (
    <NumberInput
      label={m.fields[key]}
      value={it[key]}
      onValueChange={(v) => up({ [key]: v === null ? null : Math.round(v * 100) / 100 })}
      step={step}
      min={0}
      max={max}
    />
  );
  const holders = d.body.items.filter((i) => i.kind === 'container' || i.kind === 'bed');
  const vol = HAS_DEPTH.has(it.kind) ? itemVolumeL(it) : null;

  return (
    <Card className="flex flex-col gap-3" data-testid="inspector">
      <p className="font-medium text-ink">
        {m.properties}: {m.kinds[it.kind]}
      </p>
      <TextField
        label={m.fields.label}
        value={it.label}
        onValueChange={(label) => up({ label })}
        maxLength={80}
      />
      {it.kind === 'note' && (
        <TextField
          label={m.fields.note}
          value={it.note}
          onValueChange={(note) => up({ note })}
          maxLength={200}
          multiline
          rows={2}
        />
      )}
      {ROUNDABLE.has(it.kind) && (
        <div className="flex flex-col gap-1.5">
          <span className="text-body-s font-medium text-ink">{m.fields.shape}</span>
          <SegmentedControl<'round' | 'rect'>
            label={m.fields.shape}
            value={it.shape === 'round' ? 'round' : 'rect'}
            onValueChange={(shape) =>
              up(
                shape === 'round'
                  ? { shape, diameterM: it.diameterM || Math.max(it.lengthM, it.widthM) || 0.3 }
                  : {
                      shape,
                      lengthM: it.lengthM || it.diameterM || 0.4,
                      widthM: it.widthM || it.diameterM || 0.4,
                    },
              )
            }
            options={[
              { value: 'round', label: m.fields.round },
              { value: 'rect', label: m.fields.rect },
            ]}
          />
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        {num('x', -1000)}
        {num('y', -1000)}
        {it.shape === 'line' && (
          <>
            {num('x2', -1000)}
            {num('y2', -1000)}
          </>
        )}
        {it.shape === 'round' && it.kind !== 'plant' && num('diameterM', 0, 50)}
        {it.shape === 'rect' && (
          <>
            {num('lengthM', 0, 100)}
            {num('widthM', 0, 100)}
            {num('rotationDeg', -360, 360)}
          </>
        )}
        {HAS_HEIGHT.has(it.kind) && nullable('heightM', 20)}
        {HAS_DEPTH.has(it.kind) && nullable('depthM', 3, 0.05)}
        {it.kind === 'tank' && nullable('volumeL', 10_000, 10)}
      </div>
      {vol !== null && <p className="text-caption text-muted">{m.volume(vol)}</p>}
      {CAN_SHADE.has(it.kind) && (
        <SwitchField label={m.fields.solid} checked={it.solid} onCheckedChange={(solid) => up({ solid })} />
      )}
      {it.kind === 'plant' && (
        <>
          <SelectField<string>
            label={m.fields.plantSpecimen}
            value={it.specimenId ?? NONE}
            onValueChange={(id) => {
              const s = specimens.find((x) => x.id === id);
              up(
                s
                  ? {
                      specimenId: s.id,
                      taxonId: s.catalogTaxonId ?? it.taxonId,
                      label: it.label || s.displayName,
                    }
                  : { specimenId: null },
              );
            }}
            options={[
              { value: NONE, label: m.fields.none },
              ...specimens.map((s) => ({ value: s.id, label: s.displayName })),
            ]}
          />
          <SelectField<string>
            label={m.fields.plantSpecies}
            value={it.taxonId ?? NONE}
            onValueChange={(id) => {
              const t = CATALOG_TAXA.find((x) => x.id === id);
              up({ taxonId: t ? t.id : null, label: it.label || (t?.names.en ?? '') });
            }}
            options={[
              { value: NONE, label: m.fields.none },
              ...[...CATALOG_TAXA]
                .sort((a, b) => a.names.en.localeCompare(b.names.en))
                .map((t) => ({ value: t.id, label: t.names.en })),
            ]}
          />
          <SelectField<string>
            label={m.fields.inside}
            value={it.inId ?? NONE}
            onValueChange={(id) => {
              const h = holders.find((x) => x.id === id);
              up(h ? { inId: h.id, x: h.x, y: h.y } : { inId: null });
            }}
            options={[
              { value: NONE, label: m.fields.none },
              ...holders.map((h) => ({ value: h.id, label: h.label || `${m.kinds[h.kind]} ${h.x}, ${h.y}` })),
            ]}
          />
        </>
      )}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={() => d.duplicate(it.id)}>
          <Copy className="size-4" aria-hidden="true" />
          {m.duplicate}
        </Button>
        <Button size="sm" variant="danger-soft" onClick={() => d.remove(it.id)}>
          <Trash2 className="size-4" aria-hidden="true" />
          {m.remove}
        </Button>
      </div>
    </Card>
  );
}

const r2 = (v: number) => Math.round(v * 100) / 100;

/**
 * The space outline as numbered corners (rectangle or any polygon). Typed values keep the
 * plan exact; a crossing outline is shown as a warning and not saved until fixed.
 */
function OutlineEditor({ d }: { d: Designer }) {
  const m = useDesignerT();
  const pts = d.body.outline as Vec[];
  const simple = isSimplePolygon(pts);
  const set = (i: number, axis: 0 | 1, v: number) =>
    d.setBody((b) => ({
      ...b,
      outline: b.outline.map((p, j) =>
        j === i ? ((axis === 0 ? [r2(v), p[1]] : [p[0], r2(v)]) as [number, number]) : p,
      ),
    }));
  const addAfter = (i: number) =>
    d.setBody((b) => {
      const a = b.outline[i]!;
      const c = b.outline[(i + 1) % b.outline.length]!;
      const mid: [number, number] = [r2((a[0] + c[0]) / 2), r2((a[1] + c[1]) / 2)];
      return { ...b, outline: [...b.outline.slice(0, i + 1), mid, ...b.outline.slice(i + 1)] };
    });
  const remove = (i: number) => d.setBody((b) => ({ ...b, outline: b.outline.filter((_, j) => j !== i) }));
  return (
    <fieldset className="flex flex-col gap-2 border-t border-line pt-3" data-testid="outline-editor">
      <legend className="font-medium text-ink">{m.outline}</legend>
      <p className="text-caption text-muted">{m.outlineHint(r2(Math.abs(polygonArea(pts))))}</p>
      {!simple && <Notice tone="warning">{m.outlineCrossing}</Notice>}
      <ol className="flex flex-col gap-2">
        {pts.map(([x, y], i) => (
          <li key={i} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-end gap-2">
            <NumberInput
              label={m.cornerX(i + 1)}
              value={x}
              onValueChange={(v) => v !== null && set(i, 0, v)}
              step={0.1}
              min={-1000}
              max={1000}
            />
            <NumberInput
              label={m.cornerY(i + 1)}
              value={y}
              onValueChange={(v) => v !== null && set(i, 1, v)}
              step={0.1}
              min={-1000}
              max={1000}
            />
            <div className="flex gap-1 pb-1">
              <IconButton
                label={m.addCorner(i + 1)}
                variant="ghost"
                size="icon-sm"
                onClick={() => addAfter(i)}
                disabled={pts.length >= 64}
              >
                <Plus className="size-4" aria-hidden="true" />
              </IconButton>
              <IconButton
                label={m.removeCorner(i + 1)}
                variant="ghost"
                size="icon-sm"
                onClick={() => remove(i)}
                disabled={pts.length <= 3}
              >
                <Trash2 className="size-4" aria-hidden="true" />
              </IconButton>
            </div>
          </li>
        ))}
      </ol>
    </fieldset>
  );
}
