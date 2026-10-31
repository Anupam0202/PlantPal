import type { ChatContent, Proposal, ToolUse } from '@plantpal/ai';
import type { AiDataCategory } from '@plantpal/schemas';
import {
  Badge,
  Button,
  buttonClasses,
  Card,
  CheckboxField,
  Notice,
  PageHeader,
  TextField,
} from '@plantpal/ui';
import { createFileRoute, Link } from '@tanstack/react-router';
import { Check, Sparkles, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useAiT } from '../ai/messages';
import { useAiState } from '../ai/state';
import { Page } from '../app/Page';
import { useActiveGarden } from '../data/queries';
import { useCopilotT } from '../features/copilot/messages';
import { GardenLoading, NoGarden } from '../features/garden/NoGarden';
import { usePrefs } from '../state/prefs';

export const Route = createFileRoute('/copilot')({
  component: CopilotPage,
});

const CATEGORIES: Array<Extract<AiDataCategory, 'plants' | 'space' | 'journal' | 'climate'>> = [
  'plants',
  'space',
  'journal',
  'climate',
];

interface Message {
  id: string;
  role: 'user' | 'copilot';
  text: string;
  tools: ToolUse[];
  proposals: Proposal[];
  sources: Array<{ url: string; title: string }>;
  withheld?: boolean;
  error?: { code: string; title: string; body: string };
}

function CopilotPage() {
  const c = useCopilotT();
  const { garden, gardens } = useActiveGarden();
  const ai = useAiState();
  useEffect(() => void useAiState.getState().load(), []);

  if (!ai.loaded || garden === undefined || gardens === undefined)
    return (
      <Page width="narrow">
        <GardenLoading />
      </Page>
    );
  return (
    <Page width="narrow">
      <PageHeader title={c.title} description={c.intro} />
      <div className="mt-6 flex flex-col gap-4">
        {garden === null ? (
          <NoGarden />
        ) : !ai.enabled || !ai.vault.mode ? (
          <Notice
            tone="info"
            action={
              <Link to="/settings/ai" className={buttonClasses('secondary', 'sm')}>
                {c.settings}
              </Link>
            }
          >
            {!ai.enabled ? c.off : c.noKey}
          </Notice>
        ) : (
          <Conversation hemisphere={garden.hemisphere ?? 'unknown'} />
        )}
      </div>
    </Page>
  );
}

function AccessCard({ onDone }: { onDone: () => void }) {
  const c = useCopilotT();
  const saved = useAiState((s) => s.copilot);
  const [allowed, setAllowed] = useState<AiDataCategory[]>(saved?.allowed ?? ['plants', 'space']);
  const [search, setSearch] = useState(saved?.search ?? false);
  const toggle = (cat: AiDataCategory, on: boolean) =>
    setAllowed((a) => (on ? [...new Set([...a, cat])] : a.filter((x) => x !== cat)));
  return (
    <Card className="flex flex-col gap-3">
      <h2 className="text-body font-semibold text-ink">{c.access.title}</h2>
      <p className="text-body-s text-muted">{c.access.intro}</p>
      {CATEGORIES.map((cat) => (
        <CheckboxField
          key={cat}
          label={c.access[cat]}
          checked={allowed.includes(cat)}
          onCheckedChange={(on) => toggle(cat, on)}
        />
      ))}
      <CheckboxField label={c.access.search} checked={search} onCheckedChange={setSearch} />
      <p className="text-caption text-muted">{c.access.catalogue}</p>
      <div>
        <Button
          onClick={async () => {
            await useAiState.getState().update({ copilot: { allowed, search } });
            onDone();
          }}
        >
          {saved ? c.access.done : c.access.save}
        </Button>
      </div>
    </Card>
  );
}

