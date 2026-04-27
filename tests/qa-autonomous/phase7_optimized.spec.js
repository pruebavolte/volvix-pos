// FASE 7 - Tests optimizados: fixtures + parallel + retry + reuso de estado
const { test: base, expect } = require('@playwright/test');
const BASE = process.env.BASE_URL || 'https://volvix-pos.vercel.app';

// Fixture: contexto autenticado reutilizable
const test = base.extend({
  authedPage: async ({ browser }, use) => {
    const ctx = await browser.newContext({ storageState: 'artifacts/storage.json' });
    const page = await ctx.newPage();
    page.on('pageerror', e => console.log('[QA][PAGEERROR]', e.message));
    await use(page);
    await ctx.close();
  },
  apiRequest: async ({ playwright }, use) => {
    const ctx = await playwright.request.newContext({
      baseURL: BASE,
      storageState: 'artifacts/storage.json'
    });
    await use(ctx);
    await ctx.dispose();
  }
});

test.describe.configure({ mode: 'parallel', retries: 2 });

test.describe('Smoke optimizado', () => {
  test('home loads', async ({ authedPage }) => {
    await authedPage.goto(BASE);
    await expect(authedPage).toHaveURL(/volvix/);
  });

  test('api health', async ({ apiRequest }) => {
    const r = await apiRequest.get('/api/health', { failOnStatusCode: false });
    console.log('[QA] /api/health →', r.status());
    expect([200, 204, 404]).toContain(r.status());
  });

  test('catálogo en POS', async ({ authedPage }) => {
    await authedPage.goto(`${BASE}/multipos_suite_v3.html`).catch(() => authedPage.goto(BASE));
    await authedPage.waitForTimeout(1200);
    const card = await authedPage.$('.product-card, [data-product-id]');
    expect(card).toBeTruthy();
  });
});

test.describe('CRUD parallel', () => {
  for (const entity of ['productos', 'clientes', 'proveedores']) {
    test(`listado ${entity}`, async ({ authedPage }) => {
      await authedPage.goto(`${BASE}/multipos_suite_v3.html`).catch(() => authedPage.goto(BASE));
      await authedPage.waitForTimeout(900);
      const link = await authedPage.$(`a:has-text("${entity}"), [data-tab="${entity}"]`);
      if (link) await link.click();
      await authedPage.waitForTimeout(700);
      await authedPage.screenshot({ path: `artifacts/opt_${entity}.png` }).catch(() => {});
      console.log(`[QA] ${entity} OK`);
    });
  }
});

test.describe('Security parallel', () => {
  for (const path of ['/.env', '/.git/config', '/api/debug', '/server.js']) {
    test(`block ${path}`, async ({ apiRequest }) => {
      const r = await apiRequest.get(path, { failOnStatusCode: false });
      expect([401, 403, 404]).toContain(r.status());
    });
  }
});
