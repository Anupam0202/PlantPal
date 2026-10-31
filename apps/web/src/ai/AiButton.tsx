import { Button, Spinner, Tooltip, type ButtonProps } from '@plantpal/ui';
import { Sparkles } from 'lucide-react';
import { lazy, Suspense, useEffect } from 'react';
import { useAiT } from './messages';
import { useAiState } from './state';
import type { AiAction } from './useAiAction';

const AiFlowPanel = lazy(() => import('./AiFlow'));

/** The one spark entry point for AI (§18.7). Hidden when AI is switched off. */
export function AiButton<T>({
  ai,
  label,
  size = 'sm',
  variant = 'secondary',
}: {
  ai: AiAction<T>;
  label: string;
  size?: ButtonProps['size'];
  variant?: ButtonProps['variant'];
}) {
  const t = useAiT();
  const loaded = useAiState((s) => s.loaded);
  const on = useAiState((s) => s.loaded && s.enabled);
  useEffect(() => {
    if (!loaded) void useAiState.getState().load();
  }, [loaded]);
  if (!on) return null;
  const busy = ai.status === 'running';
  return (
    <Tooltip content={t.spark}>
      <Button
        type="button"
        size={size}
        variant={variant}
        onClick={() => void ai.start()}
        disabled={busy || ai.status === 'preview'}
        data-ai-entry=""
      >
        {busy ? <Spinner /> : <Sparkles className="size-4" aria-hidden="true" />}
        {label}
      </Button>
    </Tooltip>
  );
}

/** Preview, progress and error panel for an action; loads its code only when needed. */
export function AiFlow<T>({ ai, fallback }: { ai: AiAction<T>; fallback?: string }) {
  if (ai.status === 'idle' || ai.status === 'done') return null;
  return (
    <Suspense fallback={null}>
      <AiFlowPanel ai={ai as AiAction<unknown>} fallback={fallback} />
    </Suspense>
  );
}
