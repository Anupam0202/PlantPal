import { createFileRoute, Link } from '@tanstack/react-router';
import { buttonClasses, EmptyState, PageHeader, SleepingBeeIllustration } from '@plantpal/ui';
import { Page } from '../../app/Page';
import { useT } from '../../i18n';

export const Route = createFileRoute('/nature/')({
  component: NatureIndex,
});

function NatureIndex() {
  const t = useT();
  return (
    <Page>
      <PageHeader title={t.nature.title} />
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
