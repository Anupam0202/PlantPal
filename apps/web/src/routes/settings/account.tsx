import { Badge, Button, Card, Notice, PageHeader, Section, Spinner } from '@plantpal/ui';
import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { ChevronRight, CloudUpload, Download, LogOut, RefreshCw, Users } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Page } from '../../app/Page';
import { db, setMeta } from '../../data/db';
import { ensureWorkspace } from '../../data/commands';
import {
  useConflicts,
  useLocalWorkspaces,
  useMe,
  useOutbox,
  useSyncStatus,
} from '../../features/account/hooks';
import { useAccountT } from '../../features/account/messages';
import { Notifications } from '../../features/account/Notifications';
import { SignInPanel } from '../../features/account/SignInPanel';
import { useFormat } from '../../i18n';
import { downloadBlob } from '../../lib/download';
import { api, ApiError } from '../../sync/api';
import {
  discardUnsent,
  joinWorkspace,
  keepMine,
  keepTheirs,
  queueClaim,
  resumeAfterReview,
  retryUnsent,
} from '../../sync/engine';
import { signOut } from '../../sync/passkey';
import { requestSync } from '../../sync/runner';

export const Route = createFileRoute('/settings/account')({
  component: AccountPage,
});

const http = { push: api.push, pull: api.pull, snapshot: api.snapshot };

function AccountPage() {
  const t = useAccountT();
  const { state } = useMe();
  const qc = useQueryClient();

  return (
    <Page width="narrow">
      <PageHeader title={t.account.title} description={t.account.intro} />
      <div className="mt-6 flex flex-col gap-6">
        {state.kind === 'loading' && <Spinner />}
        {state.kind === 'unavailable' && <Notice>{t.account.unavailable}</Notice>}
        {state.kind === 'offline' && <Notice tone="warning">{t.account.offline}</Notice>}
        {state.kind === 'signed-out' && <SignInPanel />}
        {state.kind === 'signed-in' && (
          <>
            <Card className="flex flex-wrap items-center justify-between gap-3">
              <p className="font-medium text-ink">{t.account.signedInAs(state.me.user.name)}</p>
              <Button
                variant="secondary"
                size="sm"
                icon={<LogOut className="size-4" aria-hidden="true" />}
                onClick={async () => {
                  await signOut().catch(() => undefined);
                  await qc.invalidateQueries({ queryKey: ['me'] });
                  toast(t.account.signedOut);
                }}
              >
                {t.account.signOut}
              </Button>
            </Card>
            <SyncSection serverWorkspaces={state.me.workspaces} />
            <Notifications />
          </>
        )}
        <ReviewSection />
        <ConflictsSection />
        <UnsentSection />
      </div>
    </Page>
  );
}

