import { expect, test } from '@playwright/test';

const BACKEND = 'http://127.0.0.1:4197';
const TOKEN = 'test-token-0123456789abcdef';

test('the backend refuses requests without the token and answers CORS only for the site origin', async ({ request }) => {
  expect((await request.get(`${BACKEND}/api/health`)).status()).toBe(200); // health is open and reveals nothing but "auth required"
  expect((await request.get(`${BACKEND}/api/health`)).headers()['access-control-allow-origin']).toBeUndefined();
  expect((await request.get(`${BACKEND}/api/projects`)).status()).toBe(401);
  expect((await request.get(`${BACKEND}/api/projects`, { headers: { authorization: 'Bearer wrong' } })).status()).toBe(401);
  expect((await request.get(`${BACKEND}/media/cybersyn-pilot/media/generated/audio/sfx_button.wav`)).status()).toBe(401);
  expect((await request.get(`${BACKEND}/api/projects`, { headers: { authorization: `Bearer ${TOKEN}` } })).status()).toBe(200);
  const pre = await request.fetch(`${BACKEND}/api/projects`, { method: 'OPTIONS', headers: { origin: 'http://127.0.0.1:4188', 'access-control-request-method': 'GET', 'access-control-request-headers': 'authorization' } });
  expect(pre.headers()['access-control-allow-origin']).toBe('http://127.0.0.1:4188');
  const evil = await request.fetch(`${BACKEND}/api/projects`, { method: 'OPTIONS', headers: { origin: 'https://evil.example', 'access-control-request-method': 'GET' } });
  expect(evil.headers()['access-control-allow-origin'] ?? '').toBe('');
  const body = JSON.stringify(await (await request.get(`${BACKEND}/api/health`)).json());
  expect(body).not.toMatch(/projects|home|tmp|key/i);
});

test('the website connects to the backend, loads its data, edits it there, and runs a job through it', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('./');
  await expect(page.getByText('demo mode · runs in your browser')).toBeVisible();

  // Wrong token first.
  await page.getByTestId('backend-btn').click();
  await page.getByTestId('backend-url').fill(BACKEND);
  await page.getByTestId('backend-token').fill('nope');
  await page.getByTestId('backend-connect').click();
  await expect(page.getByTestId('backend-msg')).toContainText('rejected the studio token');
  await page.getByTestId('backend-token').fill(TOKEN);
  await page.getByTestId('backend-connect').click();
  await expect(page.getByTestId('backend-msg')).toContainText('Connected');

  // After the reload the same interface shows the BACKEND's projects.
  await expect(page.getByText('backend · 127.0.0.1:4197')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('project-card-cybersyn-pilot')).toContainText('15/15');
  await page.getByTestId('open-cybersyn-pilot').click();
  await expect(page.getByTestId('shot-table').locator('tbody tr')).toHaveCount(19);
  // The mix is built by the backend (a real ffmpeg job), then loaded from it with the token.
  await expect(page.getByTestId('mix-status')).toContainText('current mix loaded', { timeout: 120_000 });

  // Edits go to the backend's files (server revision rises), not browser storage.
  const input = page.getByTestId('duration-input-s05');
  const cur = Number(await input.inputValue());
  await input.fill(String(+(cur + 1).toFixed(2)));
  await input.press('Enter');
  await expect.poll(async () => (await (await page.request.get(`${BACKEND}/api/projects/cybersyn-pilot`, { headers: { authorization: `Bearer ${TOKEN}` } })).json()).project.shots[4].anchor.kind).toBeDefined();
  const s = await (await page.request.get(`${BACKEND}/api/projects/cybersyn-pilot`, { headers: { authorization: `Bearer ${TOKEN}` } })).json();
  expect(s.project.shots[5].anchor.offsetSec).toBeGreaterThan(0.9);
  // The browser-only demo copy (seeded before connecting) was not touched by the edit.
  const demo = await page.evaluate(() => JSON.parse(localStorage.getItem('uw-demo:p:cybersyn-pilot') ?? '{}'));
  expect(demo.shots[5].anchor.offsetSec).toBeLessThan(0.5);

  // A job runs on the backend and reports back to the page.
  await page.goto('./#/p/cybersyn-pilot/audio');
  await page.getByTestId('rebuild-mix').click();
  await expect(page.getByTestId('analysis')).toContainText('LUFS', { timeout: 120_000 });
  expect(errors).toEqual([]);

  // The token lives in this browser only, and is not in any URL the page navigates to.
  expect(page.url()).not.toContain(TOKEN);
});
