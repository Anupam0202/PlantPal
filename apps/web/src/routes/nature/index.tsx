import { createFileRoute, Link } from '@tanstack/react-router';
import { buttonClasses, Card, EmptyState, PageHeader, SleepingBeeIllustration } from '@plantpal/ui';
import { ChevronRight, Thermometer } from 'lucide-react';
import { useCareT } from '../../features/care/messages';
import { Page } from '../../app/Page';
import { useT } from '../../i18n';

export const Route = createFileRoute('/nature/')({
  component: NatureIndex,
});

function NatureIndex() {
  const t = useT();
  const m = useCareT();
  return (
    <Page>
      <PageHeader title={t.nature.title} />
      <Card as="section" padding="none" className="mt-6">
        <Link
          to="/nature/climate"
          className="flex min-h-16 items-center gap-3 rounded-lg p-4 hover:bg-sunken focus-visible:outline-2 focus-visible:outline-focus"
        >
          <Thermometer className="size-6 text-clay" aria-hidden="true" />
          <span className="flex-1">
            <span className="block font-semibold text-ink">{m.climate.title}</span>
            <span className="block text-body-s text-muted">{m.climate.description}</span>
          </span>
          <ChevronRight className="size-5 text-subtle" aria-hidden="true" />
        </Link>
      </Card>
      <EmptyState
        className="mt-8"
        illustration={<SleepingBeeIllustration />}
        title={t.nature.emptyTitle}
        description={t.nature.emptyBody}
        action={
          <Link to="/welcome" className={buttonClasses('primary')}>
            {t.today.emptyAction}
          </Link>
        }
      />
    </Page>
  );
}
