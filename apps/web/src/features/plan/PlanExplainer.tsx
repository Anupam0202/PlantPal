import type { PlanExplainInput } from '@plantpal/ai';
import { seasonModel, type Candidate, type EligibilityContext } from '@plantpal/domain';
import type { Garden, PlanExplanation, Zone } from '@plantpal/schemas';
import { Badge, Card } from '@plantpal/ui';
import { Sparkles } from 'lucide-react';
import { AiButton, AiFlow } from '../../ai/AiButton';
import { useAiT } from '../../ai/messages';
import { useAiAction } from '../../ai/useAiAction';
import { useClimateProfile } from '../../env/hooks';
import { usePrefs } from '../../state/prefs';
import { reasonText, taxonById, taxonName } from './engine';
import { usePlanT } from './messages';

const norm = (s: string) => s.toLowerCase().split(/\s+/).slice(0, 2).join(' ');

/** Plain-English facts for the model; the model answers in the person's language. */
export function climateLine(ctx: EligibilityContext): string | null {
  const c = ctx.climate;
  if (c.extremeMinC === null && c.hotSummers === null) return null;
  const parts = [
    c.extremeMinC !== null
      ? `Coldest night in a typical year about ${Math.round(c.extremeMinC)} °C (${c.basis ?? 'unknown'} basis).`
      : null,
    c.seasonDays !== null
      ? c.seasonDays >= 365
        ? 'Frost is rare.'
        : `About ${c.seasonDays} frost-free days a year.`
      : null,
    c.hotSummers === null
      ? null
      : c.hotSummers
        ? 'Hot summers (many days above 35 °C).'
        : 'Summers rarely above 35 °C.',
  ];
  return parts.filter(Boolean).join(' ');
}

export function spaceLine(zone: Pick<Zone, 'name' | 'kind'>, ctx: EligibilityContext): string {
  const z = ctx.zone;
  const hours = z.sunMonthly?.[ctx.month];
  const light =
    hours !== undefined && hours !== null
      ? `about ${Math.round(hours * 10) / 10} h direct sun this month`
      : z.indoorLight
        ? `indoor light: ${z.indoorLight}`
        : 'light not measured yet';
  return [
    `${zone.name} (${zone.kind}): ${light}`,
    z.covered ? 'covered above, so rain does not reach it' : null,
    z.containers ? 'plants in containers' : 'in the ground',
  ]
    .filter(Boolean)
    .join('; ');
}

export function householdLine(ctx: EligibilityContext): string | null {
  const h = ctx.household;
  if (!h) return null;
  const who = [h.cats && 'cats', h.dogs && 'dogs', h.children && 'young children'].filter(Boolean);
  return who.length ? `Household includes ${who.join(', ')}.` : 'No pets or young children.';
}

