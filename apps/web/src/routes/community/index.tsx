import { createFileRoute } from '@tanstack/react-router';
import { EmptyState, PageHeader } from '@plantpal/ui';
import { Users } from 'lucide-react';
import { Page } from '../../app/Page';
import { useT } from '../../i18n';

export const Route = createFileRoute('/community/')({
  component: CommunityIndex,
});

function CommunityIndex() {
  const t = useT();
  return (
    <Page>
      <PageHeader title={t.community.title} />
      <EmptyState
        className="mt-8"
        illustration={<Users className="size-16" strokeWidth={1.25} aria-hidden="true" />}
        title={t.community.disabledTitle}
        description={t.community.disabledBody}
      />
    </Page>
  );
}
