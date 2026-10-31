import { capabilitiesOf, looksLikeGeminiKey, MODEL_SEEDS, type DayUsage } from '@plantpal/ai';
import type { ModelRole } from '@plantpal/schemas';
import {
  Badge,
  Button,
  Card,
  Notice,
  NumberInput,
  PageHeader,
  Section,
  SegmentedControl,
  SelectField,
  Spinner,
  SwitchField,
  TextField,
} from '@plantpal/ui';
import { createFileRoute, useRouter } from '@tanstack/react-router';
import { ExternalLink, KeyRound, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useAiT } from '../../ai/messages';
import { discover, recheckModels, usage } from '../../ai/runtime';
import { useAiSettingsT } from '../../ai/settingsMessages';
import { useAiState } from '../../ai/state';
import { Page } from '../../app/Page';
import { deletePlaintextKey, readPlaintextKey } from '../../data/legacy/storage';
import { useFormat } from '../../i18n';
import type { VaultMode } from '@plantpal/ai/vault';
import type { AiErrorCode } from '@plantpal/schemas';

export const Route = createFileRoute('/settings/ai')({
  component: AiSettingsPage,
});

const SHOWN_ROLES: ModelRole[] = ['fast', 'balanced', 'deep'];

function AiSettingsPage() {
  const t = useAiSettingsT();
  const at = useAiT();
  const fmt = useFormat();
  const router = useRouter();
  const s = useAiState();
  const [key, setKey] = useState('');
  const [mode, setMode] = useState<VaultMode>('device');
  const [busy, setBusy] = useState(false);
  const [rechecking, setRechecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState<DayUsage[]>([]);
  const [today, setToday] = useState({ requests: 0, tokens: 0 });
  const [legacy, setLegacy] = useState<string | null>(() => readPlaintextKey());

  useEffect(() => {
    if (!s.loaded) void s.load();
  }, [s]);
  useEffect(() => {
    void usage().then((u) => {
      setDays(u.days);
      setToday(u.today);
    });
  }, [s.keyVersion]);

  const failText = (e: unknown) => {
    const code = (e as { code?: AiErrorCode }).code;
    return code ? `${at.errors[code].title}. ${at.errors[code].body}` : (e as Error).message;
  };

  const save = async (value: string, how: VaultMode) => {
    setError(null);
    if (!looksLikeGeminiKey(value)) {
      setError(t.badFormat);
      return false;
    }
    setBusy(true);
    try {
      const models = await discover(value.trim());
      await s.saveKey(value.trim(), how, models);
      setKey('');
      toast.success(t.saved);
      return true;
    } catch (e) {
      setError(failText(e));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const importLegacy = async () => {
    if (!legacy) return;
    if (await save(legacy, 'device')) {
      deletePlaintextKey();
      setLegacy(null);
      toast.success(t.legacyImported);
    }
  };

  const recheck = async () => {
    setRechecking(true);
    try {
      await recheckModels();
      toast.success(t.rechecked);
    } catch (e) {
      toast.error(failText(e));
    } finally {
      setRechecking(false);
    }
  };

  const caps = capabilitiesOf(s.roles);
  const week = days
    .slice(-7)
    .reduce((n, d) => n + Object.values(d.byModel).reduce((m, x) => m + x.requests, 0), 0);
  const consentFeatures = Object.keys(s.consent);
  const pending = s.pending;

  return (
    <Page width="narrow">
      <PageHeader title={t.title} description={t.description} />
      <div className="mt-6 flex flex-col gap-6">
        {pending && s.vault.mode && (
          <Notice
            tone="success"
            action={
              <Button size="sm" onClick={() => router.history.push(pending.path)}>
                {t.resume}
              </Button>
            }
          >
            {t.saved}
          </Notice>
        )}

        <Card>
          <SwitchField
            label={t.master}
            description={t.masterHint}
            checked={s.enabled}
            onCheckedChange={(enabled) => void s.update({ enabled })}
          />
        </Card>

        {legacy && (
          <Notice
            tone="warning"
            title={t.legacyTitle}
            action={
              <>
                <Button size="sm" onClick={() => void importLegacy()} disabled={busy}>
                  {t.legacyImport}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    deletePlaintextKey();
                    setLegacy(null);
                    toast.success(t.legacyDeleted);
                  }}
                >
                  {t.legacyDelete}
                </Button>
              </>
            }
          >
            {t.legacyBody}
          </Notice>
        )}

        <Section title={t.key}>
          <Card className="flex flex-col gap-4">
            <p className="flex items-center gap-2 text-body-s text-ink" data-testid="key-status">
              <KeyRound className="size-4 text-accent-ink" aria-hidden="true" />
              {s.vault.mode === 'session' && s.vault.hint
                ? t.session(s.vault.hint)
                : s.vault.mode === 'device' && s.vault.hint
                  ? t.device(
                      s.vault.hint,
                      fmt.date(s.vault.savedAt ?? new Date(), {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      }),
                    )
                  : t.none}
            </p>
            <form
              className="flex flex-col gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                void save(key, mode);
              }}
            >
              <TextField
                label={t.field}
                type="password"
                value={key}
                onValueChange={(v) => {
                  setKey(v);
                  setError(null);
                }}
                autoComplete="off"
                placeholder={t.placeholder}
                error={error ?? undefined}
                maxLength={512}
              />
              <div className="flex flex-col gap-2">
                <span className="text-body-s font-medium text-ink">{t.mode}</span>
                <SegmentedControl<VaultMode>
                  label={t.mode}
                  value={mode}
                  onValueChange={setMode}
                  options={[
                    { value: 'device', label: t.modeDevice },
                    { value: 'session', label: t.modeSession },
                  ]}
                />
                <p className="text-caption text-muted">
                  {mode === 'device' ? t.modeDeviceHint : t.modeSessionHint}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={busy || !key.trim()}>
                  {busy ? <Spinner /> : <ShieldCheck className="size-4" aria-hidden="true" />}
                  {busy ? t.checking : t.check}
                </Button>
                {s.vault.mode && (
                  <Button
                    type="button"
                    variant="danger-soft"
                    onClick={() => {
                      void s.removeKey().then(() => toast.success(t.removed));
                    }}
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                    {t.remove}
                  </Button>
                )}
              </div>
            </form>
            <a
              href="https://aistudio.google.com/apikey"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-body-s font-medium text-accent-ink underline"
            >
              {t.getKey}
              <ExternalLink className="size-3.5" aria-hidden="true" />
            </a>
            <div>
              <p className="text-body-s font-medium text-ink">{t.guidanceTitle}</p>
              <ul className="mt-1 list-disc pl-5 text-body-s text-muted">
                {t.guidance.map((g) => (
                  <li key={g}>{g}</li>
                ))}
              </ul>
            </div>
          </Card>
        </Section>

        {s.vault.mode && (
          <Section title={t.capabilities}>
            <Card className="flex flex-col gap-4">
              <ul className="grid grid-cols-2 gap-2 text-body-s">
                {(Object.keys(caps) as Array<keyof typeof caps>).map((c) => (
                  <li key={c} className="flex items-center justify-between gap-2">
                    <span className="text-ink">{t.caps[c]}</span>
                    <Badge tone={caps[c] ? 'accent' : 'neutral'}>{caps[c] ? t.yes : t.no}</Badge>
                  </li>
                ))}
              </ul>
              <div className="flex flex-col gap-3">
                <p className="text-body-s font-medium text-ink">{t.models}</p>
                {SHOWN_ROLES.map((role) => {
                  const options = s.available.filter((m) =>
                    role === 'fast'
                      ? /flash-lite/.test(m)
                      : role === 'deep'
                        ? /-pro/.test(m)
                        : /flash(?!-lite)/.test(m),
                  );
                  return (
                    <SelectField<string>
                      key={role}
                      label={t.roles[role]}
                      value={s.overrides[role] ?? ''}
                      onValueChange={(v) => {
                        const overrides = { ...s.overrides };
                        if (v) overrides[role] = v;
                        else delete overrides[role];
                        void s.update({ overrides }).then(recheck);
                      }}
                      options={[
                        { value: '', label: `${t.automatic}: ${s.roles[role] ?? t.notListed}` },
                        ...options.map((m) => ({ value: m, label: m })),
                      ]}
                      description={
                        role === 'balanced' || role === 'fast'
                          ? `Seed: ${MODEL_SEEDS[role].ids[0]} (${MODEL_SEEDS[role].verifiedAt})`
                          : undefined
                      }
                    />
                  );
                })}
                <div className="flex flex-wrap items-center gap-3">
                  <Button size="sm" variant="secondary" onClick={() => void recheck()} disabled={rechecking}>
                    {rechecking ? <Spinner /> : <RefreshCw className="size-4" aria-hidden="true" />}
                    {t.recheck}
                  </Button>
                  {s.checkedAt && (
                    <span className="text-caption text-muted">{t.checkedAt(fmt.date(s.checkedAt))}</span>
                  )}
                </div>
              </div>
            </Card>
          </Section>
        )}

        <Section title={t.usage}>
          <Card className="flex flex-col gap-3 text-body-s">
            <p className="text-ink" data-testid="ai-usage">
              {t.usageToday(today.requests, fmt.number(today.tokens))}
            </p>
            <p className="text-muted">{t.usageWeek(week)}</p>
            <NumberInput
              label={t.cap}
              description={t.capHint}
              value={s.dailyCap}
              onValueChange={(v) => void s.update({ dailyCap: v && v > 0 ? Math.round(v) : null })}
              min={1}
              max={1000}
            />
          </Card>
        </Section>

        <Section title={t.labs} description={t.labsHint}>
          <Card>
            <SwitchField
              label={t.labsPhotoPlan}
              description={t.labsPhotoPlanHint}
              checked={s.labs.photoPlan}
              onCheckedChange={(photoPlan) => void s.update({ labs: { ...s.labs, photoPlan } })}
            />
          </Card>
        </Section>

        <Section title={t.consent}>
          <Card className="flex flex-col gap-3 text-body-s">
            {consentFeatures.length === 0 ? (
              <p className="text-muted">{t.consentNone}</p>
            ) : (
              <>
                <ul className="flex flex-col gap-1">
                  {consentFeatures.map((f) => (
                    <li key={f} className="text-ink">
                      <span className="font-medium">{f}</span>:{' '}
                      {(s.consent[f as keyof typeof s.consent] ?? []).map((c) => at.categories[c]).join(', ')}
                    </li>
                  ))}
                </ul>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => void s.update({ consent: {} }).then(() => toast.success(t.consentResetDone))}
                >
                  {t.consentReset}
                </Button>
              </>
            )}
          </Card>
        </Section>

        <Section title={t.limits}>
          <ul className="list-disc pl-5 text-body-s text-muted">
            {t.limitsBody.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </Section>

        <Section title={t.privacy}>
          <div className="flex flex-col gap-2 text-body-s text-muted">
            {t.privacyBody.map((p) => (
              <p key={p}>{p}</p>
            ))}
            <a
              href="https://ai.google.dev/gemini-api/terms"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-medium text-accent-ink underline"
            >
              {t.terms}
              <ExternalLink className="size-3.5" aria-hidden="true" />
            </a>
          </div>
        </Section>

        <Section title={t.security}>
          <p className="text-body-s text-muted">{t.securityBody}</p>
        </Section>
      </div>
    </Page>
  );
}
