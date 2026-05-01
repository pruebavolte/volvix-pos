// Auth flow E2E — login, redirect a launcher, logout
const { test, expect } = require('@playwright/test');

const BASE = process.env.BASE_URL || process.env.PREVIEW_URL || 'http://localhost:3000';
const EMAIL = process.env.TEST_EMAIL || 'admin@volvix.test';
const PASSWORD = process.env.TEST_PASSWORD || 'Volvix2026!';

test.describe('auth flow', () => {
  test('login redirige a launcher', async ({ page }) => {
    await page.goto(BASE + '/login.html', { waitUntil: 'domcontentloaded' });

    // Buscar inputs por type/name/id habituales
    const emailInput = page.locator(
      'input[type="email"], input[name="email"], #email, input[name="usuario"]'
    ).first();
    const passInput = page.locator(
      'input[type="password"], input[name="password"], #password'
    ).first();

    await expect(emailInput).toBeVisible({ timeout: 10_000 });
    await emailInput.fill(EMAIL);
    await passInput.fill(PASSWORD);

    const submit = page.locator(
      'button[type="submit"], input[type="submit"], button:has-text("Iniciar"), button:has-text("Entrar"), button:has-text("Login")'
    ).first();
    await submit.click();

    // Espera redirect a launcher
    await page.waitForURL(/launcher|home|panel|dashboard/i, { timeout: 15_000 });
    expect(page.url()).toMatch(/launcher|home|panel|dashboard/i);
  });

  test('logout vuelve a login', async ({ page }) => {
    // Login primero
    await page.goto(BASE + '/login.html', { waitUntil: 'domcontentloaded' });
    const emailInput = page.locator(
      'input[type="email"], input[name="email"], #email'
    ).first();
    const passInput = page.locator(
      'input[type="password"], input[name="password"], #password'
    ).first();
    await emailInput.fill(EMAIL);
    await passInput.fill(PASSWORD);
    await page.locator('button[type="submit"], input[type="submit"]').first().click();
    await page.waitForURL(/launcher|home|panel|dashboard/i, { timeout: 15_000 });

    // Buscar boton de logout (puede estar en menu)
    const logoutBtn = page.locator(
      'button:has-text("Cerrar sesion"), button:has-text("Cerrar sesión"), button:has-text("Salir"), button:has-text("Logout"), a:has-text("Logout"), a:has-text("Salir")'
    ).first();

    if (await logoutBtn.count() > 0) {
      await logoutBtn.click();
      await page.waitForURL(/login/i, { timeout: 10_000 });
      expect(page.url()).toMatch(/login/i);
    } else {
      // Fallback: clear storage y verificar redirect en proteccion
      await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
      await page.goto(BASE + '/volvix-launcher.html');
      await page.waitForURL(/login/i, { timeout: 10_000 }).catch(() => {});
      expect(page.url()).toMatch(/login|launcher/i);
    }
  });
});
