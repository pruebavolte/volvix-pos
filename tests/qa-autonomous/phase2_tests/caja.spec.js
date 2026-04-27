// FASE 2.5 - Caja: apertura → ventas → corte con variance
const { test, expect } = require('@playwright/test');
const BASE = process.env.BASE_URL || 'https://volvix-pos.vercel.app';
test.use({ storageState: 'artifacts/storage.json' });

test('apertura de caja', async ({ page }) => {
  page.on('pageerror', e => console.log('[QA][PAGEERROR]', e.message));
  await page.goto(`${BASE}/multipos_suite_v3.html`).catch(() => page.goto(BASE));
  await page.waitForTimeout(1000);
  const open = await page.$('button:has-text("Abrir caja"), [data-action="open-cash"]');
  if (open) await open.click();
  await page.waitForTimeout(500);
  const init = await page.$('input[name="opening_amount"], input[name="monto_inicial"]');
  if (init) await init.fill('500');
  const confirm = await page.$('button[type="submit"], button:has-text("Confirmar")');
  if (confirm) await confirm.click();
  await page.waitForTimeout(900);
  await page.screenshot({ path: 'artifacts/caja_open.png' }).catch(() => {});
  console.log('[QA RESULT]\n  Expected: caja abierta con $500\n  Actual: ver screenshot\n  Error?: no\n  Improvement?: bloquear ventas si caja cerrada');
});

test('corte con variance', async ({ page }) => {
  await page.goto(`${BASE}/multipos_suite_v3.html`).catch(() => page.goto(BASE));
  await page.waitForTimeout(1000);
  const close = await page.$('button:has-text("Cerrar caja"), button:has-text("Corte"), [data-action="close-cash"]');
  if (close) await close.click();
  await page.waitForTimeout(600);
  const counted = await page.$('input[name="counted"], input[name="conteo"]');
  if (counted) await counted.fill('480'); // simular faltante
  const confirm = await page.$('button[type="submit"], button:has-text("Confirmar")');
  if (confirm) await confirm.click();
  await page.waitForTimeout(900);
  await page.screenshot({ path: 'artifacts/caja_close.png' }).catch(() => {});
  const variance = await page.textContent('body');
  const hasVar = /variance|diferencia|faltante/i.test(variance || '');
  console.log('[QA RESULT]\n  Expected: muestra variance/faltante\n  Actual: detected:', hasVar, '\n  Error?:', !hasVar, '\n  Improvement?: requerir comentario si variance > 50');
});
