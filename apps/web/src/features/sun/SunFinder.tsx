import {
  addObstacle,
  compassToDegrees,
  degreesToCompass,
  flatHorizon,
  lightClass,
  obstacleElevation,
  quickProfile,
  spotFromAnswers,
  sunProfile,
  wallBehind,
  type Compass8,
  type Obstruction,
  type SunSpot,
} from '@plantpal/domain';
import type { ZoneSun } from '@plantpal/schemas';
import { Button, Card, Notice, NumberInput, SelectField, SwitchField, Tabs, cn } from '@plantpal/ui';
import { Plus, Sun, Trash2 } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { usePlanT } from '../plan/messages';
import { MonthlyBars, SunPathDome } from './SunViz';

export interface SunBase {
  lat: number;
  lon: number;
  timeZone: string;
}

export interface Obstacle {
  id: number;
  from: number;
  to: number;
  heightM: number | null;
  distanceM: number | null;
}

export interface SunDraft {
  mode: 'facing' | 'quick' | 'horizon';
  facing: Compass8 | 'open';
  covered: boolean;
  overhangDeg: number;
  across: Obstruction;
  summerHours: number | null;
  winterHours: number | null;
  obstacles: Obstacle[];
}

export function draftFrom(sun: ZoneSun | null | undefined): SunDraft {
  return {
    mode: sun?.method === 'quick' ? 'quick' : sun?.method === 'horizon' ? 'horizon' : 'facing',
    facing: sun?.facingDeg == null ? 'S' : degreesToCompass(sun.facingDeg),
    covered: sun?.overhangDeg != null,
    overhangDeg: sun?.overhangDeg ?? 50,
    across: sun?.across ?? 'none',
    summerHours: sun?.quick?.summerHours ?? null,
    winterHours: sun?.quick?.winterHours ?? null,
    obstacles: [],
  };
}

export interface SunResult {
  spot: SunSpot | null;
  sun: ZoneSun | null;
}

/** Turns the editor state into a sun spot (for the dome) and a zone sun profile (for saving). */
export function computeSun(
  d: SunDraft,
  base: SunBase | null,
  hemisphere: 'north' | 'south',
  year: number,
  now: number,
): SunResult {
  const facingDeg = d.facing === 'open' ? null : compassToDegrees(d.facing);
  if (d.mode === 'quick') {
    if (d.summerHours === null || d.winterHours === null) return { spot: null, sun: null };
    return {
      spot: null,
      sun: {
        method: 'quick',
        facingDeg: null,
        overhangDeg: null,
        across: null,
        horizon: null,
        quick: { summerHours: d.summerHours, winterHours: d.winterHours },
        monthlyHours: quickProfile(d.summerHours, d.winterHours, hemisphere),
        year,
        computedAt: now,
      },
    };
  }
  if (!base) return { spot: null, sun: null };
  let spot: SunSpot;
  if (d.mode === 'facing') {
    spot = spotFromAnswers(
      { facingDeg, covered: d.covered && facingDeg !== null, overhangDeg: d.overhangDeg, across: d.across },
      base,
    );
  } else {
    let horizon = flatHorizon();
    for (const o of d.obstacles) {
      if (o.heightM === null || o.distanceM === null) continue;
      horizon = addObstacle(horizon, o.from, o.to, obstacleElevation(o.heightM, o.distanceM));
    }
    if (facingDeg !== null) horizon = wallBehind(facingDeg, horizon);
    spot = {
      ...base,
      horizon,
      overhang: d.covered && facingDeg !== null ? { facingDeg, cutoffDeg: d.overhangDeg } : null,
    };
  }
  const profile = sunProfile(spot, year, 6);
  return {
    spot,
    sun: {
      method: d.mode,
      facingDeg,
      overhangDeg: spot.overhang ? d.overhangDeg : null,
      across: d.mode === 'facing' ? d.across : null,
      horizon: d.mode === 'horizon' ? spot.horizon.map((v) => Math.round(v * 10) / 10) : null,
      quick: null,
      monthlyHours: profile.monthlyHours,
      year,
      computedAt: now,
    },
  };
}

const GRID: Array<Compass8 | 'open'> = ['NW', 'N', 'NE', 'W', 'open', 'E', 'SW', 'S', 'SE'];

