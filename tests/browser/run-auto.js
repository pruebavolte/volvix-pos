// tests/browser/run-auto.js
// Browser automation E2E para Volvix POS (volvix-pos.vercel.app)
// Uso: node tests/browser/run-auto.js
// Requisitos: npm i -D playwright && npx playwright install chromium

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE_URL = process.env.BASE_URL || 'https://volvix-pos.vercel.app';
const USER = process.env.VOLVIX_USER || 'admin';
const PASS = process.env.VOLVIX_PASS || 'admin';
const SHOTS_DIR = path.join(__dirname, 'screenshots');
const HEADLESS = process.env.HEADLESS !== 'false';

if (!fs.existsSync(SHOTS_DIR)) fs.mkdirSync(SHOTS_DIR, { recursive: true });

const log = (m) => console.log(`[${new Date().toISOString()}] ${m}`);
const shot = async (page, name) => {
  const p = path.join(SHOTS_DIR, `${name}.png`);
  await page.screenshot({ path: p, fullPage: true });
  log(`screenshot -> ${p}`);
};

const results = { steps: [], passed: 0, failed: 0 };
const step = async (name, fn) => {
  log(`STEP: ${name}`);
  try {
    await fn();
    results.steps.push({ name, ok: true });
    results.passed++;
    log(`  OK ${name}`);
  } catch (e) {
    results.steps.push({ name, ok: false, error: String(e.message || e) });
    results.failed++;
    log(`  FAIL ${name}: ${e.message}`);
    throw e;
  }
};

