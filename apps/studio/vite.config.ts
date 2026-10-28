import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * Two builds of the same interface:
 *  --mode server  served by the Node studio (apps/studio/dist); no demo data inside
 *  --mode pages   fully static (apps/studio/dist-pages) with the demo project, for GitHub Pages / Vercel
 * Relative asset paths (base './') let it live under any sub-path, such as /Unbuilt-world/.
 */
export default defineConfig(({ mode }) => ({
  root: path.join(here, 'web'),
  base: './',
  plugins: [react()],
  publicDir: mode === 'server' ? false : path.join(here, 'web/public'),
  build: { outDir: path.join(here, mode === 'pages' ? 'dist-pages' : 'dist'), emptyOutDir: true, chunkSizeWarningLimit: 2000 },
  server: { port: 5173, proxy: { '/api': 'http://127.0.0.1:4173', '/media': 'http://127.0.0.1:4173' } },
}));
