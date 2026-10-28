import { defineConfig } from '@playwright/test';
import { cpSync, existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = 4199;

// The tests run against a COPY of the pilot so they never touch your real project or media.
const work = process.env.UW_E2E_DIR ?? mkdtempSync(path.join(os.tmpdir(), 'uw-e2e-'));
const projects = path.join(work, 'projects');
if (!existsSync(projects)) {
  cpSync(path.join(root, 'projects/cybersyn-pilot'), path.join(projects, 'cybersyn-pilot'), {
    recursive: true,
    filter: (src) => !/[\\/](renders|\.history|\.build|\.studio)([\\/]|$)/.test(src),
  });
  process.env.UW_E2E_DIR = work;
}
void readdirSync;
void rmSync;

const chrome = '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome';

export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.ts',
  timeout: 240_000,
  expect: { timeout: 20_000 },
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    viewport: { width: 1600, height: 1000 },
    launchOptions: { executablePath: existsSync(chrome) ? chrome : undefined, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] },
    screenshot: 'only-on-failure',
    trace: 'off',
  },
  outputDir: path.join(work, 'results'),
  webServer: {
    command: 'npm run studio:build && npm run studio',
    cwd: root,
    url: `http://127.0.0.1:${PORT}/api/health`,
    timeout: 120_000,
    reuseExistingServer: false,
    env: { PORT: String(PORT), UW_PROJECTS_DIR: projects, UW_STATE_DIR: path.join(work, 'state') },
  },
});
