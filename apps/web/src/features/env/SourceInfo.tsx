import { Badge, Button, EvidenceBadge, relativeAge, Sheet } from '@plantpal/ui';
import type { Provenance } from '@plantpal/schemas';
import { formatCoordinates } from '@plantpal/providers';
import { AlertTriangle, Info, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { useFormat, useT } from '../../i18n';

/** Freshness chip for one source: loading, up to date, stale, unavailable (with retry) or demo. */
export function SourceState({
  provenance,
  isPending,
  isError,
  onRetry,
}: {
  provenance?: Provenance;
  isPending: boolean;
  isError: boolean;
  onRetry?: () => void;
}) {
  const t = useT();
  if (isPending) return <Badge tone="neutral">{t.env.state.loading}</Badge>;
  if (isError || !provenance)
    return (
      <span className="inline-flex items-center gap-1.5">
        <Badge tone="warning" icon={<AlertTriangle className="size-3.5" aria-hidden="true" />}>
          {t.env.state.unavailable}
        </Badge>
        {onRetry && (
          <Button size="sm" variant="ghost" onClick={onRetry}>
            <RefreshCw className="size-3.5" aria-hidden="true" />
            {t.env.state.retry}
          </Button>
        )}
      </span>
    );
  if (provenance.demo) return <Badge tone="dusk">{t.env.state.demo}</Badge>;
  if (provenance.stale)
    return <Badge tone="warning">{t.env.state.stale(relativeAge(provenance.retrievedAt))}</Badge>;
  return <Badge tone="accent">{t.env.state.fresh}</Badge>;
}

/** "Source" button opening the provenance drawer (§8.4): provider, model, area, times, licence, attribution. */
export function SourceButton({ provenance, validFor }: { provenance: Provenance; validFor?: string }) {
  const t = useT();
  const f = useFormat();
  const [open, setOpen] = useState(false);
  const rows: Array<[string, string]> = [
    [t.env.provider, provenance.attribution],
    ...(provenance.model ? ([[t.env.model, provenance.model]] as Array<[string, string]>) : []),
    ...(validFor ? ([[t.env.validFor, validFor]] as Array<[string, string]>) : []),
    [t.env.retrieved, f.date(new Date(provenance.retrievedAt), { dateStyle: 'medium', timeStyle: 'short' })],
    ...(provenance.lat !== null && provenance.lon !== null
      ? ([
          [
            t.env.area,
            `${formatCoordinates(provenance.lat, provenance.lon)}${provenance.grid ? ` (${provenance.grid})` : ''}`,
          ],
        ] as Array<[string, string]>)
      : []),
    [t.env.licence, provenance.licence],
  ];
  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        <Info className="size-4" aria-hidden="true" />
        {t.env.source}
      </Button>
      <Sheet open={open} onOpenChange={setOpen} title={t.env.sourceTitle} side="right">
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-2">
            <EvidenceBadge grade="MODELLED" />
          </div>
          <p className="text-body-s text-ink">{provenance.demo ? t.env.demoNote : t.env.modelled}</p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-body-s">
            {rows.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-muted">{k}</dt>
                <dd className="break-words text-ink">{v}</dd>
              </div>
            ))}
          </dl>
          <a
            href={provenance.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-body-s text-accent-ink underline"
          >
            {provenance.sourceUrl}
          </a>
        </div>
      </Sheet>
    </>
  );
}
