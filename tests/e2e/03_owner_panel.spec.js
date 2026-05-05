// 03 - Owner panel: dashboard, productos, clientes, reports
const { test, expect } = require('@playwright/test');
const { USERS, login } = require('./fixtures');

test.describe('Owner panel', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, USERS.owner);
    await page.waitForURL(url => !/login\.html?$/i.test(url.toString()), { timeout: 20_000 });
  });

  test('dashboard visible', async ({ page }) => {
    const r = await page.goto('/volvix_owner_panel_v7.html', { waitUntil: 'domcontentloaded' });
    expect(r.ok()).toBeTruthy();
    const dash = page.locator('[data-testid="dashboard"], #dashboard, .dashboard, text=/dashboard|panel|resumen/i').first();
    await expect(dash).toBeVisible({ timeout: 10_000 });
  });

  test('sección productos', async ({ page }) => {
    await page.goto('/volvix_owner_panel_v7.html');
    const link = page.locator('[data-testid="nav-products"], a:has-text("Productos"), button:has-text("Productos"), [data-section="products"]').first();
    await link.click({ timeout: 8000 }).catch(() => {});
    await expect(page.locator('text=/producto|product|inventario|sku/i').first()).toBeVisible({ timeout: 8000 });
  });

  test('sección clientes', async ({ page }) => {
    await page.goto('/volvix_owner_panel_v7.html');
    const link = page.locator('[data-testid="nav-customers"], a:has-text("Clientes"), button:has-text("Clientes"), [data-section="customers"]').first();
    await link.click({ timeout: 8000 }).catch(() => {});
    await expect(page.locator('text=/cliente|customer|crm/i').first()).toBeVisible({ timeout: 8000 });
  });

  test('sección reports', async ({ page }) => {
    await page.goto('/volvix_owner_panel_v7.html');
    const link = page.locator('[data-testid="nav-reports"], a:has-text("Reportes"), a:has-text("Reports"), [data-section="reports"]').first();
    await link.click({ timeout: 8000 }).catch(() => {});
    await expect(page.locator('text=/reporte|report|ventas|sales/i').first()).toBeVisible({ timeout: 8000 });
  });
});