function SyncSection({
  serverWorkspaces,
}: {
  serverWorkspaces: Array<{ id: string; name: string; role: string }>;
}) {
  const t = useAccountT();
  const fmt = useFormat();
  const status = useSyncStatus();
  const outbox = useOutbox();
  const { active, list } = useLocalWorkspaces();
  const qc = useQueryClient();
  const [claiming, setClaiming] = useState(false);
  const [opening, setOpening] = useState<string | null>(null);
  const current = list?.find((w) => w.id === active);
  const onDevice = new Set(list?.map((w) => w.id));
  const elsewhere = serverWorkspaces.filter((w) => !onDevice.has(w.id));

  const claim = async () => {
    setClaiming(true);
    try {
      const ws = await ensureWorkspace();
      await api.claim(ws.id, ws.name);
      await queueClaim(ws);
      await qc.invalidateQueries({ queryKey: ['me'] });
      requestSync();
      toast.success(t.sync.claimed);
    } catch (e) {
      toast.error(e instanceof ApiError && e.message ? e.message : t.account.failed);
    } finally {
      setClaiming(false);
    }
  };

  const open = async (w: { id: string; name: string }) => {
    setOpening(w.id);
    try {
      if (onDevice.has(w.id)) {
        await setMeta('activeWorkspaceId', w.id);
        await setMeta('activeGardenId', null);
      } else await joinWorkspace(http, w);
      requestSync();
    } catch (e) {
      toast.error(e instanceof ApiError && e.message ? e.message : t.account.failed);
    } finally {
      setOpening(null);
    }
  };

  return (
    <Section title={t.sync.title}>
      <div className="flex flex-col gap-3">
        {current?.mode === 'local' ? (
          <Card className="flex flex-col gap-3">
            <p className="font-medium text-ink">{t.sync.claimTitle}</p>
            <p className="text-body-s text-muted">{t.sync.claimBody}</p>
            <Button
              onClick={() => void claim()}
              loading={claiming}
              icon={<CloudUpload className="size-4" aria-hidden="true" />}
            >
              {claiming ? t.sync.claiming : t.sync.claim}
            </Button>
          </Card>
        ) : (
          <Card className="flex flex-col gap-2">
            <p className="font-medium text-ink" role="status">
              {/* "Up to date" only after a finished sync with nothing left waiting. */}
              {(status?.state ?? 'idle') === 'idle' &&
              (!status?.lastSyncedAt || (outbox?.pending.length ?? 0) > 0)
                ? t.sync.notYet
                : t.sync.states[status?.state ?? 'idle']}
            </p>
            {status?.lastSyncedAt && (
              <p className="text-body-s text-muted">
                {t.sync.lastSynced(
                  fmt.date(new Date(status.lastSyncedAt), {
                    hour: 'numeric',
                    minute: '2-digit',
                    day: 'numeric',
                    month: 'short',
                  }),
                )}
              </p>
            )}
            {(outbox?.pending.length ?? 0) > 0 && (
              <p className="text-body-s text-muted">{t.sync.waiting(outbox!.pending.length)}</p>
            )}
            <div>
              <Button
                variant="secondary"
                size="sm"
                icon={<RefreshCw className="size-4" aria-hidden="true" />}
                onClick={() => requestSync()}
              >
                {t.sync.syncNow}
              </Button>
            </div>
          </Card>
        )}
        {(status?.revoked.length ?? 0) > 0 && <Notice tone="warning">{t.sync.revoked}</Notice>}

        <h3 className="mt-2 text-body-s font-semibold text-ink">{t.sync.workspaces}</h3>
        <ul className="flex flex-col gap-2">
          {[...(list ?? []), ...elsewhere.map((w) => ({ ...w, mode: 'synced' as const, review: false }))].map(
            (w) => (
              <li key={w.id}>
                <Card className="flex flex-wrap items-center gap-3">
                  <span className="flex-1 font-medium text-ink">{w.name}</span>
                  <Badge tone={w.mode === 'synced' ? 'accent' : 'neutral'}>
                    {w.mode === 'synced' ? t.sync.synced : t.sync.localOnly}
                  </Badge>
                  {w.id === active ? (
                    <Badge>{t.sync.current}</Badge>
                  ) : (
                    <Button size="sm" variant="soft" loading={opening === w.id} onClick={() => void open(w)}>
                      {t.sync.switchTo}
                    </Button>
                  )}
                </Card>
              </li>
            ),
          )}
        </ul>
        {current?.mode === 'synced' && (
          <Link
            to="/settings/sharing"
            className="flex items-center gap-3 rounded-lg border border-line bg-surface p-4 shadow-1 transition-colors hover:bg-sunken focus-visible:outline-2 focus-visible:outline-focus"
          >
            <Users className="size-5 text-accent-ink" aria-hidden="true" />
            <span className="flex-1 font-medium text-ink">{t.sharing.title}</span>
            <ChevronRight className="size-5 text-muted" aria-hidden="true" />
          </Link>
        )}
      </div>
    </Section>
  );
}

