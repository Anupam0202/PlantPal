import { createFileRoute, redirect } from '@tanstack/react-router';

/** `/community/exchange` is the Exchange tab of the community page. */
export const Route = createFileRoute('/community/exchange/')({
  beforeLoad: () => {
    throw redirect({ to: '/community', search: { tab: 'exchange' }, replace: true });
  },
});