function Conversation({ hemisphere }: { hemisphere: string }) {
  const c = useCopilotT();
  const t = useAiT();
  const locale = usePrefs((s) => s.locale);
  const units = usePrefs((s) => s.units);
  const choice = useAiState((s) => s.copilot);
  const [editing, setEditing] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [history, setHistory] = useState<ChatContent[]>([]);
  const [draft, setDraft] = useState('');
  const [running, setRunning] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const live = useRef<HTMLDivElement>(null);

  if (!choice || editing) return <AccessCard onDone={() => setEditing(false)} />;

  const patchLast = (f: (m: Message) => Message) => setMessages((ms) => [...ms.slice(0, -1), f(ms.at(-1)!)]);

  const ask = async () => {
    const question = draft.trim();
    if (!question || running) return;
    setDraft('');
    setRunning(true);
    const ctl = new AbortController();
    abort.current = ctl;
    const base = { tools: [], proposals: [], sources: [] };
    setMessages((ms) => [
      ...ms,
      { id: crypto.randomUUID(), role: 'user', text: question, ...base },
      { id: crypto.randomUUID(), role: 'copilot', text: '', ...base },
    ]);
    try {
      const rt = await import('../ai/runtime');
      const turn = await rt.copilotSend(
        {
          history,
          message: question,
          policy: { locale, units, seasonModel: `${hemisphere} hemisphere` },
        },
        {
          signal: ctl.signal,
          onText: (chunk) => patchLast((m) => ({ ...m, text: m.text + chunk })),
          onRestart: () => patchLast((m) => ({ ...m, text: '' })),
          onTool: (use) => patchLast((m) => ({ ...m, tools: [...m.tools, use] })),
        },
      );
      setHistory(turn.history);
      patchLast((m) => ({
        ...m,
        text: turn.text,
        proposals: turn.proposals,
        sources: turn.sources,
        withheld: turn.withheld,
        tools: turn.tools,
      }));
    } catch (e) {
      const code = (e as { code?: string }).code ?? 'NETWORK';
      const copy = (t.errors as Record<string, { title: string; body: string }>)[code] ?? t.errors.NETWORK;
      patchLast((m) => ({ ...m, error: { code, ...copy } }));
    } finally {
      setRunning(false);
      abort.current = null;
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
          {c.access.change}
        </Button>
        {messages.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            disabled={running}
            onClick={() => {
              setMessages([]);
              setHistory([]);
            }}
          >
            {c.clear}
          </Button>
        )}
      </div>
      <div ref={live} className="flex flex-col gap-3" aria-live="polite" data-testid="transcript">
        {messages.length === 0 && <p className="text-body-s text-muted">{c.empty}</p>}
        {messages.map((m) => (
          <MessageView key={m.id} m={m} running={running && m === messages.at(-1)} />
        ))}
      </div>
      <Card className="flex flex-col gap-2">
        <TextField
          label={c.composer}
          placeholder={c.placeholder}
          value={draft}
          onValueChange={setDraft}
          multiline
          rows={2}
          maxLength={2000}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button
            icon={<Sparkles className="size-4" aria-hidden="true" />}
            loading={running}
            disabled={!draft.trim()}
            onClick={() => void ask()}
          >
            {c.send}
          </Button>
          {running && (
            <Button variant="ghost" onClick={() => abort.current?.abort()}>
              {c.cancel}
            </Button>
          )}
          <span className="text-caption text-muted">{t.spark}</span>
        </div>
      </Card>
    </div>
  );
}

function MessageView({ m, running }: { m: Message; running: boolean }) {
  const c = useCopilotT();
  if (m.role === 'user')
    return (
      <div className="self-end rounded-lg bg-accent-soft px-4 py-2 text-body text-ink">
        <span className="sr-only">{c.you}: </span>
        {m.text}
      </div>
    );
  const looked = [
    ...new Set(m.tools.filter((u) => u.kind !== 'proposal').map((u) => c.tools[u.name] ?? u.name)),
  ];
  return (
    <div className="flex flex-col gap-2" data-testid="copilot-message">
      <span className="sr-only">{c.copilot}: </span>
      {looked.length > 0 && (
        <p className="text-caption text-muted">
          {c.lookedAt}: {looked.join(', ')}
        </p>
      )}
      {running && !m.text && <p className="text-body-s text-muted">{c.thinking}</p>}
      {m.text && <p className="text-body whitespace-pre-line text-ink [overflow-wrap:anywhere]">{m.text}</p>}
      {m.withheld && <Notice tone="warning">{c.withheld}</Notice>}
      {m.error && (
        <Notice tone="warning" title={m.error.title}>
          {m.error.body}
        </Notice>
      )}
      {m.sources.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-caption">
          <span className="text-muted">{c.sources}:</span>
          {m.sources.map((s, i) => (
            <a
              key={s.url}
              href={s.url}
              target="_blank"
              rel="noreferrer noopener"
              className="rounded-full border border-line px-2 py-0.5 text-accent-ink underline"
            >
              [{i + 1}] {s.title}
            </a>
          ))}
        </div>
      )}
      {m.proposals.map((p) => (
        <ProposalCard key={p.id} p={p} />
      ))}
    </div>
  );
}

function ProposalCard({ p }: { p: Proposal }) {
  const c = useCopilotT();
  const [state, setState] = useState<'open' | 'done' | 'dismissed' | 'stale'>('open');
  const [busy, setBusy] = useState(false);
  return (
    <Card className="flex flex-col gap-2 border-accent" data-testid="proposal">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="accent">{c.proposals.kinds[p.tool]}</Badge>
        <span className="text-caption text-muted">{c.proposals.title}</span>
      </div>
      <p className="text-body text-ink">{p.summary}</p>
      {state === 'open' ? (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            loading={busy}
            icon={<Check className="size-4" aria-hidden="true" />}
            onClick={async () => {
              setBusy(true);
              try {
                const { applyProposal } = await import('../ai/copilotTools');
                const r = await applyProposal(p);
                if (r.ok) {
                  setState('done');
                  toast.success(c.proposals.done);
                } else setState('stale');
              } finally {
                setBusy(false);
              }
            }}
          >
            {c.proposals.confirm}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            icon={<X className="size-4" aria-hidden="true" />}
            onClick={() => setState('dismissed')}
          >
            {c.proposals.dismiss}
          </Button>
        </div>
      ) : (
        <p className="text-body-s text-muted" role="status">
          {state === 'done'
            ? c.proposals.done
            : state === 'dismissed'
              ? c.proposals.dismissed
              : c.proposals.stale}
        </p>
      )}
    </Card>
  );
}
