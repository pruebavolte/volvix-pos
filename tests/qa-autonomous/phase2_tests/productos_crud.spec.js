// FASE 2.3 - CRUD Productos
const { test, expect } = require('@playwright/test');
const BASE = process.env.BASE_URL || 'https://volvix-pos.vercel.app';

test.use({ storageState: 'artifacts/storage.json' });

async function gotoProductos(page) {
  await page.goto(`${BASE}/multipos_suite_v3.html`, { waitUntil: 'domcontentloaded' }).catch(() => page.goto(BASE));
  await page.waitForTimeout(1200);
  const link = await page.$('a:has-text("Productos"), [data-tab="productos"], button:has-text("Productos")');
  if (link) await link.click();
  await page.waitForTimeout(800);
}

test('crear producto', async ({ page }) => {
  page.on('pageerror', e => console.log('[QA][PAGEERROR]', e.message));
  await gotoProductos(page);
  const nuevo = await page.$('button:has-text("Nuevo"), button:has-text("Agregar"), [data-action="new-product"]');
  if (nuevo) await nuevo.click();
  await page.waitForTimeout(500);
  const name = `QA Producto ${Date.now()}`;
  const nameInput = await page.$('input[name="name"], input[name="nombre"], #product-name');
  if (nameInput) await nameInput.fill(name);
  const priceInput = await page.$('input[name="price"], input[name="precio"], #product-price');
  if (priceInput) await priceInput.fill('99.50');
  const save = await page.$('button[type="submit"], button:has-text("Guardar")');
  if (save) await save.click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: 'artifacts/productos_create.png' }).catch(() => {});
  const found = await page.$(`text=${name}`);
  console.log('[QA RESULT]\n  Expected: producto aparece en lista\n  Actual:', !!found, '\n  Error?:', !found, '\n  Improvement?: feedback toast tras guardar');
});

test('editar producto', async ({ page }) => {
  await gotoProductos(page);
  const edit = await page.$('button:has-text("Editar"), [data-action="edit"]');
  if (edit) await edit.click();
  await page.waitForTimeout(500);
  const priceInput = await page.$('input[name="price"], input[name="precio"]');
  if (priceInput) { await priceInput.fill(''); await priceInput.fill('123.45'); }
  const save = await page.$('button[type="submit"], button:has-text("Guardar")');
  if (save) await save.click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'artifacts/productos_edit.png' }).catch(() => {});
  console.log('[QA RESULT]\n  Expected: precio actualizado\n  Actual: ver screenshot\n  Error?: depends\n  Improvement?: historial de cambios');
});

test('eliminar producto', async ({ page }) => {
  await gotoProductos(page);
  page.on('dialog', d => d.accept());
  const del = await page.$('button:has-text("Eliminar"), [data-action="delete"]');
  if (del) await del.click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'artifacts/productos_delete.png' }).catch(() => {});
  console.log('[QA RESULT]\n  Expected: producto desaparece de lista\n  Actual: ver screenshot\n  Error?: depends\n  Improvement?: soft-delete con papelera');
});

test('importar y exportar', async ({ page }) => {
  await gotoProductos(page);
  const exp = await page.$('button:has-text("Exportar"), [data-action="export"]');
  if (exp) {
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 5000 }).catch(() => null),
      exp.click()
    ]);
    if (download) console.log('[QA] download:', await download.suggestedFilename());
  }
  await page.screenshot({ path: 'artifacts/productos_export.png' }).catch(() => {});
  console.log('[QA RESULT]\n  Expected: descarga CSV/XLSX\n  Actual: ver log\n  Error?: depends\n  Improvement?: indicar formato + número de filas');
});
