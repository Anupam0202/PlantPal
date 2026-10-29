import { renderSection, type ContextSection } from '@plantpal/ai';
import type { AiDataCategory } from '@plantpal/schemas';
import { Badge, Button, buttonClasses, Card, CheckboxField, Notice, Skeleton } from '@plantpal/ui';
import { Link } from '@tanstack/react-router';
import { Send, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAiT } from './messages';
import { useAiState } from './state';
import type { AiAction } from './useAiAction';

const SETTINGS_FIX = new Set([
  'KEY_MISSING',
  'KEY_INVALID',
  'PERMISSION_DENIED',
  'BILLING_REQUIRED',
  'MODEL_UNAVAILABLE',
  'AI_DISABLED',
]);
const NO_RETRY = new Set([
  'DAILY_QUOTA',
  'REGION_UNSUPPORTED',
  'CONSENT_REQUIRED',
  'SAFETY_BLOCKED',
  'RECITATION',
]);
const KEY_RE = /AIza[0-9A-Za-z_-]{35}/;

function useCountdown(ms: number | null): number {
  const [left, setLeft] = useState(() => (ms ? Math.ceil(ms / 1000) : 0));
  useEffect(() => {
    if (!ms) return;
    const end = Date.now() + ms;
    const id = setInterval(() => {
      const s = Math.max(0, Math.ceil((end - Date.now()) / 1000));
      setLeft(s);
      if (s === 0) clearInterval(id);
    }, 500);
    return () => clearInterval(id);
  }, [ms]);
  return left;
}

function SectionBody({ s }: { s: ContextSection }) {
  const url = s.image ? `data:${s.image.mimeType};base64,${s.image.data}` : null;
  return (
    <>
      {url && <img src={url} alt="" className="mb-2 max-h-40 rounded-md" />}
      {s.text ? (
        <pre className="max-h-48 overflow-auto rounded-md bg-sunken p-2 font-mono text-caption whitespace-pre-wrap text-ink">
          {renderSection(s)}
        </pre>
      ) : null}
    </>
  );
}

