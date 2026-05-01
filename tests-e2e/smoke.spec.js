// Smoke tests — verifica que las URLs principales devuelven 200,
// tienen <title> no vacío y cargan en menos de 3s.
const { test, expect } = require('@playwright/test');

const BASE = process.env.BASE_URL || process.env.PREVIEW_URL || 'http://localhost:3000';

const PAGES = [
  '/',
  '/login.html',
  '/registro.html',
  '/marketplace.html',
  '/landing-cafeteria.html',
  '/salvadorex_web_v25.html',
];

const LOAD_BUDGET_MS = 3000;

for (const path of PAGES) {
  test(`smoke: ${path} responde 200, title no vacio, load < 3s`, async ({ page, request }) => {
    // 1) Status code 200
    const r = await request.get(BASE + path, { failOnStatusCode: false });
    expect(r.status(), `status code para ${path}`).toBe(200);

    // 2) Title no vacio + load time < 3s
    const t0 = Date.now();
    await page.goto(BASE + path, { waitUntil: 'domcontentloaded' });
    const elapsed = Date.now() - t0;

    const title = await page.title();
    expect(title.trim().length, `title de ${path} no debe ser vacio`).toBeGreaterThan(0);

    expect(elapsed, `load time de ${path} debe ser < ${LOAD_BUDGET_MS}ms`).toBeLessThan(LOAD_BUDGET_MS);
  });
}

test('smoke: 404 custom branded', async ({ request }) => {
  const r = await request.get(BASE + '/this-does-not-exist-ci-test.html', { failOnStatusCode: false });
  expect(r.status()).toBe(404);
});
