import type { PlainExplainInput } from '@plantpal/ai';
import type { ClimateProfile, PlainExplanation } from '@plantpal/schemas';
import { Badge, Card } from '@plantpal/ui';
import { Sparkles } from 'lucide-react';
import { AiButton, AiFlow } from '../../ai/AiButton';
import { useAiT } from '../../ai/messages';
import { useAiAction } from '../../ai/useAiAction';
import { usePrefs } from '../../state/prefs';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** The figures on the Climate Fit page as one plain passage (the only thing sent). */
export function climatePassage(p: ClimateProfile, model: string | null): string {
  const r = (v: number | null, u: string) => (v === null ? 'unknown' : `${Math.round(v * 10) / 10} ${u}`);
  const lines = [
    `Climate Fit for this garden, from ${p.years} years of measurements (${p.period}).`,
    `Coldest night in a typical year: ${r(p.extremeMinC, '°C')}.`,
    p.seasonDays === 365 || !p.frost?.lastSpring
      ? 'Frost is rare.'
      : `About ${p.seasonDays ?? 'unknown'} frost-free days a year. Last spring frost: half of years by ${p.frost.lastSpring.p50}, 9 in 10 years by ${p.frost.lastSpring.p90}.`,
    p.hotDaysPerYear !== null ? `Days at or above 35 °C per year: ${p.hotDaysPerYear}.` : null,
    p.koppen ? `Köppen climate class: ${p.koppen}.` : null,
    model ? `Season pattern: ${model}.` : null,
    'Monthly normals (max / min / rain): ' +
      p.months
        .map((m, i) => `${MONTHS[i]} ${r(m.tmaxC, '°C')} / ${r(m.tminC, '°C')} / ${r(m.precipMm, 'mm')}`)
        .join('; ') +
      '.',
  ];
  return lines.filter(Boolean).join('\n');
}

/** F12 plain-language explainer for the Climate Fit figures. */
export function ClimatePlain({ profile, model }: { profile: ClimateProfile; model: string | null }) {
  const t = useAiT();
  const locale = usePrefs((s) => s.locale);
  const units = usePrefs((s) => s.units);
  const ai = useAiAction<PlainExplainInput, PlainExplanation>('plain-explain', () => ({
    policy: { locale, units, seasonModel: model ?? 'unknown' },
    topic: 'Climate Fit for this garden',
    passage: climatePassage(profile, model),
    readingLevel: 'simple',
  }));
  const r = ai.result;
  return (
    <div className="flex flex-col gap-3">
      <div>
        <AiButton ai={ai} label={t.plain.button} />
      </div>
      <AiFlow ai={ai} fallback={t.plain.fallback} />
      {r && (
        <Card className="flex flex-col gap-3" data-testid="plain-explanation">
          <h3 className="flex items-center gap-2 font-semibold text-ink">
            <Sparkles className="size-4 text-accent-ink" aria-hidden="true" />
            {t.plain.title}
            <Badge>{t.suggestedByAi}</Badge>
          </h3>
          <p className="text-body text-ink">{r.plain}</p>
          {r.terms.length > 0 && (
            <div>
              <p className="text-caption font-medium text-muted">{t.plain.terms}</p>
              <dl className="mt-1 grid gap-1 text-body-s">
                {r.terms.map((x) => (
                  <div key={x.term}>
                    <dt className="inline font-medium text-ink">{x.term}: </dt>
                    <dd className="inline text-muted">{x.meaning}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
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
        </Card>
      )}
    </div>
  );
}
