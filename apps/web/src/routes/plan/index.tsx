import { createFileRoute, Link } from '@tanstack/react-router';
import { buttonClasses, EmptyState, MagnifierLeafIllustration, PageHeader } from '@plantpal/ui';
import { Page } from '../../app/Page';
import { useT } from '../../i18n';

export const Route = createFileRoute('/plan/')({
  component: PlanIndex,
});

function PlanIndex() {
  const t = useT();
  return (
    <Page>
      <PageHeader title={t.plan.title} />
      <EmptyState
        className="mt-8"
        illustration={<MagnifierLeafIllustration />}
        title={t.plan.emptyTitle}
        description={t.plan.emptyBody}
        action={
          <Link to="/welcome" className={buttonClasses('primary')}>
            {t.today.emptyAction}
          </Link>
        }
      />
    </Page>
  );
}
