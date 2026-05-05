// 01 - Login: 3 roles + bad creds + token persisted
const { test, expect, request } = require('@playwright/test');
const { USERS, login, getStoredToken } = require('./fixtures');

test.describe('Login', () => {
  for (const role of ['admin', 'owner', 'cajero']) {
    test(`login OK rol=${role}`, async ({ page }) => {
      await login(page, USERS[role]);
      // Espera redirect fuera de /login
      await page.waitForURL(url => !/login\.html?$/i.test(url.toString()), { timeout: 20_000 });
      const token = await getStoredToken(page);
      expect(token, 'token debe estar en storage tras login').toBeTruthy();
      expect(token.length).toBeGreaterThan(10);
    });
  }

  test('login FAIL con credenciales malas → 401', async ({ page, baseURL }) => {
    const apiCtx = await request.newContext({ baseURL });
    const candidates = ['/api/auth/login', '/api/login', '/api/v1/auth/login'];
    let got401 = false;
    for (const path of candidates) {
      const res = await apiCtx.post(path, {
        data: { email: 'noexiste@volvix.test', password: 'WrongPass123!' },
        failOnStatusCode: false,
      });
      if (res.status() === 401) { got401 = true; break; }
      if (res.status() === 403) { got401 = true; break; }
    }
    expect(got401, 'algún endpoint de login debe devolver 401/403 con creds malas').toBeTruthy();
    await apiCtx.dispose();
  });

  test('login UI muestra error con creds malas', async ({ page }) => {
    await login(page, { email: 'malo@volvix.test', password: 'NoPass!' });
    // No debe haber redirect; debe seguir en login O mostrar mensaje de error
    await page.waitForTimeout(2500);
    const stillOnLogin = /login/i.test(page.url());
    const hasError = await page.locator('text=/inv[aá]lid|incorrect|error|fail/i').first().isVisible().catch(() => false);
    expect(stillOnLogin || hasError).toBeTruthy();
  });
});
