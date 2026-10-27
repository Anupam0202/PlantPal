import { createFileRoute, Link } from '@tanstack/react-router';
import { buttonClasses, EmptyState, PageHeader, SeedlingIllustration } from '@plantpal/ui';
import { Page } from '../../app/Page';
import { useT } from '../../i18n';

export const Route = createFileRoute('/garden/')({
  component: GardenIndex,
});

function GardenIndex() {
  const t = useT();
  return (
    <Page>
      <PageHeader title={t.garden.title} />
      <EmptyState
        className="mt-8"
        illustration={<SeedlingIllustration />}
        title={t.garden.emptyTitle}
        description={t.garden.emptyBody}
        action={
          <Link to="/welcome" className={buttonClasses('primary')}>
            {t.today.emptyAction}
          </Link>
        }
      />
    </Page>
  );
}
