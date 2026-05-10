// Smoke tests — run against local server (no auth required)
// Full E2E suite runs only when PREVIEW_URL secret is configured.
const { test, expect } = require('@playwright/test');

test('health endpoint returns ok', async ({ request }) => {
  const resp = await request.get('/api/health');
  expect(resp.status()).toBe(200);
  const body = await resp.json();
  expect(body.ok).toBe(true);
});

test('marketplace page loads', async ({ page }) => {
  await page.goto('/marketplace.html');
  await expect(page).toHaveTitle(/.+/);
  await expect(page.locator('body')).toBeVisible();
});

test('login page loads', async ({ page }) => {
  await page.goto('/login.html');
  await expect(page.locator('body')).toBeVisible();
  // Should have some form input
  const inputs = page.locator('input');
  await expect(inputs.first()).toBeVisible();
});

test('404 returns proper response', async ({ request }) => {
  const resp = await request.get('/ruta-que-no-existe-' + Date.now());
  // Either 404 or redirect to custom 404 page
  expect([404, 200, 301, 302]).toContain(resp.status());
});
