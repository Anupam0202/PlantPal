import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import {
  buildStarterSet,
  deviceTimeZone,
  GOALS,
  lightClass,
  rankCandidates,
  type Goal,
  type IndoorLightLevel,
} from '@plantpal/domain';
import type { GardenProfile, Zone, ZoneKind, ZoneSun } from '@plantpal/schemas';
import {
  Button,
  buttonClasses,
  Card,
  Chip,
  Notice,
  NumberInput,
  SeedlingIllustration,
  SelectField,
  Spinner,
  Sprout,
  SproutProgress,
} from '@plantpal/ui';
import { ArrowLeft } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { saveSeedPlan, type ZoneInput } from '../data/commands';
import { useClimateProfile } from '../env/hooks';
import { LocationField, type LocationValue } from '../features/garden/LocationField';
import { ClimateQuestions, EMPTY_MANUAL } from '../features/plan/ClimateQuestions';
import {
  CATALOG_TAXA,
  CATALOG_VERSION,
  climateFactsOf,
  contextOf,
  ENGINE_VERSION,
  inputsHash,
  planItemsOf,
} from '../features/plan/engine';
import { Matches } from '../features/plan/Matches';
import { usePlanT } from '../features/plan/messages';
import { RadioChips } from '../features/plan/RadioChips';
import { monthIn } from '../features/plan/usePlanContext';
import { computeSun, draftFrom, FacingFields, type SunDraft } from '../features/sun/SunFinder';
import { localeNames } from '../i18n';
import { usePrefs, type LocalePref } from '../state/prefs';

const STEPS = ['intro', 'space', 'location', 'light', 'size', 'goals', 'matches', 'done'] as const;
type Step = (typeof STEPS)[number];

export const Route = createFileRoute('/welcome')({
  validateSearch: (s: Record<string, unknown>): { step?: Step } =>
    typeof s.step === 'string' && (STEPS as readonly string[]).includes(s.step)
      ? { step: s.step as Step }
      : {},
  component: Seed,
});

const SPACES = ['balcony', 'rooftop', 'indoor', 'courtyard', 'yard', 'plot'] as const;
type Space = (typeof SPACES)[number] | 'other';
const KIND: Record<Space, ZoneKind> = {
  balcony: 'balcony',
  rooftop: 'rooftop',
  indoor: 'indoor',
  courtyard: 'courtyard',
  yard: 'yard',
  plot: 'community-plot',
  other: 'other',
};
const OPEN_SPACES: readonly Space[] = ['rooftop', 'yard', 'plot', 'other'];

type LightPick = 'full-sun' | 'part-sun' | 'part-shade' | 'shade' | 'none';
type SeedZone = ZoneInput & Pick<Zone, 'sun' | 'indoorLight' | 'clearanceCm' | 'maxContainerL'>;

const PICK_HOURS: Record<LightPick, number> = {
  'full-sun': 7,
  'part-sun': 4.5,
  'part-shade': 2,
  shade: 0.5,
  none: 0,
};

interface SpaceLight {
  mode: 'facing' | 'class' | 'unsure';
  sun: SunDraft;
  pick: LightPick | null;
  window: IndoorLightLevel | null;
}

interface Draft {
  spaces: Space[];
  location: LocationValue | null;
  hemisphere: 'north' | 'south' | null;
  manual: NonNullable<GardenProfile['manualClimate']>;
  light: Partial<Record<Space, SpaceLight>>;
  areaM2: number | null;
  maxPotL: '5' | '20' | '50' | '150' | null;
  water: 'tap' | 'carry' | 'rain' | null;
  minutes: '15' | '30' | '60' | '120' | null;
  household: { cats: boolean; dogs: boolean; children: boolean };
  goals: Goal[];
}

const EMPTY: Draft = {
  spaces: [],
  location: null,
  hemisphere: null,
  manual: EMPTY_MANUAL,
  light: {},
  areaM2: null,
  maxPotL: null,
  water: null,
  minutes: null,
  household: { cats: false, dogs: false, children: false },
  goals: [],
};

const defaultLight = (space: Space, hasLocation: boolean): SpaceLight => ({
  mode: space === 'indoor' ? 'class' : hasLocation ? 'facing' : 'class',
  sun: {
    ...draftFrom(null),
    facing: OPEN_SPACES.includes(space) ? 'open' : 'S',
    covered: space === 'balcony',
  },
  pick: null,
  window: null,
});