/** 3×3 compass of native radio buttons (arrow keys move between them). */
export function CompassPicker({
  value,
  onChange,
  legend,
  openLabel,
}: {
  value: Compass8 | 'open';
  onChange: (v: Compass8 | 'open') => void;
  legend: string;
  openLabel: string;
}) {
  const name = useId();
  return (
    <fieldset>
      <legend className="mb-2 text-body-s font-medium text-ink">{legend}</legend>
      <div className="grid w-full max-w-60 grid-cols-3 gap-1.5">
        {GRID.map((v) => (
          <label key={v} className="relative">
            <input
              type="radio"
              name={name}
              value={v}
              checked={value === v}
              onChange={() => onChange(v)}
              className="peer absolute inset-0 z-10 size-full cursor-pointer appearance-none opacity-0"
            />
            <span
              className={cn(
                'flex h-11 cursor-pointer items-center justify-center rounded-md border border-line-strong bg-surface text-body-s font-semibold text-ink',
                'peer-checked:border-accent peer-checked:bg-accent-soft peer-checked:text-accent-ink peer-focus-visible:outline-2 peer-focus-visible:outline-focus',
                v === 'open' && 'text-caption font-medium',
              )}
            >
              {v === 'open' ? openLabel : v}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function FacingFields({
  draft,
  set,
  allowOpen = true,
}: {
  draft: SunDraft;
  set: (patch: Partial<SunDraft>) => void;
  allowOpen?: boolean;
}) {
  const m = usePlanT();
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-8">
      <CompassPicker
        legend={m.seed.facing}
        openLabel={allowOpen ? m.seed.openAllRound : '—'}
        value={draft.facing}
        onChange={(facing) => set({ facing })}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <SelectField
          label={m.seed.across}
          value={draft.across}
          onValueChange={(across) => set({ across })}
          options={[
            { value: 'none', label: m.seed.acrossNone },
            { value: 'low', label: m.seed.acrossLow },
            { value: 'medium', label: m.seed.acrossMedium },
            { value: 'high', label: m.seed.acrossHigh },
          ]}
        />
        {draft.facing !== 'open' && (
          <SwitchField
            label={m.seed.covered}
            checked={draft.covered}
            onCheckedChange={(covered) => set({ covered })}
          />
        )}
        {draft.facing !== 'open' && draft.covered && (
          <NumberInput
            label={m.sun.overhangAngle}
            value={draft.overhangDeg}
            onValueChange={(v) => set({ overhangDeg: Math.min(85, Math.max(5, v ?? 50)) })}
            min={5}
            max={85}
            step={5}
            unit="°"
            description={m.sun.overhangHint}
          />
        )}
      </div>
    </div>
  );
}

function HorizonFields({ draft, set }: { draft: SunDraft; set: (patch: Partial<SunDraft>) => void }) {
  const m = usePlanT();
  const update = (id: number, patch: Partial<Obstacle>) =>
    set({ obstacles: draft.obstacles.map((o) => (o.id === id ? { ...o, ...patch } : o)) });
  return (
    <div className="flex flex-col gap-4">
      <p className="text-body-s text-muted">{m.sun.obstacleHint}</p>
      <ul className="flex flex-col gap-3">
        {draft.obstacles.map((o, i) => (
          <li key={o.id}>
            <Card variant="sunken" padding="sm" className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3">
                <NumberInput
                  label={m.sun.from}
                  value={o.from}
                  onValueChange={(v) => update(o.id, { from: (v ?? 0) % 360 })}
                  min={0}
                  max={359}
                  step={5}
                  unit="°"
                />
                <NumberInput
                  label={m.sun.to}
                  value={o.to}
                  onValueChange={(v) => update(o.id, { to: (v ?? 0) % 360 })}
                  min={0}
                  max={359}
                  step={5}
                  unit="°"
                />
                <NumberInput
                  label={m.sun.height}
                  value={o.heightM}
                  onValueChange={(v) => update(o.id, { heightM: v })}
                  min={0}
                  max={500}
                  step={1}
                  unit="m"
                />
                <NumberInput
                  label={m.sun.distance}
                  value={o.distanceM}
                  onValueChange={(v) => update(o.id, { distanceM: v })}
                  min={0}
                  max={2000}
                  step={1}
                  unit="m"
                />
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-caption text-muted">
                  {o.heightM !== null && o.distanceM !== null
                    ? m.sun.elevation(obstacleElevation(o.heightM, o.distanceM).toFixed(0))
                    : ''}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => set({ obstacles: draft.obstacles.filter((x) => x.id !== o.id) })}
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                  {m.sun.remove}
                  <span className="sr-only"> {i + 1}</span>
                </Button>
              </div>
            </Card>
          </li>
        ))}
      </ul>
      <Button
        variant="secondary"
        size="sm"
        className="self-start"
        onClick={() =>
          set({
            obstacles: [
              ...draft.obstacles,
              { id: Date.now(), from: 225, to: 315, heightM: 10, distanceM: 10 },
            ],
          })
        }
      >
        <Plus className="size-4" aria-hidden="true" />
        {m.sun.addObstacle}
      </Button>
      <CompassPicker
        legend={m.seed.facing}
        openLabel={m.seed.openAllRound}
        value={draft.facing}
        onChange={(facing) => set({ facing })}
      />
      {draft.facing !== 'open' && (
        <SwitchField
          label={m.sun.overhang}
          checked={draft.covered}
          onCheckedChange={(covered) => set({ covered })}
        />
      )}
      {draft.facing !== 'open' && draft.covered && (
        <NumberInput
          label={m.sun.overhangAngle}
          value={draft.overhangDeg}
          onValueChange={(v) => set({ overhangDeg: Math.min(85, Math.max(5, v ?? 50)) })}
          min={5}
          max={85}
          step={5}
          unit="°"
          description={m.sun.overhangHint}
        />
      )}
    </div>
  );
}

function QuickFields({ draft, set }: { draft: SunDraft; set: (patch: Partial<SunDraft>) => void }) {
  const m = usePlanT();
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <NumberInput
        label={m.sun.summer}
        value={draft.summerHours}
        onValueChange={(v) => set({ summerHours: v === null ? null : Math.min(16, Math.max(0, v)) })}
        min={0}
        max={16}
        step={0.5}
        unit="h"
        description={m.sun.hoursOfSun}
      />
      <NumberInput
        label={m.sun.winter}
        value={draft.winterHours}
        onValueChange={(v) => set({ winterHours: v === null ? null : Math.min(16, Math.max(0, v)) })}
        min={0}
        max={16}
        step={0.5}
        unit="h"
        description={m.sun.hoursOfSun}
      />
    </div>
  );
}

/** Full Sun Hours Finder (§6.2): three ways in, a sun path dome, monthly bars and a light class. */
export function SunFinder({
  base,
  hemisphere,
  initial,
  onSave,
  saving,
}: {
  base: SunBase | null;
  hemisphere: 'north' | 'south';
  initial: ZoneSun | null;
  onSave: (sun: ZoneSun) => void;
  saving: boolean;
}) {
  const m = usePlanT();
  const [draft, setDraft] = useState<SunDraft>(() => ({
    ...draftFrom(initial),
    mode: base ? draftFrom(initial).mode : 'quick',
  }));
  const set = (patch: Partial<SunDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const year = new Date().getFullYear();
  // `computedAt` is stamped when the profile is saved.
  const result = useMemo(() => computeSun(draft, base, hemisphere, year, 0), [draft, base, hemisphere, year]);
  const hours = result.sun?.monthlyHours ?? null;
  const mean = hours ? hours.reduce((a, b) => a + b, 0) / 12 : null;
  const summary =
    hours && mean !== null
      ? `${m.seed.estimateRange(Math.min(...hours).toFixed(1), Math.max(...hours).toFixed(1))}. ${m.sun.classes[lightClass(mean)]}.`
      : '';

  const fields = (mode: SunDraft['mode']) =>
    mode === 'facing' ? (
      base ? (
        <FacingFields draft={draft} set={set} />
      ) : (
        <Notice tone="info">{m.sun.needLocation}</Notice>
      )
    ) : mode === 'horizon' ? (
      base ? (
        <HorizonFields draft={draft} set={set} />
      ) : (
        <Notice tone="info">{m.sun.needLocation}</Notice>
      )
    ) : (
      <QuickFields draft={draft} set={set} />
    );

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
      <Tabs
        label={m.sun.title}
        value={draft.mode}
        onValueChange={(mode) => set({ mode })}
        items={(['facing', 'quick', 'horizon'] as const).map((v) => ({
          value: v,
          label: m.sun.modes[v],
          content: fields(v),
        }))}
      />
      <div className="flex flex-col gap-5">
        {result.spot && <SunPathDome spot={result.spot} year={year} summary={summary} />}
        {hours && mean !== null ? (
          <>
            <div className="flex items-center gap-2" aria-live="polite">
              <Sun className="size-5 text-pollen-700" aria-hidden="true" />
              <p className="text-body font-semibold text-ink" data-testid="sun-summary">
                {m.sun.classes[lightClass(mean)]} · {m.seed.estimate(mean.toFixed(1))}
              </p>
            </div>
            <MonthlyBars hours={hours} />
          </>
        ) : null}
        <p className="text-caption text-muted">
          {m.sun.honesty} {m.sun.classSource}
        </p>
        <Button
          onClick={() => result.sun && onSave({ ...result.sun, computedAt: Date.now() })}
          disabled={!result.sun || saving}
        >
          {m.sun.save}
        </Button>
      </div>
    </div>
  );
}