(async () => {
  const browser = await chromium.launch({ headless: HEADLESS });
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 800 } });
  const page = await ctx.newPage();
  page.on('console', (msg) => { if (msg.type() === 'error') log(`[console.error] ${msg.text()}`); });

  try {
    // 1. Login
    await step('1-login', async () => {
      await page.goto(`${BASE_URL}/login.html`, { waitUntil: 'networkidle' });
      await shot(page, '01-login');
      // intentamos varios selectores comunes
      const userSel = ['#username', 'input[name="username"]', 'input[name="user"]', 'input[type="text"]'];
      const passSel = ['#password', 'input[name="password"]', 'input[type="password"]'];
      let filledU = false, filledP = false;
      for (const s of userSel) { if (await page.locator(s).count()) { await page.fill(s, USER); filledU = true; break; } }
      for (const s of passSel) { if (await page.locator(s).count()) { await page.fill(s, PASS); filledP = true; break; } }
      if (!filledU || !filledP) throw new Error('No encontré inputs de login');
      const btn = page.locator('button[type="submit"], button:has-text("Login"), button:has-text("Entrar"), button:has-text("Iniciar")').first();
      await btn.click();
    });

    // 2. Redirect a salvadorex_web_v25.html
    await step('2-redirect-pos', async () => {
      await page.waitForURL(/salvadorex_web_v25\.html/, { timeout: 15000 });
      await page.waitForLoadState('networkidle');
      await shot(page, '02-pos-loaded');
    });

    // 3. F3 Productos > lista cargada
    await step('3-f3-productos', async () => {
      await page.keyboard.press('F3').catch(() => {});
      // fallback al botón
      const btn = page.locator('button:has-text("F3"), [data-key="F3"], button:has-text("Productos")').first();
      if (await btn.count()) await btn.click().catch(() => {});
      await page.waitForTimeout(800);
      await shot(page, '03-productos');
      const rows = await page.locator('table tr, .product-row, [data-product-id]').count();
      if (rows < 5) throw new Error(`solo ${rows} productos visibles`);
      log(`  productos visibles: ${rows}`);
    });

    // 4. Nuevo producto
    const nombreNuevo = `TEST_E2E_${Date.now()}`;
    await step('4-nuevo-producto', async () => {
      const nuevoBtn = page.locator('button:has-text("Nuevo producto"), button:has-text("+ Nuevo"), button:has-text("+ Producto")').first();
      await nuevoBtn.click({ timeout: 5000 });
      await page.waitForTimeout(500);
      await page.fill('input[name="nombre"], #nombre, input[placeholder*="ombre"]', nombreNuevo);
      await page.fill('input[name="precio"], #precio, input[placeholder*="recio"]', '99.99');
      const stockField = page.locator('input[name="stock"], #stock').first();
      if (await stockField.count()) await stockField.fill('10');
      await shot(page, '04-form-nuevo');
      await page.locator('button:has-text("Guardar"), button[type="submit"]').first().click();
      await page.waitForTimeout(1200);
      await shot(page, '05-tras-guardar');
      const aparece = await page.locator(`text=${nombreNuevo}`).count();
      if (!aparece) throw new Error('producto no aparece en lista');
    });

    // 5. Editar producto
    await step('5-editar-producto', async () => {
      const fila = page.locator(`tr:has-text("${nombreNuevo}"), [data-product]:has-text("${nombreNuevo}")`).first();
      const editBtn = fila.locator('button:has-text("Editar"), button[aria-label*="ditar"], .btn-edit').first();
      await editBtn.click({ timeout: 5000 });
      await page.waitForTimeout(500);
      await page.fill('input[name="precio"], #precio', '149.50');
      await page.locator('button:has-text("Guardar"), button[type="submit"]').first().click();
      await page.waitForTimeout(1000);
      await shot(page, '06-tras-editar');
      const tieneNuevo = await page.locator(`tr:has-text("${nombreNuevo}"):has-text("149")`).count();
      if (!tieneNuevo) throw new Error('cambio no reflejado');
    });

    // 6. Eliminar
    await step('6-eliminar-producto', async () => {
      page.once('dialog', (d) => d.accept().catch(() => {}));
      const fila = page.locator(`tr:has-text("${nombreNuevo}")`).first();
      await fila.locator('button:has-text("Eliminar"), .btn-delete, button[aria-label*="liminar"]').first().click({ timeout: 5000 });
      await page.waitForTimeout(1000);
      await shot(page, '07-tras-eliminar');
      const sigue = await page.locator(`text=${nombreNuevo}`).count();
      if (sigue) throw new Error('producto sigue tras eliminar');
    });

    // 7. F1 Ventas + cobro
    await step('7-f1-venta-efectivo', async () => {
      await page.keyboard.press('F1').catch(() => {});
      const f1 = page.locator('button:has-text("F1"), [data-key="F1"], button:has-text("Ventas")').first();
      if (await f1.count()) await f1.click().catch(() => {});
      await page.waitForTimeout(800);
      // agregar primer producto al carrito
      const primer = page.locator('table tr, .product-row, [data-product-id]').nth(1);
      await primer.dblclick().catch(() => primer.click());
      await page.waitForTimeout(500);
      await shot(page, '08-carrito');
      // cobrar
      const cobrar = page.locator('button:has-text("Cobrar"), button:has-text("Pagar"), button:has-text("F12")').first();
      await cobrar.click({ timeout: 5000 });
      await page.waitForTimeout(500);
      const efectivo = page.locator('button:has-text("Efectivo"), [data-pay="cash"]').first();
      if (await efectivo.count()) await efectivo.click();
      await page.waitForTimeout(500);
      const confirm = page.locator('button:has-text("Confirmar"), button:has-text("Aceptar"), button:has-text("OK")').first();
      if (await confirm.count()) await confirm.click();
      await page.waitForTimeout(1500);
      await shot(page, '09-ticket');
      const ticket = await page.locator('text=/ticket|folio|recibo/i').count();
      if (!ticket) throw new Error('no se ve ticket tras cobro');
    });

    log('\n=== RESUMEN ===');
    log(`Pasos OK : ${results.passed}`);
    log(`Pasos FAIL: ${results.failed}`);
  } catch (e) {
    log(`ERROR FATAL: ${e.message}`);
    await shot(page, 'ERROR-final').catch(() => {});
  } finally {
    fs.writeFileSync(path.join(__dirname, 'last-run.json'), JSON.stringify(results, null, 2));
    await browser.close();
    process.exit(results.failed ? 1 : 0);
  }
})();
