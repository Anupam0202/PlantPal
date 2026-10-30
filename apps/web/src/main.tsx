// First: the Trusted Types policy must exist before anything registers a worker.
import './lib/trusted-types';
import '@fontsource-variable/fraunces/full.css';
import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import './styles/app.css';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRouter, RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { prefersReducedMotion } from '@plantpal/ui';
import { config as zodConfig } from 'zod';
import { routeTree } from './routeTree.gen';

// Zod would otherwise probe `new Function`, which the Trusted Types CSP blocks (and reports).
zodConfig({ jitless: true });

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 5 * 60_000, refetchOnWindowFocus: false, networkMode: 'offlineFirst' },
  },
});

const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
  scrollRestoration: true,
  defaultViewTransition: !prefersReducedMotion(),
  context: { queryClient },
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

// Background sync for shared gardens; loaded after first paint and idle unless a garden syncs.
void import('./sync/runner').then((m) => m.startSync());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
