import { createFileRoute, Link } from '@tanstack/react-router';
import { buttonClasses, EmptyState, PageHeader, SeedlingIllustration } from '@plantpal/ui';
import { Page } from '../app/Page';
import { useT } from '../i18n';

export const Route = createFileRoute('/today')({
  component: TodayPage,
});

function TodayPage() {
  const t = useT();
  return (
    <Page>
      <PageHeader title={t.today.title} />
      <EmptyState
        className="mt-8"
        illustration={<SeedlingIllustration />}
        title={t.today.emptyTitle}
        description={t.today.emptyBody}
        action={
          <Link to="/welcome" className={buttonClasses('primary', 'lg')}>
            {t.today.emptyAction}
          </Link>
        }
      />
    </Page>
  );
}
