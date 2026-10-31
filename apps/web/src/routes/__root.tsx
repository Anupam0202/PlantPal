import type { QueryClient } from '@tanstack/react-query';
import { createRootRouteWithContext, Link, Outlet } from '@tanstack/react-router';
import { buttonClasses, EmptyState, MagnifierLeafIllustration } from '@plantpal/ui';
import { AppShell } from '../app/AppShell';
import { Page } from '../app/Page';
import { useT } from '../i18n';

export interface RouterContext {
  queryClient: QueryClient;
}

function NotFound() {
  const t = useT();
  return (
    <Page width="narrow">
      <EmptyState
        illustration={<MagnifierLeafIllustration />}
        title={t.notFound.title}
        description={t.notFound.body}
        action={
          <Link to="/today" className={buttonClasses('primary')}>
            {t.notFound.home}
          </Link>
        }
      />
    </Page>
  );
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
  notFoundComponent: NotFound,
});
