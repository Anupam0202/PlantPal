import {
  Badge,
  Button,
  Card,
  EmptyState,
  NumberInput,
  PageHeader,
  Section,
  Spinner,
  TextField,
} from '@plantpal/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { ShieldAlert } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Page } from '../app/Page';
import { community, type Appeal, type QueueItem } from '../community/api';
import { CommunityGate } from '../features/community/CommunityGate';
import { problemText } from '../features/community/hooks';
import { useCommunityT } from '../features/community/messages';
import { useFormat } from '../i18n';

export const Route = createFileRoute('/admin')({
  component: AdminPage,
});

const ADMIN_KEY = ['community-admin'] as const;

/** Moderator queue, appeals and audit log (§20). The server checks the role on every call. */
function AdminPage() {
  const c = useCommunityT();
  return (
    <Page>
      <PageHeader title={c.admin.title} description={c.admin.intro} />
      <CommunityGate>
        {(me) =>
          me.staff ? (
            <Moderation />
          ) : (
            <EmptyState
              className="mt-8"
              illustration={<ShieldAlert className="size-14" strokeWidth={1.25} aria-hidden="true" />}
              title={c.admin.forbidden}
            />
          )
        }
      </CommunityGate>
    </Page>
  );
}

function Moderation() {
  const c = useCommunityT();
  const fmt = useFormat();
  const queue = useQuery({ queryKey: [...ADMIN_KEY, 'queue'], queryFn: community.queue });
  const audit = useQuery({ queryKey: [...ADMIN_KEY, 'audit'], queryFn: community.audit });
  if (queue.isPending) return <Spinner />;
  const items = queue.data?.items ?? [];
  const appeals = queue.data?.appeals ?? [];
  const log = audit.data?.actions ?? [];
  return (
    <div className="mt-6 flex flex-col gap-8">
      <Section title={c.admin.queue} headingLevel={2}>
        {items.length === 0 ? (
          <p className="text-body-s text-muted">{c.admin.queueEmpty}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {items.map((it) => (
              <li key={`${it.type}:${it.id}`}>
                <QueueCard item={it} />
              </li>
            ))}
          </ul>
        )}
      </Section>
      <Section title={c.admin.appeals} headingLevel={2}>
        {appeals.length === 0 ? (
          <p className="text-body-s text-muted">{c.admin.appealsEmpty}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {appeals.map((a) => (
              <li key={a.id}>
                <AppealCard appeal={a} />
              </li>
            ))}
          </ul>
        )}
      </Section>
      <Section title={c.admin.audit} headingLevel={2}>
        {log.length === 0 ? (
          <p className="text-body-s text-muted">{c.admin.auditEmpty}</p>
        ) : (
          <ol className="flex flex-col gap-2 text-body-s" data-testid="audit-log">
            {log.map((a) => (
              <li key={a.id} className="flex flex-wrap gap-x-2 border-b border-line pb-2">
                <time className="text-muted" dateTime={new Date(a.createdAt).toISOString()}>
                  {fmt.date(new Date(a.createdAt), { dateStyle: 'medium', timeStyle: 'short' })}
                </time>
                <span className="font-medium text-ink">{a.action}</span>
                <span className="text-muted">
                  {a.targetType} {a.targetId.slice(-6)}
                </span>
                <span className="text-ink">{a.reason}</span>
              </li>
            ))}
          </ol>
        )}
      </Section>
    </div>
  );
}

function QueueCard({ item }: { item: QueueItem }) {
  const c = useCommunityT();
  const qc = useQueryClient();
  const [reason, setReason] = useState('');
  const [days, setDays] = useState<number | null>(7);
  const [busy, setBusy] = useState<string | null>(null);
  const act = async (action: string, onUser = false) => {
    setBusy(action);
    try {
      await community.moderate({
        action,
        targetType: onUser ? 'user' : item.type,
        targetId: onUser ? item.authorId : item.id,
        reason: reason.trim(),
        ...(action === 'suspend' && days ? { days } : {}),
      });
      toast.success(c.admin.done);
      await qc.invalidateQueries({ queryKey: ADMIN_KEY });
    } catch (e) {
      toast.error(problemText(e, c.failed));
    } finally {
      setBusy(null);
    }
  };
  const ready = reason.trim().length > 0 && busy === null;
  const button = (
    action: string,
    label: string,
    onUser = false,
    variant: 'secondary' | 'danger-soft' = 'secondary',
  ) => (
    <Button
      size="sm"
      variant={variant}
      loading={busy === action}
      disabled={!ready}
      onClick={() => void act(action, onUser)}
    >
      {label}
    </Button>
  );
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge>{c.contentTypes[item.type]}</Badge>
        {item.visibility === 'hidden' && <Badge tone="warning">{c.hidden}</Badge>}
        {item.reports > 0 && <Badge tone="danger">{c.admin.reports(item.reports)}</Badge>}
        {item.reasons && (
          <span className="text-caption text-muted">
            {item.reasons
              .split(',')
              .map((r) => c.report.reasons[r as keyof typeof c.report.reasons] ?? r)
              .join(' · ')}
          </span>
        )}
      </div>
      <p className="text-body-s whitespace-pre-line text-ink [overflow-wrap:anywhere]">{item.text}</p>
      <TextField label={c.admin.reason} value={reason} onValueChange={setReason} maxLength={500} />
      <div className="flex flex-wrap gap-2">
        {button('unhide', c.admin.keep)}
        {item.visibility !== 'hidden' && button('hide', c.admin.hide)}
        {button('remove', c.admin.remove, false, 'danger-soft')}
        {button('warn', c.admin.warn)}
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <NumberInput
          label={c.admin.days}
          value={days}
          onValueChange={setDays}
          min={1}
          max={365}
          step={1}
          className="w-36"
        />
        {button('suspend', c.admin.suspend, true, 'danger-soft')}
        {button('ban', c.admin.ban, true, 'danger-soft')}
      </div>
    </Card>
  );
}

function AppealCard({ appeal: a }: { appeal: Appeal }) {
  const c = useCommunityT();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const decide = async (decision: 'upheld' | 'overturned') => {
    setBusy(true);
    try {
      await community.decide(a.id, decision);
      toast.success(c.admin.done);
      await qc.invalidateQueries({ queryKey: ADMIN_KEY });
    } catch (e) {
      toast.error(problemText(e, c.failed));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="warning">{c.notices.actions[a.action] ?? a.action}</Badge>
        <span className="text-caption text-muted">{a.reason}</span>
      </div>
      <p className="text-body-s whitespace-pre-line text-ink [overflow-wrap:anywhere]">{a.body}</p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" disabled={busy} onClick={() => void decide('upheld')}>
          {c.admin.uphold}
        </Button>
        <Button size="sm" disabled={busy} onClick={() => void decide('overturned')}>
          {c.admin.overturn}
        </Button>
      </div>
    </Card>
  );
}
