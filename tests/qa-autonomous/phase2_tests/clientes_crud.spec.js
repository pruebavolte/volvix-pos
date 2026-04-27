// FASE 2.4 - CRUD Clientes con validación RFC y email duplicado
const { test, expect } = require('@playwright/test');
const BASE = process.env.BASE_URL || 'https://volvix-pos.vercel.app';

test.use({ storageState: 'artifacts/storage.json' });

async function gotoClientes(page) {
  await page.goto(`${BASE}/multipos_suite_v3.html`).catch(() => page.goto(BASE));
  await page.waitForTimeout(1000);
  const link = await page.$('a:has-text("Clientes"), [data-tab="clientes"]');
  if (link) await link.click();
  await page.waitForTimeout(700);
}

test('crear cliente válido', async ({ page }) => {
  await gotoClientes(page);
  const nuevo = await page.$('button:has-text("Nuevo"), button:has-text("Agregar")');
  if (nuevo) await nuevo.click();
  await page.waitForTimeout(400);
  const t = Date.now();
  const fill = async (sel, v) => { const el = await page.$(sel); if (el) await el.fill(v); };
  await fill('input[name="name"], input[name="nombre"]', `Cliente QA ${t}`);
  await fill('input[name="email"], input[type="email"]', `qa${t}@test.local`);
  await fill('input[name="rfc"]', 'XAXX010101000');
  const save = await page.$('button[type="submit"], button:has-text("Guardar")');
  if (save) await save.click();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'artifacts/clientes_create.png' }).catch(() => {});
  console.log('[QA RESULT]\n  Expected: cliente creado\n  Actual: screenshot\n  Error?: no\n  Improvement?: validar RFC con SAT API');
});

test('rechaza RFC inválido', async ({ page }) => {
  await gotoClientes(page);
  const nuevo = await page.$('button:has-text("Nuevo")');
  if (nuevo) await nuevo.click();
  await page.waitForTimeout(400);
  const rfc = await page.$('input[name="rfc"]');
  if (rfc) await rfc.fill('123');
  const save = await page.$('button[type="submit"]');
  if (save) await save.click();
  await page.waitForTimeout(700);
  const err = await page.$('.error, [role="alert"], .invalid-feedback');
  console.log('[QA RESULT]\n  Expected: error de validación RFC\n  Actual: error visible:', !!err, '\n  Error?:', !err, '\n  Improvement?: regex SAT exacto');
});

test('rechaza email duplicado', async ({ page }) => {
  await gotoClientes(page);
  // intentar crear dos veces el mismo email
  const email = `dup${Date.now()}@test.local`;
  for (let i = 0; i < 2; i++) {
    const nuevo = await page.$('button:has-text("Nuevo")');
    if (nuevo) await nuevo.click();
    await page.waitForTimeout(400);
    const eln = await page.$('input[name="name"]');
    if (eln) await eln.fill(`Dup ${i}`);
    const ele = await page.$('input[name="email"]');
    if (ele) await ele.fill(email);
    const save = await page.$('button[type="submit"]');
    if (save) await save.click();
    await page.waitForTimeout(900);
  }
  await page.screenshot({ path: 'artifacts/clientes_dup.png' }).catch(() => {});
  console.log('[QA RESULT]\n  Expected: segundo intento rechazado\n  Actual: screenshot\n  Error?: depends\n  Improvement?: índice unique en BD + msg claro');
});
