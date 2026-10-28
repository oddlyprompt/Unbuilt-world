import { defineConfig } from '@playwright/test';
import { cpSync, existsSync, mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The static website (one origin) talking to a separate backend process (another origin) with a token and CORS:
 * the same arrangement as GitHub Pages + a hosted studio, minus the internet.
 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const work = mkdtempSync(path.join(os.tmpdir(), 'uw-remote-'));
cpSync(path.join(root, 'projects/cybersyn-pilot'), path.join(work, 'projects/cybersyn-pilot'), { recursive: true, filter: (s) => !/[\\/](renders|\.history|\.build|\.studio)([\\/]|$)/.test(s) });
const chrome = '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome';

export const SITE = 'http://127.0.0.1:4188/Unbuilt-world/';
export const BACKEND = 'http://127.0.0.1:4197';
export const TOKEN = 'test-token-0123456789abcdef';
process.env.UW_TEST_BACKEND = BACKEND;
process.env.UW_TEST_TOKEN = TOKEN;

export default defineConfig({
  testDir: '.',
  testMatch: 'remote.spec.ts',
  timeout: 180_000,
  expect: { timeout: 30_000 },
  workers: 1,
  reporter: [['list']],
  use: { baseURL: SITE, viewport: { width: 1440, height: 900 }, launchOptions: { executablePath: existsSync(chrome) ? chrome : undefined, args: ['--no-sandbox'] }, screenshot: 'only-on-failure' },
  webServer: [
    { command: 'npm run studio:build:pages && node scripts/serve-static.mjs apps/studio/dist-pages 4188 /Unbuilt-world', cwd: root, url: SITE, timeout: 120_000, reuseExistingServer: false },
    { command: 'npm run studio', cwd: root, url: `${BACKEND}/api/health`, timeout: 60_000, reuseExistingServer: false, env: { PORT: '4197', UW_PROJECTS_DIR: path.join(work, 'projects'), UW_STATE_DIR: path.join(work, 'state'), UW_STUDIO_TOKEN: TOKEN, UW_ALLOWED_ORIGINS: 'http://127.0.0.1:4188' } },
  ],
});
