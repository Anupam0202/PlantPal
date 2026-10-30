import { Button, Card, Notice, PageHeader, Spinner } from '@plantpal/ui';
import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { Check } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Page } from '../app/Page';
import { useMe } from '../features/account/hooks';
import { useAccountT } from '../features/account/messages';
import { SignInPanel } from '../features/account/SignInPanel';
import { api, ApiError } from '../sync/api';
import { joinWorkspace } from '../sync/engine';
import { requestSync } from '../sync/runner';

export const Route = createFileRoute('/join')({
  component: JoinPage,
});

const http = { push: api.push, pull: api.pull, snapshot: api.snapshot };

/** The invitation token arrives in the URL fragment, so it never reaches a server log. */
const tokenFromHash = () => (typeof location === 'undefined' ? '' : location.hash.replace(/^#/, '').trim());

function JoinPage() {
  const t = useAccountT();
  const { state } = useMe();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [token] = useState(tokenFromHash);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const accept = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api.accept(token);
      const me = await api.me();
      const ws = me.workspaces.find((w) => w.id === r.workspaceId);
      await joinWorkspace(http, { id: r.workspaceId, name: ws?.name ?? 'Shared garden' });
      history.replaceState(null, '', location.pathname);
      await qc.invalidateQueries({ queryKey: ['me'] });
      requestSync();
      toast.success(t.join.joined(ws?.name ?? ''));
      await navigate({ to: '/today' });
    } catch (e) {
      if (e instanceof ApiError && e.status === 410) setError(t.join.used);
      else if (e instanceof ApiError && e.status === 404) setError(t.join.notFound);
      else setError(e instanceof ApiError && e.message ? e.message : t.account.failed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page width="narrow">
      <PageHeader title={t.join.title} description={t.join.body} />
      <div className="mt-6 flex flex-col gap-4">
        {token.length < 20 ? (
          <Notice tone="warning">{t.join.missing}</Notice>
        ) : state.kind === 'loading' ? (
          <Spinner />
        ) : state.kind === 'signed-in' ? (
          <Card className="flex flex-col gap-3">
            <p className="font-medium text-ink">{t.account.signedInAs(state.me.user.name)}</p>
            <Button
              loading={busy}
              onClick={() => void accept()}
              icon={<Check className="size-4" aria-hidden="true" />}
            >
              {t.join.accept}
            </Button>
          </Card>
        ) : state.kind === 'signed-out' ? (
          <SignInPanel />
        ) : (
          <Notice>{state.kind === 'offline' ? t.account.offline : t.account.unavailable}</Notice>
        )}
        {error && (
          <Notice tone="warning" role="alert">
            {error}
          </Notice>
        )}
      </div>
    </Page>
  );
}
