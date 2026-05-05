// FASE 2.6 - CFDI: generar factura + cancelar
const { test, expect } = require('@playwright/test');
const BASE = process.env.BASE_URL || 'https://volvix-pos.vercel.app';
test.use({ storageState: 'artifacts/storage.json' });

test('generar CFDI desde venta', async ({ page }) => {
  page.on('request', r => { if (r.url().includes('cfdi') || r.url().includes('factur')) console.log('[QA][CFDI-REQ]', r.method(), r.url()); });
  page.on('response', r => { if (r.url().includes('cfdi')) console.log('[QA][CFDI-RES]', r.status()); });
  await page.goto(`${BASE}/multipos_suite_v3.html`).catch(() => page.goto(BASE));
  await page.waitForTimeout(1000);
  const fact = await page.$('button:has-text("Facturar"), button:has-text("CFDI"), [data-action="cfdi"]');
  if (fact) await fact.click();
  await page.waitForTimeout(700);
  const rfc = await page.$('input[name="rfc"]');
  if (rfc) await rfc.fill('XAXX010101000');
  const usoCfdi = await page.$('select[name="uso_cfdi"], select[name="usoCfdi"]');
  if (usoCfdi) await usoCfdi.selectOption({ index: 1 }).catch(() => {});
  const submit = await page.$('button[type="submit"], button:has-text("Generar")');
  if (submit) await submit.click();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'artifacts/cfdi_gen.png' }).catch(() => {});
  console.log('[QA RESULT]\n  Expected: CFDI emitido (UUID visible)\n  Actual: screenshot\n  Error?: depends\n  Improvement?: validar timbre con PAC en sandbox');
});

test('cancelar CFDI', async ({ page }) => {
  await page.goto(`${BASE}/multipos_suite_v3.html`).catch(() => page.goto(BASE));
  await page.waitForTimeout(800);
  const cancel = await page.$('button:has-text("Cancelar CFDI"), [data-action="cancel-cfdi"]');
  if (cancel) await cancel.click();
  await page.waitForTimeout(600);
  const motivo = await page.$('select[name="motivo"], select[name="motivoCancelacion"]');
  if (motivo) await motivo.selectOption({ index: 1 }).catch(() => {});
  const conf = await page.$('button[type="submit"], button:has-text("Confirmar")');
  if (conf) await conf.click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'artifacts/cfdi_cancel.png' }).catch(() => {});
  console.log('[QA RESULT]\n  Expected: cancelación con motivo SAT\n  Actual: screenshot\n  Error?: depends\n  Improvement?: validar motivo 01 requiere folio sustituto');
});
