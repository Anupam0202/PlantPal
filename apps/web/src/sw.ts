/// <reference lib="webworker" />
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { clientsClaim } from 'workbox-core';
import { ExpirationPlugin } from 'workbox-expiration';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst, StaleWhileRevalidate } from 'workbox-strategies';

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

// App shell and route chunks.
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// SPA navigations fall back to the cached shell (deep links work offline).
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html'), { denylist: [/^\/api\//] }));

// Self-hosted fonts load per unicode-range on demand and are kept once used.
registerRoute(
  ({ request, url }) => request.destination === 'font' && url.origin === self.location.origin,
  new CacheFirst({
    cacheName: 'pp-fonts',
    plugins: [new ExpirationPlugin({ maxEntries: 40, maxAgeSeconds: 365 * 86400 })],
  }),
);

// Map tiles: cache-first with a size cap. No bulk prefetching (provider policy).
registerRoute(
  ({ url }) => url.hostname === 'tiles.openfreemap.org',
  new CacheFirst({
    cacheName: 'pp-tiles',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 400, maxAgeSeconds: 30 * 86400 }),
    ],
  }),
);

// Remote images (e.g., Wikimedia Commons thumbnails): LRU cache.
registerRoute(
  ({ request, url }) => request.destination === 'image' && url.origin !== self.location.origin,
  new CacheFirst({
    cacheName: 'pp-images',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 60 * 86400 }),
    ],
  }),
);

// Public environmental facts from the gateway: stale-while-revalidate (freshness is shown in the UI).
registerRoute(
  ({ url }) => url.pathname.startsWith('/api/v1/env/') || url.pathname.startsWith('/api/v1/catalog/'),
  new StaleWhileRevalidate({
    cacheName: 'pp-facts',
    plugins: [new ExpirationPlugin({ maxEntries: 300, maxAgeSeconds: 7 * 86400 })],
  }),
);

// The page decides when to activate a new worker (never while a draft is dirty).
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') void self.skipWaiting();
});
clientsClaim();
