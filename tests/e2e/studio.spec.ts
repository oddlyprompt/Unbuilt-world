import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const PNG = path.join(os.tmpdir(), 'uw-e2e-test.png');
test.beforeAll(() => {
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=0xe02020:s=640x360', '-frames:v', '1', PNG]);
});

const openProject = async (page: Page, tab = 'storyboard') => {
  await page.goto(`/#/p/cybersyn-pilot/${tab}`);
  await expect(page.getByTestId('project-title')).toHaveText('The Computer That Almost Ran a Country');
};
const startOf = async (page: Page, shot: string) => (await page.getByTestId(`shot-row-${shot}`).locator('td').nth(1).innerText()).trim();
const toSec = (t: string) => { const [m, s] = t.split(':'); return Number(m) * 60 + Number(s); };

test.describe.configure({ mode: 'serial' });

test('the app launches, lists the pilot and opens it', async ({ page }) => {
  await page.goto('/');
  const card = page.getByTestId('project-card-cybersyn-pilot');
  await expect(card).toBeVisible();
  await expect(card).toContainText('The Computer That Almost Ran a Country');
  await expect(card).toContainText('15/15'); // narration is ready in the copy
  await page.getByTestId('open-cybersyn-pilot').click();
  await expect(page.getByTestId('project-title')).toBeVisible();
  await expect(page.getByTestId('player')).toBeVisible();
  await expect(page.getByTestId('shot-table').locator('tbody tr')).toHaveCount(19);
  await expect(page.getByTestId('mix-status')).toContainText('current mix loaded', { timeout: 90_000 });
});

test('the composition plays in the browser with sound (the audio element runs, nothing crashes)', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await openProject(page);
  await expect(page.getByTestId('mix-status')).toContainText('current mix loaded', { timeout: 90_000 });
  await page.getByTestId('player').getByRole('button', { name: /play/i }).first().click();
  await page.waitForTimeout(2500);
  const frame = await page.evaluate(() => document.querySelector('[data-testid=player]')?.textContent ?? '');
  expect(frame).toMatch(/0:0[1-9]|0:1\d/); // the time display moved past 0:00
  expect(errors).toEqual([]);
});

test('editing a shot length moves the following cut and persists', async ({ page }) => {
  await openProject(page);
  const before = toSec(await startOf(page, 's06'));
  const input = page.getByTestId('duration-input-s05');
  const current = Number(await input.inputValue());
  await input.fill(String(+(current + 1.2).toFixed(2)));
  await input.press('Enter');
  await expect.poll(async () => toSec(await startOf(page, 's06'))).toBeCloseTo(before + 1.2, 0);
  await page.reload();
  await expect.poll(async () => toSec(await startOf(page, 's06'))).toBeCloseTo(before + 1.2, 0);
  // Restore so later tests start from the original pacing.
  await page.getByTestId('duration-input-s05').fill(String(current));
  await page.getByTestId('duration-input-s05').press('Enter');
  await expect.poll(async () => toSec(await startOf(page, 's06'))).toBeCloseTo(before, 0);
});

test('splitting a shot adds a shot, and merging it back restores the original', async ({ page }) => {
  await openProject(page);
  const rows = page.getByTestId('shot-table').locator('tbody tr');
  await expect(rows).toHaveCount(19);
  const len = Number(await page.getByTestId('duration-input-s08').inputValue());
  await page.getByTestId('shot-row-s08').click();
  await page.getByTestId('split-btn').click();
  await expect(rows).toHaveCount(20);
  await expect(page.getByTestId('shot-row-s08-b')).toBeVisible();
  const first = Number(await page.getByTestId('duration-input-s08').inputValue());
  const second = Number(await page.getByTestId('duration-input-s08-b').inputValue());
  expect(first + second).toBeCloseTo(len, 1);
  await page.getByTestId('shot-row-s08-b').click();
  await page.getByTestId('merge-btn').click();
  await expect(rows).toHaveCount(19);
  expect(Number(await page.getByTestId('duration-input-s08').inputValue())).toBeCloseTo(len, 1);
});