/** F1 Plan Explainer & Expander on the Plan page (§18.5). */
export function PlanExplainer({
  garden,
  zone,
  ctx,
  candidates,
  selection,
}: {
  garden: Pick<Garden, 'place' | 'hemisphere'> & { profile: Garden['profile'] };
  zone: Pick<Zone, 'name' | 'kind'>;
  ctx: EligibilityContext | null;
  candidates: readonly Candidate[];
  selection: ReadonlySet<string>;
}) {
  const t = useAiT();
  const m = usePlanT();
  const locale = usePrefs((s) => s.locale);
  const units = usePrefs((s) => s.units);
  const lat = garden.place?.lat ?? null;
  const lon = garden.place?.lon ?? null;
  const profile = useClimateProfile(lat !== null && lon !== null ? { lat, lon } : null).data;
  const chosen = candidates.filter((c) => selection.has(c.taxonId) && c.status !== 'EXCLUDED').slice(0, 12);

  const ai = useAiAction<PlanExplainInput, PlanExplanation>('plan-explain', () => {
    if (!ctx || chosen.length === 0) return null;
    const model =
      seasonModel(profile?.koppen ?? null, {
        lat,
        lon,
        monsoon: garden.profile?.manualClimate?.monsoon ?? null,
      }) ?? 'unknown';
    const hemisphere = garden.hemisphere ?? ((lat ?? 1) < 0 ? 'south' : 'north');
    return {
      policy: { locale, units, seasonModel: `${model}, ${hemisphere}ern hemisphere` },
      place: garden.place?.label ?? null,
      climate: climateLine(ctx),
      spaces: [spaceLine(zone, ctx)],
      household: householdLine(ctx),
      goals: ctx.goals,
      candidates: chosen.flatMap((c) => {
        const tx = taxonById(c.taxonId);
        if (!tx) return [];
        const text = (outcomes: string[]) =>
          c.findings.filter((f) => outcomes.includes(f.outcome)).map((f) => reasonText(f, m, locale));
        return [
          {
            taxonKey: c.taxonId,
            commonName: taxonName(tx, locale),
            scientificName: tx.scientificName,
            status: c.status === 'ELIGIBLE' ? 'ELIGIBLE' : 'NEEDS_INPUT',
            reasons: text(['pass']).slice(0, 4),
            warnings: text(['tradeoff', 'review', 'needs_input']).slice(0, 3),
          },
        ];
      }),
    };
  });

  if (chosen.length === 0) return null;
  const r = ai.result;
  // Extra suggestions only show when PlantPal's own rules find them eligible here (Appendix B).
  const extras = (r?.extraSuggestions ?? []).flatMap((x) => {
    const c = candidates.find((c) => {
      const tx = taxonById(c.taxonId);
      return tx && norm(tx.scientificName) === norm(x.scientificName);
    });
    return c && c.status === 'ELIGIBLE' && !selection.has(c.taxonId) ? [{ c, reason: x.reason }] : [];
  });
  const dropped = (r?.extraSuggestions.length ?? 0) - extras.length;

  return (
    <section aria-labelledby="ai-explain" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <AiButton ai={ai} label={t.explain.button} />
      </div>
      <AiFlow ai={ai} fallback={t.explain.fallback} />
      {r && (
        <Card className="flex flex-col gap-4" data-testid="plan-explanation">
          <h3 id="ai-explain" className="flex items-center gap-2 text-h3 text-ink">
            <Sparkles className="size-4 text-accent-ink" aria-hidden="true" />
            {t.explain.title}
            <Badge>{t.suggestedByAi}</Badge>
          </h3>
          <p className="text-body text-ink">{r.summary}</p>
          <ul className="flex flex-col gap-3">
            {r.perPlant.map((p) => {
              const tx = taxonById(p.taxonKey);
              return (
                <li key={p.taxonKey} className="rounded-md border border-line p-3 text-body-s">
                  <p className="font-semibold text-ink">{tx ? taxonName(tx, locale) : p.taxonKey}</p>
                  {(
                    [
                      [t.explain.whyItFits, p.whyItFits],
                      [t.explain.watchOuts, p.watchOuts],
                      [t.explain.firstSteps, p.firstSteps],
                    ] as const
                  ).map(([label, lines]) =>
                    lines.length ? (
                      <div key={label} className="mt-1">
                        <p className="text-caption font-medium text-muted">{label}</p>
                        <ul className="list-disc pl-5 text-ink">
                          {lines.map((l) => (
                            <li key={l}>{l}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null,
                  )}
                </li>
              );
            })}
          </ul>
          {extras.length > 0 && (
            <div>
              <p className="font-medium text-ink">{t.explain.extras}</p>
              <p className="text-caption text-muted">{t.explain.extrasNote}</p>
              <ul className="mt-1 flex flex-col gap-1 text-body-s">
                {extras.map(({ c, reason }) => {
                  const tx = taxonById(c.taxonId);
                  return (
                    <li key={c.taxonId}>
                      <span className="font-medium text-ink">{tx ? taxonName(tx, locale) : c.taxonId}</span>
                      <span className="text-muted"> · {reason}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          {dropped > 0 && <p className="text-caption text-muted">{t.explain.dropped(dropped)}</p>}
          {r.unknowns.length > 0 && (
            <div>
              <p className="text-caption font-medium text-muted">{t.unknowns}</p>
              <ul className="list-disc pl-5 text-body-s text-muted">
                {r.unknowns.map((u) => (
                  <li key={u}>{u}</li>
                ))}
              </ul>
            </div>
          )}
          <p className="text-caption text-muted">{t.noSources}</p>
        </Card>
      )}
    </section>
  );
}
