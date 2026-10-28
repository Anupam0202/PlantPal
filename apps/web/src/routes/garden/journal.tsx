import { createFileRoute } from '@tanstack/react-router';
import { Button, Chip, EmptyState, SeedlingIllustration } from '@plantpal/ui';
import { NotebookPen } from 'lucide-react';
import { useState } from 'react';
import { Page } from '../../app/Page';
import { useActiveGarden, useSpecimens, useTimeline } from '../../data/queries';
import { GardenHeader } from '../../features/garden/GardenHeader';
import { GardenLoading, NoGarden } from '../../features/garden/NoGarden';
import { Timeline } from '../../features/garden/Timeline';
import { useT } from '../../i18n';
import { useCapture } from '../../state/capture';

export const Route = createFileRoute('/garden/journal')({
  component: JournalPage,
});

type Filter = 'all' | 'care' | 'observation' | 'harvest';

function JournalPage() {
  const t = useT();
  const { garden, gardens } = useActiveGarden();
  const items = useTimeline({ gardenId: garden?.id ?? undefined, limit: 500 });
  const specimens = useSpecimens(garden?.id);
  const openCapture = useCapture((s) => s.openCapture);
  const [filter, setFilter] = useState<Filter>('all');

  if (garden === undefined || gardens === undefined)
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

  const shown = (items ?? []).filter((i) => filter === 'all' || i.type === filter);
  const filters: Array<[Filter, string]> = [
    ['all', t.journal.filterAll],
    ['care', t.journal.filterCare],
    ['observation', t.journal.filterNotes],
    ['harvest', t.journal.filterHarvests],
  ];

  return (
    <Page>
      <GardenHeader
        garden={garden}
        gardens={gardens}
        actions={
          <Button onClick={() => openCapture()}>
            <NotebookPen className="size-4" aria-hidden="true" />
            {t.capture.open}
          </Button>
        }
      />
      {items && items.length === 0 ? (
        <EmptyState
          className="mt-8"
          illustration={<SeedlingIllustration />}
          title={t.journal.emptyTitle}
          description={t.journal.emptyBody}
        />
      ) : (
        <div className="mt-6 flex flex-col gap-6">
          <div className="flex flex-wrap gap-2" role="group" aria-label={t.journal.title}>
            {filters.map(([f, label]) => (
              <Chip key={f} pressed={filter === f} onPressedChange={() => setFilter(f)}>
                {label}
              </Chip>
            ))}
          </div>
          <Timeline items={shown} specimens={specimens} timeZone={garden.timezone} />
        </div>
      )}
    </Page>
  );
}
