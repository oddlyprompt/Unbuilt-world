import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Tests the STATIC site (the same files GitHub Pages serves) with no studio server at all.
 * Set UW_SITE_URL to test the real deployed URL instead of the local static copy.
 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const live = process.env.UW_SITE_URL;
const chrome = '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome';
const launchOptions = { executablePath: existsSync(chrome) ? chrome : undefined, args: ['--no-sandbox'] };

export default defineConfig({
  testDir: '.',
  testMatch: 'pages.spec.ts',
  timeout: 120_000,
  expect: { timeout: 20_000 },
  workers: 1,
  reporter: [['list']],
  use: { baseURL: live ?? 'http://127.0.0.1:4188/Unbuilt-world/', launchOptions, screenshot: 'only-on-failure' },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
    // Chromium with an iPhone 13 viewport, touch and user agent. This is NOT Safari/WebKit.
    { name: 'iphone-viewport', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium', launchOptions } },
  ],
  webServer: live ? undefined : { command: 'npm run studio:build:pages && node scripts/serve-static.mjs apps/studio/dist-pages 4188 /Unbuilt-world', cwd: root, url: 'http://127.0.0.1:4188/Unbuilt-world/', timeout: 120_000, reuseExistingServer: false },
});