/** After a snapshot replaced this device's copy, waiting changes pause until the person agrees. */
function ReviewSection() {
  const t = useAccountT();
  const { list } = useLocalWorkspaces();
  const outbox = useOutbox();
  const paused = list?.filter((w) => w.review) ?? [];
  if (paused.length === 0) return null;
  return (
    <Notice
      tone="warning"
      title={t.sync.review.title}
      action={
        <Button
          size="sm"
          onClick={async () => {
            for (const w of paused) await resumeAfterReview(w.id);
            requestSync();
          }}
        >
          {t.sync.review.send}
        </Button>
      }
    >
      <p>{t.sync.review.body}</p>
      <OpList ops={outbox?.pending.filter((o) => paused.some((w) => w.id === o.workspaceId)) ?? []} />
    </Notice>
  );
}

function OpList({ ops }: { ops: Array<{ opId: string; type: string }> }) {
  const t = useAccountT();
  return (
    <ul className="mt-2 list-disc pl-5">
      {ops.slice(0, 20).map((o) => (
        <li key={o.opId}>{t.entities[o.type.split('.')[0] ?? ''] ?? o.type}</li>
      ))}
    </ul>
  );
}

function recordName(r: Record<string, unknown> | null): string {
  if (!r) return '';
  for (const k of ['displayName', 'name', 'title', 'label'])
    if (typeof r[k] === 'string' && r[k]) return r[k] as string;
  return '';
}

function ConflictsSection() {
  const t = useAccountT();
  const list = useConflicts();
  if (!list?.length) return null;
  return (
    <Section title={t.conflicts.title}>
      <p className="mb-3 text-body-s text-muted">{t.conflicts.body}</p>
      <ul className="flex flex-col gap-2">
        {list.map((c) => (
          <li key={c.id}>
            <Card className="flex flex-col gap-2">
              <p className="font-medium text-ink">
                {t.entities[c.entity]}: {recordName(c.theirs) || recordName(c.mine)}
              </p>
              <p className="text-body-s text-muted">
                {c.mine === null ? t.conflicts.deleted : recordName(c.mine)} → {recordName(c.theirs)}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="soft" onClick={() => void keepMine(c.id).then(requestSync)}>
                  {t.conflicts.keepMine}
                </Button>
                <Button size="sm" variant="secondary" onClick={() => void keepTheirs(c.id)}>
                  {t.conflicts.keepTheirs}
                </Button>
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function UnsentSection() {
  const t = useAccountT();
  const outbox = useOutbox();
  const rejected = outbox?.rejected ?? [];
  if (rejected.length === 0) return null;
  return (
    <Section title={t.unsent.title}>
      <p className="mb-3 text-body-s text-muted">{t.unsent.body}</p>
      <ul className="flex flex-col gap-2">
        {rejected.map((o) => (
          <li key={o.opId}>
            <Card className="flex flex-col gap-2">
              <p className="font-medium text-ink">
                {t.entities[o.type.split('.')[0] ?? ''] ?? o.type}
                {recordName(o.payload as Record<string, unknown> | null) &&
                  `: ${recordName(o.payload as Record<string, unknown>)}`}
              </p>
              <p className="text-body-s text-muted">
                {t.unsent.reasons[o.error?.code ?? ''] ?? o.error?.message ?? ''}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="soft" onClick={() => void retryUnsent([o.opId]).then(requestSync)}>
                  {t.unsent.retry}
                </Button>
                <Button size="sm" variant="danger-soft" onClick={() => void discardUnsent([o.opId])}>
                  {t.unsent.discard}
                </Button>
              </div>
            </Card>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="secondary"
          icon={<Download className="size-4" aria-hidden="true" />}
          onClick={async () => {
            const ops = await db.outbox.where('state').equals('rejected').toArray();
            downloadBlob(
              new Blob([JSON.stringify({ kind: 'plantpal.unsent', ops }, null, 2)], {
                type: 'application/json',
              }),
              'plantpal-unsent-changes.json',
            );
          }}
        >
          {t.unsent.export}
        </Button>
        <Button
          size="sm"
          variant="danger-soft"
          onClick={() => void discardUnsent(rejected.map((o) => o.opId))}
        >
          {t.unsent.discardAll}
        </Button>
      </div>
    </Section>
  );
}
