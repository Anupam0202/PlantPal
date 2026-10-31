import {
  estimateLoad,
  findConflicts,
  GROWTH_STAGES,
  hoursAt,
  isSimplePolygon,
  sizeAtStage,
  type GrowthStage,
  type PlantFacts,
  type Vec,
} from '@plantpal/domain';
import {
  LAYOUT_KINDS,
  LAYOUT_LAYERS,
  type Layout,
  type LayoutBody,
  type LayoutItem,
  type LayoutLayer,
  type NumRange,
} from '@plantpal/schemas';
import {
  Button,
  Card,
  Chip,
  EmptyState,
  PageHeader,
  SegmentedControl,
  SelectField,
  Spinner,
  SwitchField,
  Tabs,
} from '@plantpal/ui';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { ChevronLeft, Redo2, Trash2, Undo2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Page } from '../../../app/Page';
import { createLayout, deleteLayout, saveLayout } from '../../../data/commands';
import { useGarden, useLayout, useSpecimens, useZones } from '../../../data/queries';
import { Canvas, type PlantSize } from '../../../features/designer/Canvas';
import { Inspector } from '../../../features/designer/Inspector';
import { PhotoPlan } from '../../../features/designer/PhotoPlan';
import { useDesignerT } from '../../../features/designer/messages';
import { ChecksPanel, ItemTable, ShoppingList } from '../../../features/designer/Panels';
import { useDesigner } from '../../../features/designer/useDesigner';
import { useSun } from '../../../features/designer/useSun';
import { ExportPanel, VersionsPanel } from '../../../features/designer/VersionsExport';
import { reportError } from '../../../features/garden/errors';
import { GardenLoading } from '../../../features/garden/NoGarden';
import { monthName, taxonById } from '../../../features/plan/engine';
import { monthIn } from '../../../features/plan/usePlanContext';
import { useT } from '../../../i18n';
import { useDrafts } from '../../../state/drafts';
import { usePrefs } from '../../../state/prefs';
import { useAiState } from '../../../ai/state';

export const Route = createFileRoute('/plan/design/$layoutId')({
  component: DesignPage,
});

function DesignPage() {
  const { layoutId } = Route.useParams();
  const layout = useLayout(layoutId);
  const garden = useGarden(layout?.gardenId);
  const m = useDesignerT();
  if (layout === undefined || (layout && garden === undefined))
    return (
      <Page>
        <GardenLoading />
      </Page>
    );
  if (layout === null || !garden)
    return (
      <Page>
        <EmptyState title={m.noLayouts} action={<Link to="/plan/design">{m.title}</Link>} />
      </Page>
    );
  return <Editor key={layout.id} layout={layout} garden={garden} />;
}

const range = (tx: ReturnType<typeof taxonById> | null, key: 'spreadCm' | 'heightCm' | 'sunHours') =>
  (tx?.traits.find((a) => a.trait === key)?.value as NumRange | undefined) ?? null;

const bodyOf = (l: Layout): LayoutBody => ({
  name: l.name,
  frame: l.frame,
  outline: l.outline,
  items: l.items,
});

