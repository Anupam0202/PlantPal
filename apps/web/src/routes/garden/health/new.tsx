import type { HealthTriageInput } from '@plantpal/ai';
import { adviceServices, followUpDates, rulesTriage, todayIn } from '@plantpal/domain';
import type { HealthQuestionnaire, HealthTriage } from '@plantpal/schemas';
import { Button, Notice, PageHeader, Section, SelectField, Spinner } from '@plantpal/ui';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { AiButton, AiFlow } from '../../../ai/AiButton';
import { useAiAction } from '../../../ai/useAiAction';
import { Page } from '../../../app/Page';
import { deleteMedia, openHealthCase } from '../../../data/commands';
import { useActiveGarden, useSpecimens } from '../../../data/queries';
import { reportError } from '../../../features/garden/errors';
import { GardenLoading, NoGarden } from '../../../features/garden/NoGarden';
import { useHealthT } from '../../../features/health/messages';
import { PhotoSlots, SLOTS, type Slot } from '../../../features/health/PhotoSlots';
import { answerLines, EMPTY_QUESTIONNAIRE, Questionnaire } from '../../../features/health/Questionnaire';
import { TriageView } from '../../../features/health/Triage';
import { useAiPhotos } from '../../../features/health/useAiPhotos';
import { useHealthContext } from '../../../features/health/useHealthContext';
import { useFormat, useT } from '../../../i18n';
import { usePrefs } from '../../../state/prefs';

export const Route = createFileRoute('/garden/health/new')({
  validateSearch: (s: Record<string, unknown>): { plant?: string } =>
    typeof s.plant === 'string' && s.plant.length <= 40 ? { plant: s.plant } : {},
  component: NewCase,
});

function NewCase() {
  const t = useT();
  const m = useHealthT();
  const fmt = useFormat();
  const navigate = useNavigate();
  const { plant: plantParam } = Route.useSearch();
  const { garden } = useActiveGarden();
  const specimens = useSpecimens(garden?.id);
  const locale = usePrefs((s) => s.locale);
  const units = usePrefs((s) => s.units);
  const [specimenId, setSpecimenId] = useState<string>(plantParam ?? '');
  const [photos, setPhotos] = useState<Partial<Record<Slot, string>>>({});
  const [q, setQ] = useState<HealthQuestionnaire>(EMPTY_QUESTIONNAIRE);
  const [saving, setSaving] = useState(false);
  const saved = useRef(false);
  const photosRef = useRef(photos);
  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);

  const specimen = specimens?.find((s) => s.id === specimenId) ?? null;
  const { ctx, lines } = useHealthContext(garden, specimen);
  const rules = useMemo(() => rulesTriage(q, ctx), [q, ctx]);
  const photoItems = SLOTS.flatMap((s) => (photos[s] ? [{ id: photos[s]!, label: m.slots[s] }] : []));
  const aiPhotos = useAiPhotos(photoItems);

  // Photos taken for a case that is never saved are removed again.
  useEffect(
    () => () => {
      if (!saved.current) for (const id of Object.values(photosRef.current)) if (id) void deleteMedia(id);
    },
    [],
  );

  const ai = useAiAction<HealthTriageInput, HealthTriage>('health-triage', () =>
    aiPhotos.length === 0
      ? null
      : {
          policy: { locale, units, seasonModel: `${garden?.hemisphere ?? 'unknown'} hemisphere` },
          photos: aiPhotos,
          plant: specimen
            ? [specimen.displayName, specimen.scientificName].filter(Boolean).join(' · ')
            : null,
          answers: answerLines(q),
          ruleCandidates: rules.candidates.map((c) => `${c.name} (${c.likelihood})`),
          notes: q.notes.trim() || null,
          weather: lines.weather,
          careLog: lines.careLog,
          space: lines.space,
        },
  );

  if (garden === undefined || specimens === undefined)
    return (
      <Page>
        <GardenLoading />
      </Page>
    );
  if (garden === null)
    return (
      <Page>
        <NoGarden />
      </Page>
    );

  const today = todayIn(garden.timezone);
  const days = ai.result?.followUpDays.length ? ai.result.followUpDays : rules.followUpDays;
  const dates = followUpDates(today, days)
    .map((d) => fmt.date(`${d}T12:00:00Z`))
    .join(', ');
  const services = adviceServices(garden.region?.countryCode ?? null);
  const hasSomething = photoItems.length > 0 || q.signs.length > 0;

  const save = async () => {
    if (!hasSomething) {
      toast.error(m.needSomething);
      return;
    }
    setSaving(true);
    try {
      const hc = await openHealthCase({
        gardenId: garden.id,
        specimenId: specimen?.id ?? null,
        title: specimen?.displayName ?? m.noPlant,
        entries: [
          ...(photoItems.length
            ? [
                {
                  kind: 'photo' as const,
                  by: 'user' as const,
                  mediaIds: photoItems.map((p) => p.id),
                  payload: { slots: photos },
                },
              ]
            : []),
          { kind: 'questionnaire', by: 'user', text: q.notes, payload: q },
          { kind: 'triage', by: 'rules', payload: rules },
          ...(ai.result ? [{ kind: 'triage' as const, by: 'ai' as const, payload: ai.result }] : []),
        ],
        followUpDays: days,
      });
      saved.current = true;
      toast.success(m.saved);
      await navigate({ to: '/garden/health/$caseId', params: { caseId: hc.id } });
    } catch (e) {
      reportError(t, e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Page width="narrow">
      <PageHeader title={m.newCase} description={m.description} />
      <div className="mt-6 flex flex-col gap-8">
        <SelectField<string>
          label={m.plant}
          value={specimenId}
          onValueChange={setSpecimenId}
          options={[
            { value: '', label: m.noPlant },
            ...specimens
              .filter((s) => s.status !== 'archived')
              .map((s) => ({ value: s.id, label: s.displayName })),
          ]}
        />
        <Section title={m.photos} description={m.photosHint} headingLevel={2}>
          <PhotoSlots gardenId={garden.id} value={photos} onChange={setPhotos} labels={m.slots} />
        </Section>
        <Section title={m.signs} headingLevel={2}>
          <Questionnaire value={q} onChange={setQ} />
        </Section>

        {q.signs.length > 0 && (
          <TriageView triage={rules} source="rules" services={services} followUpDates={dates} />
        )}

        {photoItems.length > 0 && aiPhotos.length === photoItems.length && (
          <div className="flex flex-col gap-3">
            <div>
              <AiButton ai={ai} label={m.askAi} />
            </div>
            <AiFlow ai={ai} fallback={m.aiFallback} />
            {ai.result && <TriageView triage={ai.result} source="ai" services={services} />}
          </div>
        )}

        <Notice tone="info">{m.honest}</Notice>
        <div>
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? <Spinner /> : null}
            {m.save}
          </Button>
        </div>
      </div>
    </Page>
  );
}
