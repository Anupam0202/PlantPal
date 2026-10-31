import { createFileRoute, Link } from '@tanstack/react-router';
import { Badge, buttonClasses, EmptyState, MagnifierLeafIllustration } from '@plantpal/ui';
import { HeartPulse, Plus } from 'lucide-react';
import { Page } from '../../../app/Page';
import { useActiveGarden, useHealthCases, useSpecimens } from '../../../data/queries';
import { GardenHeader } from '../../../features/garden/GardenHeader';
import { GardenLoading, NoGarden } from '../../../features/garden/NoGarden';
import { useHealthT } from '../../../features/health/messages';
import { useFormat } from '../../../i18n';

export const Route = createFileRoute('/garden/health/')({
  component: HealthList,
});

function HealthList() {
  const m = useHealthT();
  const fmt = useFormat();
  const { garden, gardens } = useActiveGarden();
  const cases = useHealthCases(garden?.id);
  const specimens = useSpecimens(garden?.id);
  if (garden === undefined || (garden && cases === undefined))
    return (
      <Page>
        <GardenLoading />
      </Page>
    );
  if (garden === null)
    return (
      <Page>
        <NoGarden />
      </Page>
    );
  const name = (id: string | null) => specimens?.find((s) => s.id === id)?.displayName ?? null;
  return (
    <Page>
      <GardenHeader
        garden={garden}
        gardens={gardens ?? [garden]}
        actions={
          <Link to="/garden/health/new" className={buttonClasses('primary')}>
            <Plus className="size-4" aria-hidden="true" />
            {m.newCase}
          </Link>
        }
      />
      <p className="mt-4 text-body-s text-muted">{m.description}</p>
      {cases && cases.length > 0 ? (
        <ul className="mt-4 flex flex-col gap-2" data-testid="health-cases">
          {cases.map((c) => (
            <li key={c.id}>
              <Link
                to="/garden/health/$caseId"
                params={{ caseId: c.id }}
                className="flex items-center gap-3 rounded-lg border border-line bg-surface p-4 shadow-1 hover:bg-sunken"
              >
                <HeartPulse className="size-5 text-accent-ink" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-ink">{name(c.specimenId) ?? c.title}</span>
                  <span className="block text-caption text-muted">
                    {m.opened(fmt.date(new Date(c.openedAt)))}
                  </span>
                </span>
                <Badge tone={c.status === 'closed' ? 'neutral' : 'warning'}>{m.status[c.status]}</Badge>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          className="mt-8"
          illustration={<MagnifierLeafIllustration />}
          title={m.emptyTitle}
          description={m.emptyBody}
          action={
            <Link to="/garden/health/new" className={buttonClasses('primary')}>
              {m.newCase}
            </Link>
          }
        />
      )}
    </Page>
  );
}
