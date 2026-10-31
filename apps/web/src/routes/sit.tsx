import { Badge, Button, Card, Notice, PageHeader, Spinner } from '@plantpal/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { Bug, Droplets, Sprout } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Page } from '../app/Page';
import { useAccountT } from '../features/account/messages';
import { useFormat } from '../i18n';
import { clockNow } from '../lib/clock';
import { api, ApiError, type SitterKind, type SitterView } from '../sync/api';

export const Route = createFileRoute('/sit')({
  component: SitPage,
});

/** The sitter token arrives in the URL fragment, so it never reaches a server log. */
const tokenFromHash = () => (typeof location === 'undefined' ? '' : location.hash.replace(/^#/, '').trim());

const sameDay = (a: number, b: number) => new Date(a).toDateString() === new Date(b).toDateString();

/** Plant-sitter checklist: no account, no local garden; only what the owner shared (§6.11). */
function SitPage() {
  const t = useAccountT();
  const fmt = useFormat();
  const qc = useQueryClient();
  const [token] = useState(tokenFromHash);
  const [busy, setBusy] = useState<string | null>(null);
  const [now] = useState(clockNow);
  const q = useQuery({
    queryKey: ['sit', token],
    queryFn: () => api.sitterView(token),
    enabled: token.length >= 20,
    retry: false,
  });

  if (token.length < 20)
    return (
      <Page width="narrow">
        <PageHeader title={t.sit.title} />
        <Notice tone="warning" className="mt-6">
          {t.sit.missing}
        </Notice>
      </Page>
    );

  const log = async (specimenId: string, kind: SitterKind) => {
    setBusy(`${specimenId}:${kind}`);
    try {
      await api.sitterCare(token, { specimenId, kind });
      toast.success(t.sit.logged);
      await qc.invalidateQueries({ queryKey: ['sit', token] });
    } catch (e) {
      toast.error(e instanceof ApiError && e.status === 410 ? t.sit.inactive : t.account.failed);
    } finally {
      setBusy(null);
    }
  };

  const view: SitterView | undefined = q.data;
  const zones = view ? [...new Set(view.plants.map((p) => p.zone))] : [];
  const done = (id: string, kind: string) =>
    view?.care.some((c) => c.specimenId === id && c.kind === kind && sameDay(c.occurredAt, now)) ?? false;

  return (
    <Page width="narrow">
      <PageHeader
        title={view ? t.sit.for(view.garden.name) : t.sit.title}
        description={
          view ? `${view.label} · ${t.sit.until(fmt.date(new Date(view.expiresAt - 1)))}` : undefined
        }
      />
      <div className="mt-6 flex flex-col gap-6">
        {q.isPending && <Spinner />}
        {q.isError && <Notice tone="warning">{t.sit.inactive}</Notice>}
        {zones.map((zone) => (
          <section key={zone} aria-labelledby={`zone-${zone}`} className="flex flex-col gap-2">
            <h2 id={`zone-${zone}`} className="text-h3 font-semibold text-ink">
              {zone}
            </h2>
            <ul className="flex flex-col gap-2">
              {view!.plants
                .filter((p) => p.zone === zone)
                .map((p) => (
                  <li key={p.id}>
                    <Card className="flex flex-col gap-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="flex-1 font-medium text-ink">{p.name}</span>
                        <Badge tone={done(p.id, 'water') ? 'accent' : 'neutral'}>
                          {done(p.id, 'water') ? t.sit.today : t.sit.notYet}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {(
                          [
                            ['water', t.sit.watered, Droplets],
                            ['feed', t.sit.fed, Sprout],
                            ['pest-check', t.sit.checked, Bug],
                          ] as const
                        ).map(([kind, label, Icon]) => (
                          <Button
                            key={kind}
                            size="sm"
                            variant={kind === 'water' ? 'primary' : 'secondary'}
                            loading={busy === `${p.id}:${kind}`}
                            aria-label={`${label}: ${p.name}`}
                            icon={<Icon className="size-4" aria-hidden="true" />}
                            onClick={() => void log(p.id, kind)}
                          >
                            {label}
                          </Button>
                        ))}
                      </div>
                    </Card>
                  </li>
                ))}
            </ul>
          </section>
        ))}
        {view && <p className="text-caption text-muted">{t.sit.privacy}</p>}
      </div>
    </Page>
  );
}
