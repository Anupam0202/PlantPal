import type { Candidate, Goal } from '@plantpal/domain';
import { Badge, Button, Card, Chip, Section, Sheet, TaxonName } from '@plantpal/ui';
import {
  AlertTriangle,
  CalendarClock,
  ExternalLink,
  FileWarning,
  Info,
  Leaf,
  ShieldAlert,
} from 'lucide-react';
import { useState } from 'react';
import { usePrefs } from '../../state/prefs';
import { reasonText, sourceLabel, taxonById, taxonName } from './engine';
import { usePlanT } from './messages';

const INITIAL = 12;

function whyKeys(c: Candidate): Array<Goal | 'effort' | 'light'> {
  const parts = Object.entries(c.scoreParts) as Array<[Goal | 'effort' | 'light', number]>;
  const goals = parts.filter(([k, v]) => k !== 'effort' && k !== 'light' && v >= 0.6);
  const extras = parts.filter(([k, v]) => (k === 'effort' || k === 'light') && v >= 1);
  return [...goals, ...extras]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k]) => k);
}

function MatchCard({
  c,
  chosen,
  onToggle,
}: {
  c: Candidate;
  chosen: boolean;
  onToggle: (id: string, next: boolean) => void;
}) {
  const m = usePlanT();
  const locale = usePrefs((s) => s.locale);
  const t = taxonById(c.taxonId);
  if (!t) return null;
  const tradeoffs = c.findings.filter((f) => f.outcome === 'tradeoff' || f.outcome === 'review');
  const native = m.plan.natives[c.nativeStatus];
  return (
    <Card as="li" padding="sm" className="flex flex-col gap-2.5" data-testid="match" data-taxon={c.taxonId}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-body font-semibold text-ink">{taxonName(t, locale)}</h3>
          <TaxonName scientificName={t.scientificName} className="text-caption text-muted" />
        </div>
        {c.score !== null && (
          <span className="tabular shrink-0 text-caption text-muted" title={m.plan.score(c.score)}>
            {m.plan.score(c.score)}
          </span>
        )}
      </div>
      <ul className="flex flex-wrap gap-1.5" aria-label="Why">
        {whyKeys(c).map((k) => (
          <li key={k}>
            <Badge tone="accent" icon={<Leaf className="size-3" aria-hidden="true" />}>
              {m.plan.why[k]}
            </Badge>
          </li>
        ))}
        {native && c.nativeStatus === 'NATIVE' && !whyKeys(c).includes('native') && (
          <li>
            <Badge tone="accent">{native}</Badge>
          </li>
        )}
        <li>
          <Badge
            tone={c.timing.sowNow ? 'pollen' : 'neutral'}
            icon={<CalendarClock className="size-3" aria-hidden="true" />}
          >
            {c.timing.sowNow
              ? m.plan.plantNow
              : c.timing.nextMonth !== null
                ? m.plan.plantIn(
                    new Intl.DateTimeFormat(locale === 'hi' ? 'hi-IN' : locale, {
                      month: 'long',
                      timeZone: 'UTC',
                    }).format(new Date(Date.UTC(2026, c.timing.nextMonth, 15))),
                  )
                : m.plan.plantNow}
          </Badge>
        </li>
        {c.flags.includes('TOXIC_WARNING') && (
          <li>
            <Badge tone="danger" icon={<ShieldAlert className="size-3" aria-hidden="true" />}>
              {m.plan.toxicWarning}
            </Badge>
          </li>
        )}
        {c.flags.includes('NEEDS_REVIEW') && !c.flags.includes('TOXIC_WARNING') && (
          <li>
            <Badge tone="warning" icon={<AlertTriangle className="size-3" aria-hidden="true" />}>
              {m.plan.toxicityCheck}
            </Badge>
          </li>
        )}
      </ul>
      {tradeoffs.length > 0 && (
        <ul className="flex flex-col gap-1 text-caption text-muted">
          {tradeoffs.slice(0, 3).map((f, i) => (
            <li key={i} className="flex gap-1.5">
              <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              <span>{reasonText(f, m, locale)}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center justify-between gap-2">
        {c.flags.includes('DRAFT_TRAITS') ? (
          <span
            className="inline-flex items-center gap-1 text-caption text-subtle"
            title={m.plan.draftDataHint}
          >
            <FileWarning className="size-3.5" aria-hidden="true" />
            {m.plan.draftData}
          </span>
        ) : (
          <span />
        )}
        <Chip pressed={chosen} onPressedChange={(p) => onToggle(c.taxonId, p)}>
          {chosen ? m.plan.inSet : m.plan.addToSet}
          <span className="sr-only">: {taxonName(t, locale)}</span>
        </Chip>
      </div>
    </Card>
  );
}

/** Eligible matches with "why" chips, a needs-info list and an "excluded: see why" sheet (§6.1, §17.3). */
export function Matches({
  candidates,
  chosen,
  onToggle,
}: {
  candidates: readonly Candidate[];
  chosen: ReadonlySet<string>;
  onToggle: (id: string, next: boolean) => void;
}) {
  const m = usePlanT();
  const locale = usePrefs((s) => s.locale);
  const [all, setAll] = useState(false);
  const eligible = candidates.filter((c) => c.status === 'ELIGIBLE');
  const needs = candidates.filter((c) => c.status === 'NEEDS_INPUT');
  const excluded = candidates.filter((c) => c.status === 'EXCLUDED');
  const shown = all ? eligible : eligible.slice(0, INITIAL);

  return (
    <div className="flex flex-col gap-6">
      <Section
        title={m.plan.eligible(eligible.length)}
        headingLevel={3}
        action={
          excluded.length > 0 ? (
            <Sheet
              title={m.plan.excludedTitle}
              trigger={
                <Button variant="ghost" size="sm">
                  {m.plan.excluded(excluded.length)}
                </Button>
              }
            >
              <ul className="flex flex-col divide-y divide-line" aria-label={m.plan.excludedTitle}>
                {excluded.map((c) => {
                  const t = taxonById(c.taxonId);
                  if (!t) return null;
                  return (
                    <li
                      key={c.taxonId}
                      className="flex flex-col gap-1 py-3"
                      data-testid="excluded"
                      data-taxon={c.taxonId}
                    >
                      <p className="font-medium text-ink">
                        {taxonName(t, locale)}{' '}
                        <TaxonName scientificName={t.scientificName} className="text-caption text-muted" />
                      </p>
                      <ul className="flex flex-col gap-1">
                        {c.findings
                          .filter((f) => f.outcome === 'exclude')
                          .map((f, i) => {
                            const src = sourceLabel(f.sourceId);
                            return (
                              <li key={i} className="text-body-s text-muted">
                                <span className="mr-1.5 font-mono text-caption text-subtle">{f.rule}</span>
                                {reasonText(f, m, locale)}
                                {src && (
                                  <span className="block text-caption">
                                    {m.plan.source}:{' '}
                                    {src.url ? (
                                      <a
                                        href={src.url}
                                        target="_blank"
                                        rel="noreferrer noopener"
                                        className="inline-flex items-center gap-1 underline"
                                      >
                                        {src.title}
                                        <ExternalLink className="size-3" aria-hidden="true" />
                                      </a>
                                    ) : (
                                      src.title
                                    )}
                                  </span>
                                )}
                              </li>
                            );
                          })}
                      </ul>
                    </li>
                  );
                })}
              </ul>
            </Sheet>
          ) : null
        }
      >
        <ul className="grid gap-3 sm:grid-cols-2">
          {shown.map((c) => (
            <MatchCard key={c.taxonId} c={c} chosen={chosen.has(c.taxonId)} onToggle={onToggle} />
          ))}
        </ul>
        {eligible.length > INITIAL && (
          <Button variant="ghost" size="sm" className="self-start" onClick={() => setAll((v) => !v)}>
            {all ? m.plan.showFewer : m.plan.showAll}
          </Button>
        )}
      </Section>

      {needs.length > 0 && (
        <Section title={m.plan.needsInfo(needs.length)} description={m.plan.needsInfoBody} headingLevel={3}>
          <ul className="flex flex-col gap-1.5" data-testid="needs-info">
            {needs.slice(0, 20).map((c) => {
              const t = taxonById(c.taxonId);
              if (!t) return null;
              const what = [
                ...new Set(
                  c.findings.filter((f) => f.outcome === 'needs_input').map((f) => reasonText(f, m, locale)),
                ),
              ];
              return (
                <li key={c.taxonId} className="text-body-s">
                  <span className="font-medium text-ink">{taxonName(t, locale)}</span>
                  <span className="text-muted"> · {what.join(' ')}</span>
                </li>
              );
            })}
          </ul>
        </Section>
      )}
    </div>
  );
}