function Editor({ layout, garden }: { layout: Layout; garden: NonNullable<ReturnType<typeof useGarden>> }) {
  const t = useT();
  const m = useDesignerT();
  const navigate = useNavigate();
  const locale = usePrefs((s) => s.locale);
  const zones = useZones(garden.id);
  const liveSpecimens = useSpecimens(garden.id);
  const specimens = useMemo(() => liveSpecimens ?? [], [liveSpecimens]);
  const zone = zones?.find((z) => z.id === layout.zoneId) ?? null;
  const d = useDesigner(bodyOf(layout));
  const [layers, setLayers] = useState<Record<LayoutLayer, boolean>>({
    structure: true,
    containers: true,
    plants: true,
    sun: true,
    notes: true,
  });
  const [view, setView] = useState<'plan' | 'table'>('plan');
  const [stage, setStage] = useState<GrowthStage>('mature');
  const [sunS, setSunS] = useState({ month: monthIn(garden.timezone), hour: 13, heatmap: false });
  const markDirty = useDrafts((s) => s.markDirty);
  const aiLoaded = useAiState((s) => s.loaded);
  const photoPlanOn = useAiState((s) => s.loaded && s.enabled && s.labs.photoPlan);
  useEffect(() => {
    if (!aiLoaded) void useAiState.getState().load();
  }, [aiLoaded]);
  useEffect(() => (d.dirty ? markDirty() : undefined), [d.dirty, markDirty]);

  const place =
    garden.place && garden.place.lat !== null && garden.place.lon !== null
      ? { lat: garden.place.lat, lon: garden.place.lon, timeZone: garden.timezone }
      : null;
  const sun = useSun(d.body, place, zone?.sun?.horizon ?? null, sunS);

  const taxonOf = useCallback(
    (i: LayoutItem) => {
      const id = i.taxonId ?? specimens.find((s) => s.id === i.specimenId)?.catalogTaxonId ?? null;
      return id ? (taxonById(id) ?? null) : null;
    },
    [specimens],
  );
  const sizes = useCallback(
    (i: LayoutItem): PlantSize | null => {
      const tx = taxonOf(i);
      const s = sizeAtStage(
        range(tx, 'spreadCm'),
        (tx?.traits.find((a) => a.trait === 'lifeform')?.value as string) ?? null,
        stage,
      );
      return s ? { r: s.mid / 200, rMin: s.min / 200, rMax: s.max / 200 } : null;
    },
    [taxonOf, stage],
  );
  const spreadM = useCallback((i: LayoutItem) => sizes(i)?.r ?? null, [sizes]);

  const conflicts = useMemo(
    () =>
      findConflicts(d.body, {
        facts: (i): PlantFacts | null => {
          const tx = taxonOf(i);
          if (!tx) return null;
          return {
            name: i.label || tx.names.en,
            spreadCm: range(tx, 'spreadCm'),
            heightCm: range(tx, 'heightCm'),
            minContainerL:
              (tx.traits.find((a) => a.trait === 'minContainerL')?.value as number | undefined) ?? null,
            sunHours: range(tx, 'sunHours'),
          };
        },
        sunHoursAt: (x, y) =>
          sun.grid ? hoursAt(sun.grid, x, y) : (zone?.sun?.monthlyHours[sunS.month] ?? null),
        clearanceM: zone?.clearanceCm ? zone.clearanceCm / 100 : null,
      }),
    [d.body, taxonOf, sun.grid, zone, sunS.month],
  );
  const load = useMemo(() => estimateLoad(d.body), [d.body]);
  const flagged = useMemo(() => new Set(conflicts.flatMap((c) => c.itemIds)), [conflicts]);

  const save = async (note: string) => {
    try {
      const next = await saveLayout(layout.id, layout.version, d.body, note);
      d.markSaved(bodyOf(next));
      toast.success(m.saved);
    } catch (e) {
      reportError(t, e);
    }
  };

  const onKeys = (e: React.KeyboardEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('input, textarea, [contenteditable]')) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) d.redo();
      else d.undo();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      d.redo();
    }
  };

  return (
    <Page width="wide">
      <Link
        to="/plan/design"
        className="mb-2 inline-flex items-center gap-1 text-body-s text-muted hover:text-ink"
      >
        <ChevronLeft className="size-4" aria-hidden="true" />
        {m.title}
      </Link>
      <PageHeader title={d.body.name} description={zone?.name} />
      {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions -- shortcut scope only; every action also has a button */}
      <div className="mt-4 flex flex-col gap-4" onKeyDown={onKeys}>
        <div role="toolbar" aria-label={m.add} className="flex flex-wrap gap-1.5">
          {LAYOUT_KINDS.map((k) => (
            <Button key={k} size="sm" variant="secondary" onClick={() => d.add(k)}>
              {m.addItem(m.kinds[k])}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="ghost" onClick={d.undo} disabled={!d.canUndo}>
            <Undo2 className="size-4" aria-hidden="true" />
            {m.undo}
          </Button>
          <Button size="sm" variant="ghost" onClick={d.redo} disabled={!d.canRedo}>
            <Redo2 className="size-4" aria-hidden="true" />
            {m.redo}
          </Button>
          <fieldset className="flex flex-wrap items-center gap-1.5">
            <legend className="sr-only">{m.layers}</legend>
            {LAYOUT_LAYERS.map((l) => (
              <Chip
                key={l}
                pressed={layers[l]}
                onPressedChange={(on) => setLayers((s) => ({ ...s, [l]: on }))}
              >
                {m.layerNames[l]}
              </Chip>
            ))}
          </fieldset>
          {d.dirty && <span className="text-caption text-warning">{m.unsaved}</span>}
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="flex min-w-0 flex-col gap-3">
            <Tabs<'plan' | 'table'>
              label={m.plan}
              value={view}
              onValueChange={setView}
              items={[
                {
                  value: 'plan',
                  label: m.plan,
                  content: (
                    <Canvas
                      d={d}
                      layers={layers}
                      sizes={sizes}
                      grid={sun.grid}
                      shadows={sun.shadows}
                      flagged={flagged}
                    />
                  ),
                },
                { value: 'table', label: m.table, content: <ItemTable d={d} /> },
              ]}
            />
            <p className="text-caption text-muted">{m.keyboardHelp}</p>
            <ChecksPanel d={d} conflicts={conflicts} load={load} />
          </div>
          <aside className="flex flex-col gap-4">
            <Inspector d={d} specimens={specimens} />
            {photoPlanOn && <PhotoPlan d={d} />}
            <Card className="flex flex-col gap-3" data-testid="sun-panel">
              <p className="font-medium text-ink">{m.sun}</p>
              {place ? (
                <>
                  <p className="text-caption text-muted">{m.sunHint}</p>
                  <SelectField<string>
                    label={m.month}
                    value={String(sunS.month)}
                    onValueChange={(v) => setSunS((s) => ({ ...s, month: Number(v) }))}
                    options={Array.from({ length: 12 }, (_, i) => ({
                      value: String(i),
                      label: monthName(i, locale),
                    }))}
                  />
                  <label className="flex flex-col gap-1 text-body-s font-medium text-ink">
                    {m.hour}: {String(Math.floor(sunS.hour)).padStart(2, '0')}:{sunS.hour % 1 ? '30' : '00'}
                    <input
                      type="range"
                      min={5}
                      max={20}
                      step={0.5}
                      value={sunS.hour}
                      onChange={(e) => setSunS((s) => ({ ...s, hour: Number(e.currentTarget.value) }))}
                      className="w-full accent-[var(--pp-accent)]"
                    />
                  </label>
                  <SwitchField
                    label={m.heatmap}
                    checked={sunS.heatmap}
                    onCheckedChange={(heatmap) => setSunS((s) => ({ ...s, heatmap }))}
                  />
                  {sun.computing && (
                    <p className="flex items-center gap-2 text-caption text-muted" aria-live="polite">
                      <Spinner /> {m.computing}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-body-s text-muted">{m.needLocation}</p>
              )}
              <SelectField<string>
                label={m.up}
                value={String(d.body.frame.rotationDeg)}
                onValueChange={(v) =>
                  d.setBody((b) => ({ ...b, frame: { ...b.frame, rotationDeg: Number(v) } }))
                }
                options={m.bearings.map((b, i) => ({ value: String(i * 45), label: b }))}
              />
            </Card>
            <Card className="flex flex-col gap-2">
              <p className="font-medium text-ink">{m.growth}</p>
              <p className="text-caption text-muted">{m.growthHint}</p>
              <SegmentedControl<GrowthStage>
                label={m.growth}
                value={stage}
                onValueChange={setStage}
                options={GROWTH_STAGES.map((s) => ({ value: s, label: m.stages[s] }))}
              />
            </Card>
            <VersionsPanel
              layout={layout}
              body={d.body}
              dirty={d.dirty}
              onSave={save}
              spreadM={spreadM}
              blocked={isSimplePolygon(d.body.outline as Vec[]) ? null : m.outlineCrossing}
            />
            <ExportPanel
              body={d.body}
              spreadM={spreadM}
              onImport={async (b: LayoutBody) => {
                const l = await createLayout(garden.id, { zoneId: layout.zoneId, body: b });
                await navigate({ to: '/plan/design/$layoutId', params: { layoutId: l.id } });
              }}
            />
            <ShoppingList body={d.body} />
            <Button
              variant="danger-soft"
              className="self-start"
              onClick={() =>
                void deleteLayout(layout.id, layout.version)
                  .then(() => {
                    toast.success(m.deleted);
                    return navigate({ to: '/plan/design' });
                  })
                  .catch((e: unknown) => reportError(t, e))
              }
            >
              <Trash2 className="size-4" aria-hidden="true" />
              {m.deleteLayout}
            </Button>
          </aside>
        </div>
      </div>
    </Page>
  );
}
