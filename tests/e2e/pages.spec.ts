import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const PNG = path.join(os.tmpdir(), 'uw-pages-test.png');
test.beforeAll(() => {
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=0x20c040:s=640x360', '-frames:v', '1', PNG]);
});

test.beforeEach(async ({ page }) => {
  // The site must work without any studio server: any request to an /api path leaving the browser is a bug.
  page.on('request', (r) => {
    if (/\/api\//.test(new URL(r.url()).pathname) && !r.url().startsWith('data:') && !r.url().includes('studio.example.invalid')) throw new Error(`unexpected network call to ${r.url()}`);
  });
});

const noHorizontalScroll = async (page: import('@playwright/test').Page) => {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(over).toBeLessThanOrEqual(2);
};

test('loads, shows the demo project and says it is demo mode', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('./');
  await expect(page.getByTestId('project-card-cybersyn-pilot')).toContainText('The Computer That Almost Ran a Country');
  await expect(page.getByText('demo mode · runs in your browser')).toBeVisible();
  await expect(page.getByTestId('project-card-cybersyn-pilot')).toContainText('15/15');
  await noHorizontalScroll(page);
  expect(errors).toEqual([]);
});

test('the storyboard editor loads with a live preview and the 19 shots', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('./#/p/cybersyn-pilot/storyboard');
  await expect(page.getByTestId('project-title')).toHaveText('The Computer That Almost Ran a Country');
  await expect(page.getByTestId('player')).toBeVisible();
  await expect(page.getByTestId('shot-table').locator('tbody tr')).toHaveCount(19);
  await expect(page.getByTestId('mix-status')).toContainText('matches the current timing');
  // The composition really renders (the player draws the operations room, not a blank box).
  await page.waitForTimeout(2500);
  const px = await page.getByTestId('player').screenshot();
  expect(px.length).toBeGreaterThan(8000);
  await noHorizontalScroll(page);
  expect(errors).toEqual([]);
});

test('editing persists in the browser, the preview follows, and the audio notice becomes honest', async ({ page }) => {
  await page.goto('./#/p/cybersyn-pilot/storyboard');
  await expect(page.getByTestId('shot-table')).toBeVisible();
  const start = async (s: string) => (await page.getByTestId(`shot-row-${s}`).locator('td').nth(1).innerText()).trim();
  const sec = (t: string) => { const [m, s] = t.split(':'); return Number(m) * 60 + Number(s); };
  const before = sec(await start('s06'));
  const input = page.getByTestId('duration-input-s05');
  const cur = Number(await input.inputValue());
  await input.fill(String(+(cur + 1.5).toFixed(2)));
  await input.press('Enter');
  await expect.poll(async () => sec(await start('s06'))).toBeCloseTo(before + 1.5, 0);
  await expect(page.getByTestId('mix-status')).toContainText('re-mixing needs the backend');
  await page.reload();
  await expect.poll(async () => sec(await start('s06'))).toBeCloseTo(before + 1.5, 0);
});

test('asset management: upload an image, assign it to a placeholder shot, replace its file', async ({ page }) => {
  await page.goto('./#/p/cybersyn-pilot/storyboard');
  await page.getByTestId('shot-row-s06').click();
  await page.getByTestId('shot-upload').setInputFiles(PNG);
  await expect(page.getByTestId('toast')).toContainText('Assigned');
  await expect(page.getByTestId('shot-row-s06')).toContainText('uw-pages-test');
  await page.goto('./#/p/cybersyn-pilot/assets');
  const row = page.locator('[data-testid^=asset-row-]').filter({ hasText: 'uw-pages-test' });
  await expect(row).toContainText('license not cleared');
  const id = (await row.getAttribute('data-testid'))!.replace('asset-row-', '');
  await page.getByTestId(`replace-${id}`).setInputFiles(PNG);
  await expect(page.getByTestId('toast')).toContainText('Replaced');
  await page.reload();
  await expect(page.locator(`[data-testid=asset-row-${id}]`)).toBeVisible(); // survived a reload (IndexedDB)
});

test('script export downloads a file; rendering explains that it needs the backend; the real render is playable', async ({ page }) => {
  await page.goto('./#/p/cybersyn-pilot/script');
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export .md' }).click();
  expect((await dl).suggestedFilename()).toBe('cybersyn-pilot-script.md');
  await page.goto('./#/p/cybersyn-pilot/render');
  await expect(page.getByTestId('demo-notice')).toContainText('need ffmpeg and Chromium');
  await page.getByTestId('render-preview').click();
  await expect(page.getByTestId('toast')).toContainText('studio backend');
  const render = page.getByTestId('renders').locator('[data-testid^=render-]').first();
  await expect(render).toContainText('validated');
  await render.getByRole('button', { name: 'Checks and frames' }).click();
  await expect(page.getByText('narration in sync with timeline')).toBeVisible();
  const video = page.getByTestId('result-video');
  await expect(video).toBeVisible();
  await expect.poll(async () => video.evaluate((v: HTMLVideoElement) => v.readyState)).toBeGreaterThanOrEqual(1);
  expect(await video.evaluate((v: HTMLVideoElement) => Math.round(v.duration))).toBe(87);
});

test('connecting a backend validates the address and never stores a key', async ({ page }) => {
  await page.goto('./');
  await page.getByTestId('backend-btn').click();
  // On an https page (the live site) a plain-http backend is refused with an explanation; on the local http copy it is simply unreachable.
  await page.getByTestId('backend-url').fill('https://studio.example.invalid');
  await page.getByTestId('backend-connect').click();
  await expect(page.getByTestId('backend-msg')).toContainText('Could not reach the backend');
  if (new URL(page.url()).protocol === 'https:') {
    await page.getByTestId('backend-url').fill('http://studio.example.invalid');
    await page.getByTestId('backend-connect').click();
    await expect(page.getByTestId('backend-msg')).toContainText('https');
  }
  const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }));
  expect(stored).not.toMatch(/sk-|api[_-]?key/i);
});

test('new project can be created and survives reload; reset restores the pilot', async ({ page }) => {
  await page.goto('./');
  await page.getByTestId('new-title').fill('Phone Test');
  await page.getByTestId('create-project').click();
  await expect(page.getByTestId('project-title')).toHaveText('Phone Test');
  await page.goto('./');
  await expect(page.getByTestId('project-card-phone-test')).toBeVisible();
  page.once('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: 'Reset demo' }).click();
  await expect(page.getByTestId('project-card-cybersyn-pilot')).toBeVisible();
  await expect(page.getByTestId('project-card-phone-test')).toHaveCount(0);
});
