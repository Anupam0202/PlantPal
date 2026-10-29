import { createFileRoute, Link } from '@tanstack/react-router';
import {
  Button,
  buttonClasses,
  Card,
  EmptyState,
  Metric,
  Notice,
  PageHeader,
  SeedlingIllustration,
  Skeleton,
} from '@plantpal/ui';
import { NotebookPen } from 'lucide-react';
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Page } from '../app/Page';
import { getMigrationState } from '../data/legacy/run';
import { hasLegacyData } from '../data/legacy/storage';
import { useActiveGarden, useRecordCounts, useSpecimens, useTimeline } from '../data/queries';
import { NextSteps } from '../features/garden/NextSteps';
import { Timeline } from '../features/garden/Timeline';
import {
  AirCard,
  ForecastStrip,
  NoLocation,
  NowDetails,
  PlaceCard,
  WaterOutlook,
} from '../features/env/Conditions';
import { LivingSky } from '../features/env/LivingSky';
import { gardenCoords, useAir, useElevation, useForecast, useSolarClimatology } from '../env/hooks';
import { useT } from '../i18n';
import { useCapture } from '../state/capture';

export const Route = createFileRoute('/today')({
  component: TodayPage,
});

function MigrationBanner() {
  const t = useT();
  const [legacy] = useState(() => hasLegacyData());
  const state = useLiveQuery(async () => (await getMigrationState()) ?? null, [], 'loading' as const);
  if (!legacy || state === 'loading' || state?.status === 'done') return null;
  return (
    <Notice
      tone="info"
      title={t.today.migrateTitle}
      className="mb-6"
      action={
        <Link
          to="/settings/migrate"
          search={{ source: 'browser' }}
          className={buttonClasses('primary', 'sm')}
        >
          {t.today.migrateAction}
        </Link>
      }
    >
      {t.today.migrateBody}
    </Notice>
  );
}

function TodayPage() {
  const t = useT();
  const { garden } = useActiveGarden();
  const items = useTimeline({ gardenId: garden?.id ?? undefined, limit: 6 });
  const specimens = useSpecimens(garden?.id);
  const counts = useRecordCounts(garden?.id);
  const openCapture = useCapture((s) => s.openCapture);
  const coords = gardenCoords(garden);
  const forecast = useForecast(coords);
  const air = useAir(coords);
  const elevation = useElevation(coords);
  const solar = useSolarClimatology(coords);

  if (garden === undefined) {
    return (
      <Page>
        <Skeleton className="h-10 w-64" />
        <Skeleton className="mt-6 h-40 w-full" />
      </Page>
    );
  }

  if (garden === null) {
    return (
      <Page>
        <PageHeader title={t.today.title} />
        <MigrationBanner />
        <EmptyState
          className="mt-8"
          illustration={<SeedlingIllustration />}
          title={t.today.emptyTitle}
          description={t.today.emptyBody}
          action={
            <div className="flex flex-wrap justify-center gap-3">
              <Link to="/welcome" className={buttonClasses('primary', 'lg')}>
                {t.today.emptyAction}
              </Link>
              <Link to="/settings/data" className={buttonClasses('secondary', 'lg')}>
                {t.garden.importData}
              </Link>
            </div>
          }
        />
      </Page>
    );
  }

  return (
    <Page>
      <PageHeader
        eyebrow={t.today.title}
        title={t.today.greeting(garden.name)}
        actions={
          <Button onClick={() => openCapture()}>
            <NotebookPen className="size-4" aria-hidden="true" />
            {t.capture.open}
          </Button>
        }
      />
      <div className="mt-6 flex flex-col gap-6">
        <MigrationBanner />
        <NextSteps garden={garden} />
        {coords ? (
          <>
            <LivingSky garden={garden} forecast={forecast.data}>
              <NowDetails q={forecast} />
            </LivingSky>
            <ForecastStrip q={forecast} />
          </>
        ) : (
          <NoLocation />
        )}
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <Card padding="lg">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="font-display text-h3 text-ink">{t.today.recent}</h2>
              <Link to="/garden/journal" className={buttonClasses('ghost', 'sm')}>
                {t.today.seeJournal}
              </Link>
            </div>
            {items && items.length > 0 ? (
              <Timeline items={items} specimens={specimens} timeZone={garden.timezone} />
            ) : (
              <p className="text-body-s text-muted">{t.today.nothingRecent}</p>
            )}
          </Card>
          <div className="flex flex-col gap-6">
            <Card padding="md" className="grid grid-cols-2 gap-4">
              <Metric label={t.labels.status.active} value={counts ? String(counts.active) : '—'} />
              <Metric label={t.labels.status.planned} value={counts ? String(counts.planned) : '—'} />
            </Card>
            {coords && <AirCard q={air} />}
            {coords && <WaterOutlook q={forecast} />}
          </div>
        </div>
        {coords && <PlaceCard lat={coords.lat} lon={coords.lon} elevation={elevation} solar={solar} />}
        <Card padding="md" variant="sunken">
          <p className="text-body-s text-muted">{t.today.nextSteps}</p>
        </Card>
      </div>
    </Page>
  );
}
