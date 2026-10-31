import type { HealthTriage } from '@plantpal/schemas';
import { Badge, Card } from '@plantpal/ui';
import { ExternalLink, ShieldAlert } from 'lucide-react';
import { useHealthT } from './messages';

/** One triage (rules or AI) with likelihood classes, evidence, checks and safe steps. */
export function TriageView({
  triage,
  source,
  services,
  followUpDates,
}: {
  triage: HealthTriage;
  source: 'rules' | 'ai';
  services?: Array<{ name: string; url: string | null }>;
  followUpDates?: string;
}) {
  const m = useHealthT();
  return (
    <Card className="flex flex-col gap-4" data-testid={`triage-${source}`}>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-h3 text-ink">{source === 'rules' ? m.rulesTitle : m.aiTitle}</h3>
        <Badge tone={source === 'ai' ? 'dusk' : 'neutral'}>{m.by[source]}</Badge>
      </div>
      {source === 'rules' && <p className="text-caption text-muted">{m.rulesNote}</p>}
      {triage.identityGuess && (
        <p className="text-body-s text-muted">
          {m.identity(triage.identityGuess.name, m.likelihood[triage.identityGuess.likelihood])}
        </p>
      )}
      {triage.candidates.length === 0 ? (
        <p className="text-body-s text-ink">
          <span className="font-medium">{m.abstain}.</span> {triage.abstainReason}
        </p>
      ) : (
        <ol className="flex flex-col gap-3">
          {triage.candidates.map((c) => (
            <li key={c.name} className="rounded-md border border-line p-3 text-body-s">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold text-ink">{c.name}</p>
                <Badge
                  tone={
                    c.likelihood === 'LIKELY' ? 'warning' : c.likelihood === 'POSSIBLE' ? 'info' : 'neutral'
                  }
                >
                  {m.likelihood[c.likelihood]}
                </Badge>
                <Badge>{m.category[c.category]}</Badge>
              </div>
              {(
                [
                  [m.evidenceFor, c.evidenceFor],
                  [m.evidenceAgainst, c.evidenceAgainst],
                  [m.checks, c.checksToConfirm],
                ] as const
              ).map(([label, lines]) =>
                lines.length ? (
                  <div key={label} className="mt-1.5">
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
          ))}
        </ol>
      )}
      {triage.immediateSafeSteps.length > 0 && (
        <div>
          <p className="font-medium text-ink">{m.steps}</p>
          <ul className="list-disc pl-5 text-body-s text-ink">
            {triage.immediateSafeSteps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </div>
      )}
      {triage.escalate.needed && (
        <div className="flex gap-2 rounded-md bg-warning-soft p-3 text-body-s">
          <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-medium">{m.escalate}</p>
            <p>{triage.escalate.reason}</p>
            {services && services.length > 0 && (
              <ul className="mt-1 flex flex-col gap-0.5">
                {services.map((s) => (
                  <li key={s.name}>
                    {s.url ? (
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 underline"
                      >
                        {s.name}
                        <ExternalLink className="size-3" aria-hidden="true" />
                      </a>
                    ) : (
                      s.name
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
      {followUpDates && <p className="text-caption text-muted">{m.followUps(followUpDates)}</p>}
      <p className="text-caption text-muted">{m.honest}</p>
    </Card>
  );
}