/** Inline send preview, progress and typed error with its recovery (§18.4, §18.7). */
export default function AiFlowPanel({ ai, fallback }: { ai: AiAction<unknown>; fallback?: string }) {
  const t = useAiT();
  const cap = useAiState((st) => st.dailyCap);
  const wait = useCountdown(
    ai.status === 'error' && ai.error?.code === 'RATE_LIMITED' ? ai.error.retryAfterMs : null,
  );

  if (ai.status === 'running')
    return (
      <div className="flex flex-col gap-2" aria-busy="true" aria-live="polite">
        <div className="flex items-center gap-3">
          <Sparkles className="size-4 animate-pulse text-accent-ink" aria-hidden="true" />
          <span className="text-body-s text-muted">{t.sending}</span>
          <Button size="sm" variant="ghost" onClick={ai.cancel}>
            {t.cancel}
          </Button>
        </div>
        <Skeleton className="h-16 w-full" />
      </div>
    );

  if (ai.status === 'cap')
    return (
      <Notice
        tone="warning"
        title={t.cap.title}
        action={
          <>
            <Button size="sm" onClick={() => ai.send({ overCap: true })}>
              {t.cap.sendAnyway}
            </Button>
            <Button size="sm" variant="ghost" onClick={ai.cancel}>
              {t.cancel}
            </Button>
          </>
        }
      >
        {t.cap.body(cap ?? 0)}
      </Notice>
    );

  if (ai.status === 'error' && ai.error) {
    const code = ai.error.code;
    const copy = t.errors[code];
    const toSettings = SETTINGS_FIX.has(code);
    const retry = !NO_RETRY.has(code);
    return (
      <Notice
        tone={code === 'CANCELLED' ? 'info' : 'warning'}
        title={ai.error.keyInText ? t.errors.CONSENT_REQUIRED.title : copy.title}
        role="alert"
        action={
          <>
            {toSettings ? (
              <Link to="/settings/ai" className={buttonClasses('primary', 'sm')}>
                {t.openSettings}
              </Link>
            ) : code === 'RATE_LIMITED' && wait > 0 ? (
              <Button size="sm" variant="secondary" disabled>
                {t.tryAgainIn(wait)}
              </Button>
            ) : retry ? (
              <Button size="sm" variant="secondary" onClick={() => void ai.start()}>
                {t.tryAgain}
              </Button>
            ) : null}
            <Button size="sm" variant="ghost" onClick={ai.reset}>
              {t.dismiss}
            </Button>
          </>
        }
      >
        <p>{ai.error.keyInText ? t.preview.keyInText : copy.body}</p>
        {fallback && (
          <p className="mt-1">
            <span className="font-medium">{t.withoutAi}</span> {fallback}
          </p>
        )}
      </Notice>
    );
  }

  if (ai.status !== 'preview') return null;

  const cats = [...new Set(ai.sections.map((s) => s.category))].filter(
    (c): c is AiDataCategory => c !== 'request',
  );
  const required = new Set(
    ai.sections.filter((s) => s.required && s.category !== 'request').map((s) => s.category),
  );
  const missing = [...required].filter((c) => !ai.allowed.includes(c as AiDataCategory)) as AiDataCategory[];
  const keyInText = ai.sections.some((s) => s.text && KEY_RE.test(s.text));
  const toggle = (c: AiDataCategory, on: boolean) =>
    ai.setAllowed(on ? [...ai.allowed, c] : ai.allowed.filter((x) => x !== c));

  return (
    <Card className="flex flex-col gap-3" aria-labelledby="ai-preview-title" role="region">
      <div>
        <h3 id="ai-preview-title" className="flex items-center gap-2 font-semibold text-ink">
          <Sparkles className="size-4 text-accent-ink" aria-hidden="true" />
          {t.preview.title}
        </h3>
        <p className="mt-1 text-body-s text-muted">{t.preview.body}</p>
      </div>
      <fieldset className="flex flex-col">
        <legend className="sr-only">{t.preview.title}</legend>
        {cats.map((c) => (
          <div key={c} className="flex items-start justify-between gap-2">
            <CheckboxField
              label={t.categories[c]}
              checked={ai.allowed.includes(c)}
              onCheckedChange={(on) => toggle(c, on)}
            />
            {required.has(c) && <Badge className="mt-2 shrink-0">{t.preview.needed}</Badge>}
          </div>
        ))}
      </fieldset>
      {missing.length > 0 && (
        <Notice tone="warning">{t.preview.blocked(missing.map((c) => t.categories[c]).join(', '))}</Notice>
      )}
      {keyInText && <Notice tone="danger">{t.preview.keyInText}</Notice>}
      <details className="text-body-s">
        <summary className="cursor-pointer font-medium text-accent-ink">{t.preview.show}</summary>
        <div className="mt-2 flex flex-col gap-3">
          {ai.sections
            .filter((s) => s.category === 'request' || ai.allowed.includes(s.category))
            .map((s, i) => (
              <div key={i}>
                <SectionBody s={s} />
              </div>
            ))}
          <div>
            <p className="mb-1 text-caption text-muted">{t.preview.instructions}</p>
            <pre className="max-h-40 overflow-auto rounded-md bg-sunken p-2 font-mono text-caption whitespace-pre-wrap text-muted">
              {ai.instructions}
            </pre>
          </div>
        </div>
      </details>
      <p className="text-caption text-muted">
        {ai.model ? t.preview.cost(ai.model) : null} · {t.preview.remember}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => ai.send()} disabled={missing.length > 0 || keyInText}>
          <Send className="size-4" aria-hidden="true" />
          {t.send}
        </Button>
        <Button size="sm" variant="ghost" onClick={ai.cancel}>
          {t.cancel}
        </Button>
      </div>
    </Card>
  );
}
