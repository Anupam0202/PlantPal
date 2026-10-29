import type { ContextSection } from '@plantpal/ai';
import type { AiDataCategory, AiErrorCode } from '@plantpal/schemas';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAiState, type AiFeature } from './state';

export type AiStatus = 'idle' | 'preview' | 'cap' | 'running' | 'done' | 'error';

export interface AiFailure {
  code: AiErrorCode;
  retryAfterMs: number | null;
  keyInText: boolean;
}

export interface AiAction<T> {
  feature: AiFeature;
  status: AiStatus;
  result: T | null;
  error: AiFailure | null;
  sections: ContextSection[];
  instructions: string;
  model: string | null;
  allowed: AiDataCategory[];
  setAllowed: (a: AiDataCategory[]) => void;
  /** Opens the send preview (or reports why it cannot run). */
  start: () => void | Promise<void>;
  /** Sends what the preview shows. */
  send: (opts?: { overCap?: boolean }) => void;
  cancel: () => void;
  reset: () => void;
}

const FIXABLE: AiErrorCode[] = [
  'KEY_MISSING',
  'KEY_INVALID',
  'PERMISSION_DENIED',
  'BILLING_REQUIRED',
  'DAILY_QUOTA',
  'MODEL_UNAVAILABLE',
];

const categoriesIn = (sections: ContextSection[]) => [
  ...new Set(sections.map((s) => s.category).filter((c): c is AiDataCategory => c !== 'request')),
];

/**
 * One AI action: preview → send → validated result or a typed error. Nothing runs in the background;
 * leaving the page cancels the request. When a key or quota problem is fixed in Settings › AI, the
 * pending action resumes on its own (§18.4).
 */
export function useAiAction<I, T>(
  feature: AiFeature,
  build: () => I | null,
  opts: { onResult?: (data: T) => void } = {},
): AiAction<T> {
  const [status, setStatus] = useState<AiStatus>('idle');
  const [result, setResult] = useState<T | null>(null);
  const [error, setError] = useState<AiFailure | null>(null);
  const [sections, setSections] = useState<ContextSection[]>([]);
  const [instructions, setInstructions] = useState('');
  const [model, setModel] = useState<string | null>(null);
  const [allowed, setAllowed] = useState<AiDataCategory[]>([]);
  const input = useRef<I | null>(null);
  const abort = useRef<AbortController | null>(null);
  const buildRef = useRef(build);
  const onResult = useRef(opts.onResult);
  useEffect(() => {
    buildRef.current = build;
    onResult.current = opts.onResult;
  });

  const fail = useCallback(
    (code: AiErrorCode, extra: Partial<AiFailure> = {}, allowedNow: AiDataCategory[] = []) => {
      setError({ code, retryAfterMs: null, keyInText: false, ...extra });
      setStatus('error');
      if (FIXABLE.includes(code)) {
        const s = useAiState.getState();
        s.setPending({
          feature,
          path: location.pathname + location.search,
          allowed: allowedNow,
          keyVersion: s.keyVersion,
        });
      }
    },
    [feature],
  );

  const execute = useCallback(
    async (allowedNow: AiDataCategory[], overCap: boolean) => {
      const rt = await import('./runtime');
      if (!overCap && (await rt.capReached()) !== null) {
        setStatus('cap');
        return;
      }
      setStatus('running');
      setError(null);
      abort.current?.abort();
      const ac = new AbortController();
      abort.current = ac;
      try {
        const r = await rt.run<T>(feature, input.current, allowedNow, ac.signal);
        if (ac.signal.aborted) return;
        setResult(r.data);
        setStatus('done');
        onResult.current?.(r.data);
      } catch (e) {
        const err = e as { code?: AiErrorCode; retryAfterMs?: number | null; opts?: { detail?: string } };
        if (err.code === 'CANCELLED') {
          setStatus('idle');
          return;
        }
        fail(
          err.code ?? 'NETWORK',
          { retryAfterMs: err.retryAfterMs ?? null, keyInText: err.opts?.detail === 'API_KEY_IN_INPUT' },
          allowedNow,
        );
      }
    },
    [feature, fail],
  );

  const start = useCallback(async () => {
    if (!useAiState.getState().loaded) await useAiState.getState().load();
    const s = useAiState.getState();
    if (!s.enabled) return fail('AI_DISABLED');
    if (!s.vault.mode) return fail('KEY_MISSING');
    const i = buildRef.current();
    if (!i) return;
    input.current = i;
    setResult(null);
    setError(null);
    void import('./runtime').then((rt) => {
      const secs = rt.sectionsOf(feature, i);
      const cats = categoriesIn(secs);
      const remembered = s.consent[feature];
      setSections(secs);
      setInstructions(rt.instructionsOf(feature, i));
      setModel(rt.modelFor(feature));
      setAllowed(
        remembered
          ? cats.filter((c) => remembered.includes(c) || secs.some((x) => x.category === c && x.required))
          : cats,
      );
      setStatus('preview');
    });
  }, [feature, fail]);

  const send = useCallback(
    (o: { overCap?: boolean } = {}) => {
      const s = useAiState.getState();
      void s.update({ consent: { ...s.consent, [feature]: allowed } });
      void execute(allowed, o.overCap ?? false);
    },
    [allowed, execute, feature],
  );

  const cancel = useCallback(() => {
    abort.current?.abort();
    abort.current = null;
    setStatus('idle');
  }, []);

  const reset = useCallback(() => {
    setStatus('idle');
    setResult(null);
    setError(null);
  }, []);

  // Leaving the page cancels the request (no background AI).
  useEffect(() => () => abort.current?.abort(), []);

  // Resume a pending action once the key or models change.
  const keyVersion = useAiState((s) => s.keyVersion);
  const pending = useAiState((s) => s.pending);
  // No dependency list: the input may only become buildable once the page's data has loaded.
  useEffect(() => {
    if (!pending || pending.feature !== feature || keyVersion <= pending.keyVersion) return;
    if (pending.path !== location.pathname + location.search) return;
    const i = buildRef.current();
    if (!i) return;
    useAiState.getState().setPending(null);
    input.current = i;
    if (pending.allowed.length === 0) {
      start();
      return;
    }
    void import('./runtime').then((rt) => {
      setSections(rt.sectionsOf(feature, i));
      setInstructions(rt.instructionsOf(feature, i));
      setModel(rt.modelFor(feature));
      setAllowed(pending.allowed);
      void execute(pending.allowed, false);
    });
  });

  return {
    feature,
    status,
    result,
    error,
    sections,
    instructions,
    model,
    allowed,
    setAllowed,
    start,
    send,
    cancel,
    reset,
  };
}
