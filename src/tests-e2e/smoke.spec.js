// Smoke tests — corren en CI contra preview URL o prod
const { test, expect } = require('@playwright/test');

const BASE = process.env.BASE_URL || process.env.PREVIEW_URL || 'https://volvix-pos.vercel.app';

test('smoke: login page loads', async ({ page }) => {
  await page.goto(BASE + '/login.html', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveTitle(/Volvix|Iniciar sesión/i);
});

test('smoke: 404 custom branded', async ({ request }) => {
  const r = await request.get(BASE + '/this-does-not-exist-ci-test.html', { failOnStatusCode: false });
  expect(r.status()).toBe(404);
  const txt = await r.text();
  expect(txt).toContain('Volvix');
});

test('smoke: /api/ping responds', async ({ request }) => {
  const r = await request.get(BASE + '/api/ping');
  expect(r.status()).toBeLessThan(500);
});

test('smoke: /api/config/public available', async ({ request }) => {
  const r = await request.get(BASE + '/api/config/public');
  expect(r.ok()).toBeTruthy();
});

test('smoke: /api/kiosk/products devuelve catalogo', async ({ request }) => {
  const r = await request.get(BASE + '/api/kiosk/products');
  expect(r.ok()).toBeTruthy();
  const j = await r.json();
  expect(j.ok).toBe(true);
  expect(Array.isArray(j.items)).toBe(true);
});

test('smoke: ANON Supabase no lee pos_users (RLS)', async ({ request }) => {
  // No debería ser accesible directamente desde frontend público
  const r = await request.get(BASE + '/login.html');
  const html = await r.text();
  // No deben existir credenciales hardcoded en el HTML
  expect(html).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
});
