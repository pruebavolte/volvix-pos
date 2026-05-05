// FASE 3 - Testing humano simulado: edge cases, fuzz, race conditions
const { test, expect } = require('@playwright/test');
const BASE = process.env.BASE_URL || 'https://volvix-pos.vercel.app';
test.use({ storageState: 'artifacts/storage.json' });

test('doble click rápido al cobrar (race condition)', async ({ page }) => {
  const sales = [];
  page.on('request', r => { if (/\/api\/sale/i.test(r.url()) && r.method() === 'POST') sales.push(r.url()); });
  await page.goto(`${BASE}/multipos_suite_v3.html`).catch(() => page.goto(BASE));
  await page.waitForTimeout(900);
  const card = await page.$('.product-card, [data-product-id]');
  if (card) await card.click();
  await page.waitForTimeout(300);
  const cobrar = await page.$('button:has-text("Cobrar"), [data-action="checkout"]');
  if (cobrar) {
    // 5 clicks en 200ms
    await Promise.all(Array.from({ length: 5 }, () => cobrar.click({ force: true }).catch(() => {})));
  }
  await page.waitForTimeout(2000);
  console.log('[QA][SALES_POSTS]', sales.length);
  console.log('[QA RESULT]\n  Expected: solo 1 POST /api/sales\n  Actual:', sales.length, '\n  Error?:', sales.length > 1, '\n  Improvement?: disabled tras primer click + idempotency-key');
});

test('submit form vacío', async ({ page }) => {
  await page.goto(`${BASE}/multipos_suite_v3.html`).catch(() => page.goto(BASE));
  await page.waitForTimeout(800);
  const nuevo = await page.$('button:has-text("Nuevo")');
  if (nuevo) await nuevo.click();
  await page.waitForTimeout(400);
  const save = await page.$('button[type="submit"]');
  if (save) await save.click();
  await page.waitForTimeout(500);
  const errs = await page.$$('.error, [role="alert"], .invalid-feedback, :invalid');
  console.log('[QA RESULT]\n  Expected: validación campos requeridos\n  Actual: errores visibles =', errs.length, '\n  Error?:', errs.length === 0, '\n  Improvement?: marcar campos required en HTML5');
});

test('XSS en nombre producto', async ({ page }) => {
  let alertFired = false;
  page.on('dialog', d => { alertFired = true; d.dismiss(); });
  await page.goto(`${BASE}/multipos_suite_v3.html`).catch(() => page.goto(BASE));
  await page.waitForTimeout(800);
  const nuevo = await page.$('button:has-text("Nuevo")');
  if (nuevo) await nuevo.click();
  await page.waitForTimeout(400);
  const name = await page.$('input[name="name"], input[name="nombre"]');
  if (name) await name.fill('<script>alert(1)</script>');
  const price = await page.$('input[name="price"], input[name="precio"]');
  if (price) await price.fill('10');
  const save = await page.$('button[type="submit"]');
  if (save) await save.click();
  await page.waitForTimeout(1500);
  await page.reload();
  await page.waitForTimeout(1500);
  console.log('[QA RESULT]\n  Expected: payload escapado, NO alert\n  Actual: alert fired =', alertFired, '\n  Error?:', alertFired, '\n  Improvement?: sanitize en server + CSP unsafe-inline off');
  expect(alertFired).toBeFalsy();
});

test('precio negativo', async ({ page }) => {
  await page.goto(`${BASE}/multipos_suite_v3.html`).catch(() => page.goto(BASE));
  await page.waitForTimeout(800);
  const nuevo = await page.$('button:has-text("Nuevo")');
  if (nuevo) await nuevo.click();
  await page.waitForTimeout(400);
  const name = await page.$('input[name="name"]');
  if (name) await name.fill(`Neg ${Date.now()}`);
  const price = await page.$('input[name="price"]');
  if (price) await price.fill('-999999');
  const save = await page.$('button[type="submit"]');
  if (save) await save.click();
  await page.waitForTimeout(900);
  console.log('[QA RESULT]\n  Expected: rechazar precio < 0\n  Actual: ver screenshot\n  Error?: depends\n  Improvement?: min=0 en input + check server');
});

test('texto en input numérico', async ({ page }) => {
  await page.goto(`${BASE}/multipos_suite_v3.html`).catch(() => page.goto(BASE));
  await page.waitForTimeout(800);
  const nuevo = await page.$('button:has-text("Nuevo")');
  if (nuevo) await nuevo.click();
  await page.waitForTimeout(400);
  const price = await page.$('input[name="price"]');
  if (price) await price.fill('abc');
  const val = price ? await price.inputValue() : '';
  console.log('[QA RESULT]\n  Expected: input numérico ignora "abc"\n  Actual: value =', JSON.stringify(val), '\n  Error?:', /[a-z]/i.test(val), '\n  Improvement?: type=number + inputmode');
});

test('refresh durante checkout', async ({ page }) => {
  await page.goto(`${BASE}/multipos_suite_v3.html`).catch(() => page.goto(BASE));
  await page.waitForTimeout(800);
  const card = await page.$('.product-card, [data-product-id]');
  if (card) await card.click();
  await page.waitForTimeout(300);
  await page.reload();
  await page.waitForTimeout(1200);
  const cart = await page.$('.cart-item, [data-cart-line]');
  console.log('[QA RESULT]\n  Expected: carrito persiste o se restaura desde localStorage\n  Actual: cart visible =', !!cart, '\n  Error?: depends\n  Improvement?: persistir carrito en localStorage');
});

test('múltiples tabs concurrentes', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: 'artifacts/storage.json' });
  const t1 = await ctx.newPage();
  const t2 = await ctx.newPage();
  await Promise.all([
    t1.goto(`${BASE}/multipos_suite_v3.html`).catch(() => {}),
    t2.goto(`${BASE}/multipos_suite_v3.html`).catch(() => {})
  ]);
  await t1.waitForTimeout(900);
  await t2.waitForTimeout(900);
  await t1.screenshot({ path: 'artifacts/concurrent_t1.png' }).catch(() => {});
  await t2.screenshot({ path: 'artifacts/concurrent_t2.png' }).catch(() => {});
  console.log('[QA RESULT]\n  Expected: ambas tabs funcionan, sin race condition\n  Actual: 2 screenshots\n  Error?: depends\n  Improvement?: BroadcastChannel para sync entre tabs');
  await ctx.close();
});

test('cookie persiste tras cerrar y reabrir', async ({ browser }) => {
  const ctx1 = await browser.newContext({ storageState: 'artifacts/storage.json' });
  const p1 = await ctx1.newPage();
  await p1.goto(BASE);
  const url1 = p1.url();
  await ctx1.close();
  const ctx2 = await browser.newContext({ storageState: 'artifacts/storage.json' });
  const p2 = await ctx2.newPage();
  await p2.goto(BASE);
  await p2.waitForTimeout(800);
  const url2 = p2.url();
  console.log('[QA RESULT]\n  Expected: ambas sesiones autenticadas\n  Actual: url1=', url1, 'url2=', url2, '\n  Error?: depends\n  Improvement?: refresh token automático');
  await ctx2.close();
});
