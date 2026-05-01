// Marketplace flow E2E — search "barberia" -> landing -> CTA -> registro?giro=barberia
const { test, expect } = require('@playwright/test');

const BASE = process.env.BASE_URL || process.env.PREVIEW_URL || 'http://localhost:3000';

test.describe('marketplace flow', () => {
  test('search "barberia" redirige a landing-barberia', async ({ page }) => {
    await page.goto(BASE + '/marketplace.html', { waitUntil: 'domcontentloaded' });

    const search = page.locator(
      'input[type="search"], input[placeholder*="busc" i], input[placeholder*="giro" i], #search, #buscar'
    ).first();

    if (await search.count() > 0) {
      await search.fill('barberia');
      await search.press('Enter');
    } else {
      // Fallback: click directo en card barberia
      const card = page.locator('a:has-text("Barberia"), a:has-text("Barbería"), [data-giro="barberia"]').first();
      if (await card.count() > 0) await card.click();
    }

    await page.waitForURL(/landing-barberia/i, { timeout: 10_000 }).catch(() => {});
    expect(page.url()).toMatch(/barberia/i);
  });

  test('CTA en landing-barberia redirige a registro?giro=barberia', async ({ page }) => {
    await page.goto(BASE + '/landing-barberia.html', { waitUntil: 'domcontentloaded' });

    const cta = page.locator(
      'a:has-text("Empezar"), a:has-text("Registrar"), a:has-text("Comenzar"), a:has-text("Prueba"), button:has-text("Empezar"), button:has-text("Registrar")'
    ).first();

    await expect(cta).toBeVisible({ timeout: 10_000 });
    await cta.click();

    await page.waitForURL(/registro.*giro=barberia/i, { timeout: 10_000 }).catch(() => {});
    expect(page.url()).toMatch(/registro/i);
    expect(page.url()).toMatch(/giro=barberia/i);
  });
});
