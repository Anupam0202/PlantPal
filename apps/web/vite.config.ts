import { tanstackRouter } from '@tanstack/router-plugin/vite';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// Mirror production security headers in `vite preview` so E2E tests run under the real CSP.
interface VercelHeaders {
  headers: Array<{ source: string; headers: Array<{ key: string; value: string }> }>;
}
const vercel = JSON.parse(
  readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8'),
) as VercelHeaders;
const securityHeaders = Object.fromEntries(
  (vercel.headers.find((h) => h.source === '/(.*)')?.headers ?? [])
    .filter((h) => h.key !== 'Strict-Transport-Security')
    .map((h) => [h.key, h.value]),
);

export default defineConfig({
  plugins: [
    tanstackRouter({ target: 'react', autoCodeSplitting: true, quoteStyle: 'single' }),
    react(),
    tailwindcss(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'prompt',
      injectRegister: false,
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,webmanifest,png}'],
        // The design-system gallery is for development and previews; it is not precached.
        globIgnores: ['**/assets/design-system-*.js'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
      },
      manifest: {
        name: 'PlantPal — living field guide for small gardens',
        short_name: 'PlantPal',
        description:
          'Know what will thrive in your exact space, care for it with confidence, and see the nature you bring back.',
        start_url: '/today',
        scope: '/',
        display: 'standalone',
        background_color: '#f5f2e9',
        theme_color: '#2f6b45',
        categories: ['lifestyle', 'education', 'productivity'],
        icons: [
          { src: '/icons/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [
          { name: 'Today', url: '/today' },
          { name: 'Log care', url: '/today?capture=care' },
          { name: 'New observation', url: '/today?capture=observe' },
        ],
        share_target: {
          action: '/share-target',
          method: 'GET',
          params: { title: 'title', text: 'text', url: 'url' },
        },
      },
      devOptions: { enabled: false },
    }),
  ],
  build: {
    target: 'es2022',
    // Never inline assets as data: URIs; the CSP only allows same-origin fonts and scripts.
    assetsInlineLimit: 0,
    sourcemap: 'hidden',
    chunkSizeWarningLimit: 400,
  },
  server: { port: 5173, strictPort: false },
  preview: { port: 4173, headers: securityHeaders },
});
