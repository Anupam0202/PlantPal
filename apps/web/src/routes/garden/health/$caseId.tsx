import type { HealthTriageInput } from '@plantpal/ai';
import { adviceServices } from '@plantpal/domain';
import {
  HEALTH_OUTCOMES,
  HealthQuestionnaire,
  HealthTriage,
  type HealthCaseEntry,
  type HealthOutcome,
} from '@plantpal/schemas';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  PageHeader,
  Section,
  Spinner,
  TextField,
} from '@plantpal/ui';
import { createFileRoute, Link } from '@tanstack/react-router';
import { ChevronLeft } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { AiButton, AiFlow } from '../../../ai/AiButton';
import { useAiAction } from '../../../ai/useAiAction';
import { Page } from '../../../app/Page';
import { addCaseEntry, closeHealthCase } from '../../../data/commands';
import { useGarden, useHealthCase, useMediaUrl, useSpecimen } from '../../../data/queries';
import { reportError } from '../../../features/garden/errors';
import { MediaStrip, PhotoField } from '../../../features/garden/Media';
import { GardenLoading } from '../../../features/garden/NoGarden';
import { useHealthT } from '../../../features/health/messages';
import { answerLines } from '../../../features/health/Questionnaire';
import { TriageView } from '../../../features/health/Triage';
import { useAiPhotos } from '../../../features/health/useAiPhotos';
import { useHealthContext } from '../../../features/health/useHealthContext';
import { RadioChips } from '../../../features/plan/RadioChips';
import { useFormat, useT } from '../../../i18n';
import { usePrefs } from '../../../state/prefs';

export const Route = createFileRoute('/garden/health/$caseId')({
  component: CasePage,
});

/** Before/after slider: the latest photo is revealed over the first one. */
function Compare({ before, after }: { before: string; after: string }) {
  const m = useHealthT();
  const a = useMediaUrl(before, 'full');
  const b = useMediaUrl(after, 'full');
  const [pos, setPos] = useState(50);
  if (!a || !b) return null;
  return (
    <figure className="flex flex-col gap-2">
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-md bg-sunken">
        <img src={a} alt="" className="absolute inset-0 size-full object-cover" />
        <img
          src={b}
          alt=""
          className="absolute inset-0 size-full object-cover"
          style={{ clipPath: `inset(0 0 0 ${pos}%)` }}
        />
        <div
          aria-hidden="true"
          className="absolute inset-y-0 w-0.5 bg-raised shadow-1"
          style={{ left: `${pos}%` }}
        />
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={pos}
        onChange={(e) => setPos(Number(e.currentTarget.value))}
        aria-label={m.compareLabel}
        className="w-full accent-[var(--pp-accent)]"
      />
      <figcaption className="text-caption text-muted">{m.compareHint}</figcaption>
    </figure>
  );
}

function EntryBody({ e }: { e: HealthCaseEntry }) {
  const m = useHealthT();
  if (e.kind === 'questionnaire') {
    const q = HealthQuestionnaire.safeParse(e.payload);
    if (!q.success) return <p className="text-body-s text-muted">{e.text}</p>;
    return (
      <div className="text-body-s text-ink">
        <p>{q.data.signs.map((s) => m.signLabels[s]).join(', ') || '—'}</p>
        <p className="text-muted">
          {m.onsets[q.data.onset]} · {m.spreadLabels[q.data.spread]}
          {q.data.soil ? ` · ${m.soilLabels[q.data.soil]}` : ''}
        </p>
        {q.data.notes && <p className="mt-1">“{q.data.notes}”</p>}
      </div>
    );
  }
  if (e.kind === 'triage') {
    // Only validated triage is shown; anything else (e.g. a v3 scan) is summarised as a draft.
    const t = HealthTriage.safeParse(e.payload);
    if (!t.success) return <p className="text-body-s text-muted">{m.by.ai}</p>;
    const top = t.data.candidates[0];
    return (
      <p className="text-body-s text-ink">
        {top ? `${top.name} · ${m.likelihood[top.likelihood]}` : (t.data.abstainReason ?? m.abstain)}
      </p>
    );
  }
  const trend = (e.payload as { trend?: string } | null)?.trend;
  const outcome = (e.payload as { outcome?: HealthOutcome } | null)?.outcome;
  return (
    <div className="flex flex-col gap-2 text-body-s text-ink">
      {trend && <p className="font-medium">{m.trends[trend] ?? trend}</p>}
      {outcome && <p className="font-medium">{m.outcomes[outcome]}</p>}
      {e.text && <p>{e.text}</p>}
      {e.mediaIds.length > 0 && <MediaStrip ids={e.mediaIds} size="sm" />}
    </div>
  );
}

