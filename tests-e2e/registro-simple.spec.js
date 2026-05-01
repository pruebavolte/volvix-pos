// tests-e2e/registro-simple.spec.js
// E2E: registro simplificado (teléfono + contraseña + giro autocomplete con sinónimos).
// Verifica:
//   1) /registro.html carga
//   2) input de teléfono acepta 10 dígitos
//   3) autocomplete de giro: "tacos" sugiere taqueria/restaurante
//   4) selección de taqueria
//   5) password con confirm
//   6) submit → backend retorna dev_code (NODE_ENV != production)
//   7) auto-fill del OTP con dev_code
//   8) verify-simple → step 3 con tenant_id visible
//   9) localStorage tiene volvix_token y volvix_session
//  10) (opcional) pos_companies tiene row con giro=taqueria
//
// Run con servidor local:  PORT=3000 node server.js  &  BASE_URL=http://localhost:3000 npx playwright test registro-simple

const { test, expect } = require('@playwright/test');

// Genera 10 dígitos únicos para no chocar con phone_taken (incluye marca de test "55" + ts last 8)
function uniquePhone() {
  const ts = String(Date.now()).slice(-8);
  return '55' + ts;
}

test.describe('Registro simplificado (phone + password + giro autocomplete)', () => {
  test('flow completo: tacos → taqueria → OTP dev → launcher', async ({ page, request }) => {
    const phone10 = uniquePhone();
    const negocio = 'Tacos Test ' + Date.now();

    // 1) Visit /registro.html
    await page.goto('/registro.html');
    await expect(page.locator('h1')).toContainText('Crea tu cuenta');

    // 2) Phone (10 dígitos)
    const phoneInput = page.locator('#phone');
    await phoneInput.fill(phone10);
    await expect(phoneInput).toHaveValue(phone10);

    // 3) Negocio
    await page.locator('#business_name').fill(negocio);

    // 4) Giro autocomplete: escribir "tacos" y verificar sugerencias
    const giroInput = page.locator('#giro');
    await giroInput.fill('tacos');

    // Esperar que aparezca el dropdown de sugerencias (debounce 200ms)
    const suggestions = page.locator('#giroSuggestions');
    await expect(suggestions).toBeVisible({ timeout: 3000 });

    // Verificar que existe sugerencia para taqueria
    const taqueria = suggestions.locator('.giro-suggestion[data-slug="taqueria"]');
    await expect(taqueria).toBeVisible();

    // (verificación adicional) "restaurante" y "foodtruck" también podrían aparecer si pegan en sells
    // Tolerante: solo asertamos taqueria existe
    await taqueria.click();

    // input ahora muestra "Taquería" y dataset.slug=taqueria
    await expect(giroInput).toHaveValue(/Taquer/i);
    expect(await giroInput.getAttribute('data-slug')).toBe('taqueria');

    // 5) Passwords
    await page.locator('#password').fill('Test1234!');
    await page.locator('#password2').fill('Test1234!');

    // 6) Submit; capturar response del backend para extraer dev_code
    const [registerResponse] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/auth/register-simple') && r.request().method() === 'POST'),
      page.locator('#btnRegister').click()
    ]);

    expect(registerResponse.status()).toBe(200);
    const regJson = await registerResponse.json();
    expect(regJson.ok).toBeTruthy();
    expect(regJson.tenant_id).toMatch(/^TNT-/);

    // 7) Esperar paso 2 visible (OTP step)
    await expect(page.locator('.step[data-step="2"].active')).toBeVisible({ timeout: 3000 });

    // En entornos sin Twilio configurado el backend devuelve dev_code y el frontend lo auto-llena.
    // Si SMS está real configurado (sms_sent=true), no tendremos dev_code → skip suave.
    if (!regJson.dev_code) {
      test.info().annotations.push({ type: 'skip', description: 'SMS provider configurado; no hay dev_code' });
      test.skip(true, 'No dev_code (SMS real activo). Test requiere modo dev.');
      return;
    }

    const otpInput = page.locator('#otp');
    // Auto-fill ocurre en setTimeout 200ms; esperar valor presente
    await expect(otpInput).toHaveValue(regJson.dev_code, { timeout: 2000 });

    // 8) verify-simple — el frontend lo dispara automáticamente al llegar a 6 dígitos
    const verifyResponse = await page.waitForResponse(
      (r) => r.url().includes('/api/auth/verify-simple') && r.request().method() === 'POST',
      { timeout: 5000 }
    );
    expect(verifyResponse.status()).toBe(200);
    const verJson = await verifyResponse.json();
    expect(verJson.ok).toBeTruthy();
    expect(verJson.token).toBeTruthy();
    expect(verJson.tenant_id).toBe(regJson.tenant_id);

    // 9) Step 3 visible con tenant_id mostrado
    await expect(page.locator('.step[data-step="3"].active')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('#tenantIdBox')).toContainText(regJson.tenant_id);

    // 10) localStorage debe tener token + session
    const lsToken = await page.evaluate(() => localStorage.getItem('volvix_token'));
    expect(lsToken).toBeTruthy();
    const lsSession = await page.evaluate(() => localStorage.getItem('volvix_session'));
    expect(lsSession).toContain(regJson.tenant_id);

    // 11) Botón "Entrar al panel" redirige a launcher
    await Promise.all([
      page.waitForURL(/mis-modulos\.html|index\.html/, { timeout: 5000 }),
      page.locator('#btnGoLauncher').click()
    ]);
  });

  test('autocomplete: "venta de comida" sugiere restaurante', async ({ page }) => {
    await page.goto('/registro.html');
    await page.locator('#giro').fill('venta de comida');
    const suggestions = page.locator('#giroSuggestions');
    await expect(suggestions).toBeVisible({ timeout: 3000 });
    // Debe sugerir restaurante (sinónimo "venta de comida")
    await expect(suggestions.locator('.giro-suggestion[data-slug="restaurante"]')).toBeVisible();
  });

  test('autocomplete: "hot dogs" sugiere foodtruck', async ({ page }) => {
    await page.goto('/registro.html');
    await page.locator('#giro').fill('hot dogs');
    const suggestions = page.locator('#giroSuggestions');
    await expect(suggestions).toBeVisible({ timeout: 3000 });
    await expect(suggestions.locator('.giro-suggestion[data-slug="foodtruck"]')).toBeVisible();
  });

  test('autocomplete: "cafe" sugiere cafeteria', async ({ page }) => {
    await page.goto('/registro.html');
    await page.locator('#giro').fill('cafe');
    const suggestions = page.locator('#giroSuggestions');
    await expect(suggestions).toBeVisible({ timeout: 3000 });
    await expect(suggestions.locator('.giro-suggestion[data-slug="cafeteria"]')).toBeVisible();
  });

  test('validación: phone inválido (menos de 10) muestra error', async ({ page }) => {
    await page.goto('/registro.html');
    await page.locator('#phone').fill('555');
    await page.locator('#business_name').fill('X Test');
    await page.locator('#password').fill('Test1234!');
    await page.locator('#password2').fill('Test1234!');
    // giro vacío también dispara error pero phone debe mostrarse
    await page.locator('#btnRegister').click();
    await expect(page.locator('[data-err="phone"]')).toBeVisible();
  });

  test('endpoint: /api/giros/autocomplete?q=tacos retorna taqueria en top', async ({ request }) => {
    const r = await request.get('/api/giros/autocomplete?q=tacos&limit=5');
    expect(r.status()).toBe(200);
    const body = await r.json();
    expect(Array.isArray(body.results)).toBeTruthy();
    expect(body.results.length).toBeGreaterThan(0);
    // taqueria debe estar entre los top
    const slugs = body.results.map((x) => x.slug);
    expect(slugs).toContain('taqueria');
  });
});