function Seed() {
  const m = usePlanT();
  const navigate = useNavigate();
  const { step = 'intro' } = Route.useSearch();
  const prefs = usePrefs();
  const [d, setD] = useState<Draft>(EMPTY);
  const [zoneIdx, setZoneIdx] = useState(0);
  const [chosen, setChosen] = useState<Record<number, Set<string>>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }));
  // Each step announces itself: focus moves to its heading (WCAG 2.4.3).
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (step !== 'intro') headingRef.current?.focus({ preventScroll: false });
  }, [step]);
  const go = (s: Step) => void navigate({ to: '/welcome', search: s === 'intro' ? {} : { step: s } });

  const year = new Date().getFullYear();
  const timeZone = d.location?.timezone ?? deviceTimeZone();
  const base = useMemo(
    () => (d.location ? { lat: d.location.lat, lon: d.location.lon, timeZone } : null),
    [d.location, timeZone],
  );
  const hemisphere: 'north' | 'south' = d.location
    ? d.location.lat < 0
      ? 'south'
      : 'north'
    : (d.hemisphere ?? 'north');
  const spaces = useMemo<Space[]>(() => (d.spaces.length > 0 ? d.spaces : ['other']), [d.spaces]);
  const lightOf = (s: Space) => d.light[s] ?? defaultLight(s, base !== null);

  // Climate refines matches as it arrives; the manual answers cover outages and skipped locations.
  const climateQuery = useClimateProfile(base ? { lat: base.lat, lon: base.lon } : null);
  const measured = climateQuery.data && climateQuery.data.extremeMinC !== null ? climateQuery.data : null;
  const climateFailed =
    base !== null && (climateQuery.isError || (climateQuery.data !== undefined && !measured));

  // `computedAt` is stamped at save time; the memo stays pure.
  const zones = useMemo(() => {
    const now = 0;
    return spaces.map((s): SeedZone => {
      const l = d.light[s] ?? defaultLight(s, base !== null);
      let sun: ZoneSun | null = null;
      let indoorLight: IndoorLightLevel | null = null;
      if (s === 'indoor') indoorLight = l.mode === 'class' ? l.window : null;
      else if (l.mode === 'facing')
        sun = computeSun({ ...l.sun, mode: 'facing' }, base, hemisphere, year, now).sun;
      else if (l.mode === 'class' && l.pick)
        sun = {
          method: 'class',
          facingDeg: null,
          overhangDeg: null,
          across: null,
          horizon: null,
          quick: null,
          monthlyHours: new Array<number>(12).fill(PICK_HOURS[l.pick]),
          year,
          computedAt: now,
        };
      const mean = sun ? sun.monthlyHours.reduce((a, b) => a + b, 0) / 12 : null;
      return {
        name: m.seed.spaces[s],
        kind: KIND[s],
        covered:
          s === 'indoor' ? true : l.mode === 'facing' && l.sun.facing !== 'open' ? l.sun.covered : null,
        areaM2: d.areaM2,
        orientationDeg: sun?.facingDeg != null ? Math.round(sun.facingDeg) % 360 : null,
        light: mean === null ? null : lightClass(mean),
        wind: null,
        drainage: null,
        notes: '',
        sun,
        indoorLight,
        clearanceCm: null,
        maxContainerL: d.maxPotL === null || d.maxPotL === '150' ? null : Number(d.maxPotL),
      };
    });
  }, [spaces, d.light, d.areaM2, d.maxPotL, base, hemisphere, year, m]);

  const profile: GardenProfile = {
    household: d.household,
    showToxicWithWarning: false,
    goals: d.goals,
    minutesPerWeek: d.minutes === null ? null : Number(d.minutes),
    waterAccess: d.water,
    budget: null,
    manualClimate: d.manual,
  };
  const region = d.location?.countryCode
    ? { countryCode: d.location.countryCode, admin1: d.location.admin1 ?? null, l3: null }
    : null;

  const contexts = useMemo(
    () =>
      zones.map((z) =>
        contextOf({
          normals: measured?.months ?? null,
          lat: base?.lat ?? (hemisphere === 'south' ? -30 : null),
          region,
          profile,
          zone: z,
          climate: climateFactsOf(measured, d.manual),
          month: monthIn(timeZone),
        }),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      zones,
      base?.lat,
      hemisphere,
      region?.countryCode,
      measured,
      d.manual,
      d.household,
      d.goals,
      d.water,
      d.minutes,
      timeZone,
    ],
  );
  const ranked = useMemo(() => contexts.map((c) => rankCandidates(CATALOG_TAXA, c)), [contexts]);
  const suggested = useMemo(
    () =>
      ranked.map(
        (r, i) => new Set(buildStarterSet(r, CATALOG_TAXA, { size: i === 0 ? 6 : 3, goals: d.goals })),
      ),
    [ranked, d.goals],
  );
  const selectionFor = (i: number) => chosen[i] ?? suggested[i] ?? new Set<string>();
  const totalChosen = ranked.reduce((n, _r, i) => n + selectionFor(i).size, 0);

  const save = async () => {
    setSaving(true);
    setSaveError(false);
    try {
      await saveSeedPlan({
        garden: {
          name: m.seed.gardenName,
          timezone: timeZone,
          hemisphere,
          place: d.location ? { label: d.location.label, lat: d.location.lat, lon: d.location.lon } : null,
          notes: '',
          region,
          profile,
        },
        zones: zones.map((z) => (z.sun ? { ...z, sun: { ...z.sun, computedAt: Date.now() } } : z)),
        plan: {
          name: m.seed.matchesTitle,
          catalogVersion: CATALOG_VERSION,
          engineVersion: ENGINE_VERSION,
          inputsHash: inputsHash({
            ...(contexts[0] ??
              contextOf({
                lat: null,
                region,
                profile,
                zone: zones[0]!,
                climate: climateFactsOf(null, d.manual),
                month: 0,
              })),
            month: 0,
          }),
        },
        items: ranked.flatMap((r, i) => planItemsOf(r, selectionFor(i), i)),
      });
      go('done');
    } catch (e) {
      console.error(e);
      setSaveError(true);
    } finally {
      setSaving(false);
    }
  };

  const index = STEPS.indexOf(step);
  const progress = Math.max(0, Math.min(6, index));

  const nav = (next: Step | null, opts: { skip?: Step; disabled?: boolean } = {}) => (
    <div className="mt-8 flex flex-wrap items-center gap-3">
      <Button variant="ghost" onClick={() => go(STEPS[Math.max(0, index - 1)] ?? 'intro')}>
        <ArrowLeft className="size-4" aria-hidden="true" />
        {m.seed.back}
      </Button>
      <span className="flex-1" />
      {opts.skip && (
        <Button variant="ghost" onClick={() => go(opts.skip!)}>
          {m.seed.skip}
        </Button>
      )}
      {next && (
        <Button onClick={() => go(next)} disabled={opts.disabled}>
          {m.seed.next}
        </Button>
      )}
    </div>
  );

  const shell = (title: string, body: string | null, content: React.ReactNode) => (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-4 py-6 sm:px-6 sm:py-10">
      <SproutProgress step={progress} total={6} label={m.seed.progress} className="mb-8" />
      <h1 ref={headingRef} tabIndex={-1} className="text-h1 text-balance text-ink outline-none">
        {title}
      </h1>
      {body && <p className="mt-2 text-body text-muted text-pretty">{body}</p>}
      <div className="mt-6 flex flex-col gap-6">{content}</div>
    </div>
  );

  if (step === 'intro') {
    return (
      <div className="grain mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-8 px-6 py-12">
        <div className="text-accent-ink">
          <SeedlingIllustration size={140} />
        </div>
        <div className="flex flex-col gap-4">
          <h1 className="text-display-l text-balance text-ink">{m.seed.introTitle}</h1>
          <p className="text-body text-muted text-pretty">{m.seed.introBody}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button size="lg" onClick={() => go('space')}>
            {m.seed.start}
          </Button>
          <Link to="/settings/data" className={buttonClasses('secondary', 'lg')}>
            {m.seed.importData}
          </Link>
        </div>
        <div className="flex flex-wrap items-end gap-4">
          <SelectField
            label={m.seed.language}
            className="w-48"
            value={prefs.locale}
            onValueChange={(locale: LocalePref) => prefs.set({ locale })}
            options={(Object.keys(localeNames) as LocalePref[]).map((l) => ({
              value: l,
              label: localeNames[l],
            }))}
          />
          <Link to="/garden/new" className="pb-2.5 text-body-s text-muted underline">
            {m.seed.addGardenOnly}
          </Link>
        </div>
      </div>
    );
  }

  if (step === 'space') {
    return shell(
      m.seed.spaceTitle,
      m.seed.spaceBody,
      <>
        <div className="flex flex-wrap gap-2">
          {SPACES.map((s) => (
            <Chip
              key={s}
              pressed={d.spaces.includes(s)}
              onPressedChange={(on) =>
                set({ spaces: on ? [...d.spaces, s] : d.spaces.filter((x) => x !== s) })
              }
            >
              {m.seed.spaces[s]}
            </Chip>
          ))}
        </div>
        {nav('location', { skip: 'location', disabled: d.spaces.length === 0 })}
      </>,
    );
  }

  if (step === 'location') {
    return shell(
      m.seed.locationTitle,
      m.seed.locationBody,
      <>
        <LocationField value={d.location} onChange={(location) => set({ location })} />
        {!d.location && (
          <Card variant="sunken" className="flex flex-col gap-4">
            <h2 className="text-body font-semibold text-ink">{m.seed.manualTitle}</h2>
            <RadioChips
              legend={m.seed.hemisphere}
              value={d.hemisphere}
              onChange={(hemisphere) => set({ hemisphere })}
              options={[
                { value: 'north', label: m.seed.north },
                { value: 'south', label: m.seed.south },
              ]}
            />
            <ClimateQuestions value={d.manual} onChange={(manual) => set({ manual })} />
          </Card>
        )}
        {nav('light', { skip: 'light' })}
      </>,
    );
  }

  if (step === 'light') {
    return shell(
      m.seed.lightTitle,
      m.seed.lightBody,
      <>
        {spaces.map((s) => {
          const l = lightOf(s);
          const setL = (patch: Partial<SpaceLight>) =>
            set({ light: { ...d.light, [s]: { ...l, ...patch } } });
          const z = zones[spaces.indexOf(s)];
          const hours = z?.sun?.monthlyHours ?? null;
          return (
            <Card key={s} className="flex flex-col gap-4" data-testid={`light-${s}`}>
              <h2 className="text-h3 text-ink">{m.seed.lightFor(m.seed.spaces[s])}</h2>
              {s === 'indoor' ? (
                <RadioChips
                  legend={m.seed.window}
                  value={l.mode === 'unsure' ? 'unsure' : l.window}
                  onChange={(v) =>
                    v === 'unsure'
                      ? setL({ mode: 'unsure', window: null })
                      : setL({ mode: 'class', window: v })
                  }
                  options={[
                    ...(['bright-direct', 'bright-indirect', 'medium', 'low'] as const).map((v) => ({
                      value: v,
                      label: m.seed.windows[v],
                    })),
                    { value: 'unsure' as const, label: m.seed.notSure },
                  ]}
                />
              ) : (
                <>
                  <RadioChips
                    legend={m.seed.lightTitle}
                    value={l.mode}
                    onChange={(mode) => setL({ mode })}
                    options={[
                      ...(base ? [{ value: 'facing' as const, label: m.seed.lightModeFacing }] : []),
                      { value: 'class' as const, label: m.seed.lightModeClass },
                      { value: 'unsure' as const, label: m.seed.notSure },
                    ]}
                    hint={base ? null : m.seed.needsLocation}
                  />
                  {l.mode === 'facing' && base && (
                    <FacingFields
                      draft={l.sun}
                      set={(patch) => setL({ sun: { ...l.sun, ...patch } })}
                      allowOpen
                    />
                  )}
                  {l.mode === 'class' && (
                    <RadioChips
                      legend={m.seed.lightModeClass}
                      value={l.pick}
                      onChange={(pick) => setL({ pick })}
                      options={(['full-sun', 'part-sun', 'part-shade', 'shade', 'none'] as const).map(
                        (v) => ({
                          value: v,
                          label: m.seed.classes[v],
                        }),
                      )}
                    />
                  )}
                  {hours && (
                    <p
                      className="text-body-s font-medium text-ink"
                      aria-live="polite"
                      data-testid="light-estimate"
                    >
                      {m.seed.estimate((hours.reduce((a, b) => a + b, 0) / 12).toFixed(1))} ·{' '}
                      {m.seed.estimateRange(Math.min(...hours).toFixed(1), Math.max(...hours).toFixed(1))}
                    </p>
                  )}
                  <p className="text-caption text-muted">{m.seed.measureLater}</p>
                </>
              )}
            </Card>
          );
        })}
        {nav('size')}
      </>,
    );
  }

  if (step === 'size') {
    return shell(
      m.seed.sizeTitle,
      m.seed.sizeBody,
      <>
        <NumberInput
          label={m.seed.area}
          value={d.areaM2}
          onValueChange={(areaM2) => set({ areaM2 })}
          min={0}
          max={10_000}
          step={0.5}
          unit="m²"
          className="max-w-xs"
        />
        <RadioChips
          legend={m.seed.pot}
          value={d.maxPotL}
          onChange={(maxPotL) => set({ maxPotL })}
          options={(['5', '20', '50', '150'] as const).map((v) => ({ value: v, label: m.seed.pots[v] }))}
        />
        <RadioChips
          legend={m.seed.water}
          value={d.water}
          onChange={(water) => set({ water })}
          options={(['tap', 'carry', 'rain'] as const).map((v) => ({ value: v, label: m.seed.waters[v] }))}
        />
        <RadioChips
          legend={m.seed.minutes}
          value={d.minutes}
          onChange={(minutes) => set({ minutes })}
          options={(['15', '30', '60', '120'] as const).map((v) => ({
            value: v,
            label: m.seed.minutesOptions[v],
          }))}
        />
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-body-s font-medium text-ink">{m.seed.household}</legend>
          <div className="flex flex-wrap gap-2">
            {(['cats', 'dogs', 'children'] as const).map((k) => (
              <Chip
                key={k}
                pressed={d.household[k]}
                onPressedChange={(on) => set({ household: { ...d.household, [k]: on } })}
              >
                {m.seed[k]}
              </Chip>
            ))}
          </div>
          <p className="text-caption text-muted">{m.seed.householdHint}</p>
        </fieldset>
        {nav('goals', { skip: 'goals' })}
      </>,
    );
  }

  if (step === 'goals') {
    return shell(
      m.seed.goalsTitle,
      m.seed.goalsBody,
      <>
        <div className="flex flex-wrap gap-2">
          {GOALS.map((g) => (
            <Chip
              key={g}
              pressed={d.goals.includes(g)}
              disabled={!d.goals.includes(g) && d.goals.length >= 3}
              onPressedChange={(on) => set({ goals: on ? [...d.goals, g] : d.goals.filter((x) => x !== g) })}
            >
              {m.seed.goals[g]}
            </Chip>
          ))}
        </div>
        {nav('matches', { skip: 'matches' })}
      </>,
    );
  }

  if (step === 'matches') {
    const i = Math.min(zoneIdx, ranked.length - 1);
    const candidates = ranked[i] ?? [];
    return shell(
      m.seed.matchesTitle,
      m.seed.matchesBody,
      <>
        {base && !measured && !climateFailed && (
          <p className="flex items-center gap-2 text-body-s text-muted" aria-live="polite">
            <Spinner /> {m.seed.climateLoading}
          </p>
        )}
        {measured && (
          <p className="text-body-s text-accent-ink" aria-live="polite">
            {m.seed.climateUpdated}
          </p>
        )}
        {(climateFailed || !base) && !d.manual.frost && (
          <Notice tone="info" title={m.seed.manualTitle}>
            <p className="mb-3">{m.seed.climateFailed}</p>
            <ClimateQuestions value={d.manual} onChange={(manual) => set({ manual })} />
          </Notice>
        )}
        {spaces.length > 1 && (
          <SelectField
            label={m.seed.zoneLabel}
            className="max-w-xs"
            value={String(i)}
            onValueChange={(v) => setZoneIdx(Number(v))}
            options={spaces.map((s, k) => ({ value: String(k), label: m.seed.spaces[s] }))}
          />
        )}
        <Matches
          candidates={candidates}
          chosen={selectionFor(i)}
          onToggle={(id, on) => {
            const next = new Set(selectionFor(i));
            if (on) next.add(id);
            else next.delete(id);
            setChosen((c) => ({ ...c, [i]: next }));
          }}
        />
        {saveError && <Notice tone="danger">{m.seed.saveFailed}</Notice>}
        <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center gap-3 border-t border-line bg-bg/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
          <Button variant="ghost" onClick={() => go('goals')}>
            <ArrowLeft className="size-4" aria-hidden="true" />
            {m.seed.back}
          </Button>
          <span className="flex-1 text-body-s text-muted">{m.plan.starterSet(totalChosen)}</span>
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? <Spinner /> : null}
            {totalChosen > 0 ? (saving ? m.seed.saving : m.seed.save) : m.seed.saveWithout}
          </Button>
        </div>
      </>,
    );
  }

  // done
  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col items-center justify-center gap-6 px-6 py-12 text-center">
      <Sprout size={96} playKey="done" className="text-accent" label={m.seed.savedTitle} />
      <h1 ref={headingRef} tabIndex={-1} className="text-h1 text-ink outline-none">
        {m.seed.savedTitle}
      </h1>
      <p className="text-body text-muted">{m.seed.savedBody}</p>
      <Link to="/today" className={buttonClasses('primary', 'lg')}>
        {m.seed.goToday}
      </Link>
    </div>
  );
}