function CasePage() {
  const t = useT();
  const m = useHealthT();
  const fmt = useFormat();
  const { caseId } = Route.useParams();
  const hc = useHealthCase(caseId);
  const garden = useGarden(hc?.gardenId);
  const specimen = useSpecimen(hc?.specimenId ?? '');
  const locale = usePrefs((s) => s.locale);
  const units = usePrefs((s) => s.units);
  const [trend, setTrend] = useState<'better' | 'same' | 'worse' | null>(null);
  const [note, setNote] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [outcome, setOutcome] = useState<HealthOutcome | null>(null);
  const [busy, setBusy] = useState(false);

  const photoIds = (hc?.entries ?? []).flatMap((e) => e.mediaIds);
  const aiPhotos = useAiPhotos(photoIds.slice(-4).map((id, i) => ({ id, label: `Photo ${i + 1}` })));
  const { lines } = useHealthContext(garden, specimen ?? null);
  const questionnaire = [...(hc?.entries ?? [])]
    .reverse()
    .map((e) => (e.kind === 'questionnaire' ? HealthQuestionnaire.safeParse(e.payload) : null))
    .find((r) => r?.success);
  const ruleTriage = [...(hc?.entries ?? [])].reverse().find((e) => e.kind === 'triage' && e.by === 'rules');
  const aiTriage = [...(hc?.entries ?? [])].reverse().find((e) => e.kind === 'triage' && e.by === 'ai');

  const ai = useAiAction<HealthTriageInput, HealthTriage>(
    'health-triage',
    () =>
      aiPhotos.length === 0 || !questionnaire?.success
        ? null
        : {
            policy: { locale, units, seasonModel: `${garden?.hemisphere ?? 'unknown'} hemisphere` },
            photos: aiPhotos,
            plant: specimen?.displayName ?? null,
            answers: answerLines(questionnaire.data),
            ruleCandidates: [],
            notes: questionnaire.data.notes.trim() || null,
            weather: lines.weather,
            careLog: lines.careLog,
            space: lines.space,
          },
    {
      onResult: (r) => {
        if (!hc) return;
        // Only a validated result reaches here, so nothing partial is ever stored (L05).
        void addCaseEntry(hc.id, hc.version, { kind: 'triage', by: 'ai', payload: r }).catch((e: unknown) =>
          reportError(t, e),
        );
      },
    },
  );

  if (hc === undefined || (hc && garden === undefined))
    return (
      <Page>
        <GardenLoading />
      </Page>
    );
  if (hc === null || !garden)
    return (
      <Page>
        <ErrorState message={m.emptyTitle} />
      </Page>
    );

  const services = adviceServices(garden.region?.countryCode ?? null);
  const closed = hc.status === 'closed';
  const rules = ruleTriage ? HealthTriage.safeParse(ruleTriage.payload) : null;
  const aiParsed = aiTriage ? HealthTriage.safeParse(aiTriage.payload) : null;

  const saveFollowUp = async () => {
    setBusy(true);
    try {
      await addCaseEntry(hc.id, hc.version, {
        kind: 'followup',
        by: 'user',
        text: note,
        mediaIds: photos,
        payload: { trend },
      });
      setTrend(null);
      setNote('');
      setPhotos([]);
      toast.success(m.followUpSaved);
    } catch (e) {
      reportError(t, e);
    } finally {
      setBusy(false);
    }
  };

  const close = async () => {
    if (!outcome) return;
    setBusy(true);
    try {
      await closeHealthCase(hc.id, hc.version, outcome);
      toast.success(m.closed);
    } catch (e) {
      reportError(t, e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page width="narrow">
      <Link
        to="/garden/health"
        className="mb-2 inline-flex items-center gap-1 text-body-s text-muted hover:text-ink"
      >
        <ChevronLeft className="size-4" aria-hidden="true" />
        {m.title}
      </Link>
      <PageHeader
        title={specimen?.displayName ?? hc.title}
        description={m.opened(fmt.date(new Date(hc.openedAt)))}
        actions={<Badge tone={closed ? 'neutral' : 'warning'}>{m.status[hc.status]}</Badge>}
      />
      <div className="mt-6 flex flex-col gap-8">
        {photoIds.length >= 2 && (
          <Section title={m.compare} headingLevel={2}>
            <Compare before={photoIds[0]!} after={photoIds[photoIds.length - 1]!} />
          </Section>
        )}

        {rules?.success && <TriageView triage={rules.data} source="rules" services={services} />}
        {aiParsed?.success ? (
          <TriageView triage={aiParsed.data} source="ai" services={services} />
        ) : (
          !closed &&
          aiPhotos.length > 0 && (
            <div className="flex flex-col gap-3">
              <div>
                <AiButton ai={ai} label={m.askAi} />
              </div>
              <AiFlow ai={ai} fallback={m.aiFallback} />
            </div>
          )
        )}

        <Section title={m.timeline} headingLevel={2}>
          <ol className="flex flex-col gap-3" data-testid="case-timeline">
            {hc.entries.map((e) => (
              <li key={e.id}>
                <Card padding="sm" className="flex flex-col gap-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-ink">{m.kinds[e.kind] ?? e.kind}</span>
                    <Badge tone={e.by === 'ai' ? 'dusk' : 'neutral'}>{m.by[e.by]}</Badge>
                    <span className="text-caption text-muted">{fmt.date(new Date(e.at))}</span>
                  </div>
                  <EntryBody e={e} />
                </Card>
              </li>
            ))}
          </ol>
        </Section>

        {!closed && (
          <Section title={m.followUp} headingLevel={2}>
            <Card className="flex flex-col gap-4">
              <RadioChips
                legend={m.trend}
                value={trend}
                onChange={setTrend}
                options={(['better', 'same', 'worse'] as const).map((v) => ({
                  value: v,
                  label: m.trends[v],
                }))}
              />
              <TextField
                label={m.notes}
                value={note}
                onValueChange={setNote}
                multiline
                rows={2}
                maxLength={500}
              />
              <PhotoField gardenId={garden.id} value={photos} onChange={setPhotos} max={2} />
              <div>
                <Button
                  onClick={() => void saveFollowUp()}
                  disabled={busy || (!trend && !note.trim() && photos.length === 0)}
                >
                  {busy ? <Spinner /> : null}
                  {m.saveEntry}
                </Button>
              </div>
            </Card>
          </Section>
        )}

        {!closed && (
          <Section title={m.close} description={m.outcomeHint} headingLevel={2}>
            <Card className="flex flex-col gap-4">
              <RadioChips
                legend={m.outcome}
                value={outcome}
                onChange={setOutcome}
                options={HEALTH_OUTCOMES.map((o) => ({ value: o, label: m.outcomes[o] }))}
              />
              <div>
                <Button variant="secondary" onClick={() => void close()} disabled={busy || !outcome}>
                  {m.close}
                </Button>
              </div>
            </Card>
          </Section>
        )}
        {closed && hc.outcome && <EmptyState title={m.closed} description={m.outcomes[hc.outcome]} />}

        <Section title={m.advice} description={m.adviceHint} headingLevel={2}>
          <ul className="flex flex-col gap-1 text-body-s">
            {services.map((s) => (
              <li key={s.name}>
                {s.url ? (
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent-ink underline"
                  >
                    {s.name}
                  </a>
                ) : (
                  <span className="text-ink">{s.name}</span>
                )}
              </li>
            ))}
          </ul>
        </Section>
      </div>
    </Page>
  );
}
