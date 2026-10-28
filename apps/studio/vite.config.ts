import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: path.join(here, 'web'),
  plugins: [react()],
  build: { outDir: path.join(here, 'dist'), emptyOutDir: true, chunkSizeWarningLimit: 2000 },
  server: { port: 5173, proxy: { '/api': 'http://127.0.0.1:4173', '/media': 'http://127.0.0.1:4173' } },
});
