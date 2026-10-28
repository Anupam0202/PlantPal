import { createFileRoute, Link } from '@tanstack/react-router';
import { Badge, Card, PageHeader, relativeAge } from '@plantpal/ui';
import { PROVIDERS } from '@plantpal/providers';
import type { ProviderStatus } from '@plantpal/schemas';
import { ExternalLink } from 'lucide-react';
import { Page } from '../../app/Page';
import { useProviderStatus } from '../../env/hooks';
import { envMode } from '../../env/source';
import { useFormat, useT } from '../../i18n';

export const Route = createFileRoute('/settings/sources')({
  component: SourcesPage,
});

function StatusLine({ s }: { s: ProviderStatus | undefined }) {
  const t = useT();
  const f = useFormat();
  if (!s || (!s.lastSuccessAt && !s.lastErrorAt)) return <Badge>{t.env.sources.never}</Badge>;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {!s.enabled && <Badge tone="neutral">{t.env.sources.off}</Badge>}
      {s.circuit !== 'closed' && <Badge tone="warning">{t.env.sources.paused}</Badge>}
      {s.lastSuccessAt && (
        <Badge tone="accent">
          {t.env.sources.lastSuccess}: {relativeAge(s.lastSuccessAt)}
        </Badge>
      )}
      {s.lastErrorAt && (
        <Badge tone="warning">
          {t.env.sources.lastError}: {relativeAge(s.lastErrorAt)}
          {s.lastErrorCode ? ` (${s.lastErrorCode})` : ''}
        </Badge>
      )}
      {s.lastLatencyMs !== null && s.lastLatencyMs > 0 && (
        <Badge>
          {t.env.sources.latency}: {f.number(s.lastLatencyMs)} ms
        </Badge>
      )}
    </div>
  );
}

function SourcesPage() {
  const t = useT();
  const mode = envMode();
  const status = useProviderStatus();
  const byId = new Map((status.data ?? []).map((s) => [s.provider, s]));
  return (
    <Page width="narrow">
      <Link to="/settings" className="mb-3 inline-flex text-body-s text-muted hover:text-ink">
        ← {t.settings.title}
      </Link>
      <PageHeader title={t.env.sources.title} description={t.env.sources.description} />
      <Card padding="md" variant="sunken" className="mt-6">
        <p className="text-body-s text-ink">
          {mode === 'direct'
            ? t.env.sources.modeDirect
            : mode === 'gateway'
              ? t.env.sources.modeGateway
              : t.env.sources.modeDemo}
        </p>
      </Card>
      <ul className="mt-6 flex flex-col gap-3">
        {Object.values(PROVIDERS).map((p) => (
          <Card as="li" key={p.id} padding="md" className="flex flex-col gap-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h2 className="font-medium text-ink">{p.name}</h2>
              <a
                href={p.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-body-s text-accent-ink underline"
              >
                {t.env.sources.website}
                <ExternalLink className="size-3.5" aria-hidden="true" />
              </a>
            </div>
            <p className="text-body-s text-muted">
              {p.attribution} · {p.licence}
            </p>
            <StatusLine s={byId.get(p.id)} />
          </Card>
        ))}
      </ul>
    </Page>
  );
}