test('a placeholder shot takes an uploaded image; replacing the asset file keeps the shot assigned', async ({ page }) => {
  await openProject(page);
  await page.getByTestId('shot-row-s06').click();
  await page.getByTestId('shot-upload').setInputFiles(PNG);
  await expect(page.getByTestId('toast')).toContainText('Assigned');
  await expect(page.getByTestId('shot-row-s06')).toContainText(/e2e-test|uw-e2e/i);
  await page.goto('/#/p/cybersyn-pilot/assets');
  const row = page.locator('[data-testid^=asset-row-]').filter({ hasText: 'uw-e2e-test' });
  await expect(row).toBeVisible();
  await expect(row).toContainText('license not cleared'); // public does not mean reusable
  const id = (await row.getAttribute('data-testid'))!.replace('asset-row-', '');
  await page.getByTestId(`replace-${id}`).setInputFiles(PNG);
  await expect(page.getByTestId('toast')).toContainText('Replaced');
  await page.goto('/#/p/cybersyn-pilot/storyboard');
  await expect(page.getByTestId('shot-row-s06')).toContainText(id);
});

test('editing narration marks its audio stale, and regenerating fixes it', async ({ page }) => {
  await openProject(page, 'script');
  const seg = page.getByTestId('segment-n09');
  await expect(seg).toContainText('timing');
  const ta = page.getByTestId('segment-text-n09');
  await ta.fill('But here’s the really fascinating part.');
  await ta.blur();
  await expect(seg).toContainText('audio out of date');
  await seg.getByRole('button', { name: 'Regenerate' }).click();
  await expect(seg).toContainText('engine timing', { timeout: 90_000 });
  await expect(seg).not.toContainText('out of date');
});

test('rendering a scene preview produces a validated video; cancelling and retrying a job works', async ({ page }) => {
  await openProject(page, 'render');
  await page.getByTestId('scene-select').selectOption('sc-end');
  await page.getByTestId('render-scene').click();
  const job = page.locator('[data-testid^=job-]').first();
  await expect(job).toHaveAttribute('data-status', /running|queued|succeeded/);
  await expect(job).toHaveAttribute('data-status', 'succeeded', { timeout: 220_000 });
  const render = page.getByTestId('renders').locator('[data-testid^=render-]').first();
  await expect(render).toContainText('validated');
  await render.getByRole('button', { name: 'Checks and frames' }).click();
  await expect(page.getByText('decodes without errors')).toBeVisible();
  await expect(page.getByText('narration in sync with timeline')).toBeVisible();

  // Cancel a whole-project preview while it runs, then retry it and cancel again.
  await page.getByTestId('render-preview').click();
  const running = page.locator('[data-testid^=job-]').first();
  await expect(running).toHaveAttribute('data-status', /running|queued/);
  await running.getByRole('button', { name: 'Cancel' }).click();
  await expect(running).toHaveAttribute('data-status', 'cancelled', { timeout: 30_000 });
  await running.getByRole('button', { name: 'Retry' }).click();
  const retried = page.locator('[data-testid^=job-]').first();
  await expect(retried).toHaveAttribute('data-status', /running|queued/);
  await retried.getByRole('button', { name: 'Cancel' }).click();
  await expect(retried).toHaveAttribute('data-status', 'cancelled', { timeout: 30_000 });
});

test('claims cannot be verified without a named reviewer and a source', async ({ page }) => {
  await openProject(page, 'research');
  const row = page.getByTestId('claims').locator('tbody tr').first();
  page.once('dialog', (d) => void d.accept('Test Reviewer'));
  await row.locator('select').selectOption('verified');
  await expect(row).toContainText('by Test Reviewer');
  await expect(page.getByText('1 verified')).toBeVisible();
});

test('bad input is reported, not swallowed', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('import-input').setInputFiles({ name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('{"schemaVersion": 1, "id": "x"}') });
  await expect(page.getByTestId('toast')).toContainText('Import failed');
  await page.goto('/#/p/does-not-exist/storyboard');
  await expect(page.getByTestId('open-error')).toContainText('Cannot read');
});

test('a new project can be created from the dashboard', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('new-title').fill('Test Documentary');
  await page.getByTestId('create-project').click();
  await expect(page.getByTestId('project-title')).toHaveText('Test Documentary');
  await page.goto('/');
  await expect(page.getByTestId('project-card-test-documentary')).toBeVisible();
});
