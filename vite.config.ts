import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
    // L01: never compile a developer Gemini key into public assets.
    // Users bring their own key at runtime; these stay undefined in every build.
    define: {
      'process.env.API_KEY': 'undefined',
      'process.env.GEMINI_API_KEY': 'undefined'
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
        '@components': path.resolve(__dirname, './components'),
        '@services': path.resolve(__dirname, './services'),
      }
    },
    server: {
      port: 3000,
      open: true,
      cors: true
    },
    build: {
      target: 'esnext',
      minify: 'esbuild',
      sourcemap: true,
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ['react', 'react-dom'],
            xlsx: ['xlsx']
          }
        }
      }
    },
    optimizeDeps: {
      include: ['react', 'react-dom', '@google/genai', 'xlsx']
    }
});
