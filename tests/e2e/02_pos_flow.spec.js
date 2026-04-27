// 02 - Flujo POS: catálogo → carrito → cobro → ticket
const { test, expect } = require('@playwright/test');
const { USERS, login, getStoredToken } = require('./fixtures');

test.describe('POS flow (cajero)', () => {
  let token;

  test.beforeAll(async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await login(page, USERS.cajero);
    await page.waitForURL(url => !/login\.html?$/i.test(url.toString()), { timeout: 20_000 });
    token = await getStoredToken(page);
    await ctx.close();
  });

  test.afterAll(async () => {
    // Cleanup: nada persistente que limpiar (tickets se mantienen en historial real)
  });

  test('catálogo → carrito → cobro → ticket', async ({ page }) => {
    await login(page, USERS.cajero);
    await page.waitForURL(url => !/login\.html?$/i.test(url.toString()), { timeout: 20_000 });

    // Ir al POS (varios posibles paths)
    const posCandidates = ['/multipos_suite_v3.html', '/pos', '/volvix-pos.html', '/'];
    let posLoaded = false;
    for (const p of posCandidates) {
      const r = await page.goto(p, { waitUntil: 'domcontentloaded' }).catch(() => null);
      if (r && r.ok()) {
        const hasCatalog = await page.locator('[data-testid="product-card"], .product-card, .catalog-item, [data-product-id]').first().isVisible({ timeout: 5000 }).catch(() => false);
        if (hasCatalog) { posLoaded = true; break; }
      }
    }
    expect(posLoaded, 'POS con catálogo debe cargar').toBeTruthy();

    // Click primer producto del catálogo
    const productSel = '[data-testid="product-card"], .product-card, [data-product-id], .catalog-item';
    const firstProduct = page.locator(productSel).first();
    await expect(firstProduct).toBeVisible();
    await firstProduct.click();

    // Verificar carrito tiene item
    const cartItemSel = '[data-testid="cart-item"], .cart-item, [data-cart-row]';
    await expect(page.locator(cartItemSel).first()).toBeVisible({ timeout: 5000 });

    // Cobrar
    const cobrarSel = '[data-testid="checkout-btn"], button:has-text("Cobrar"), button:has-text("Pagar"), button:has-text("Checkout")';
    await page.locator(cobrarSel).first().click();

    // Confirmar pago (efectivo por defecto)
    const confirmSel = '[data-testid="confirm-payment"], button:has-text("Efectivo"), button:has-text("Confirmar"), button:has-text("Cash")';
    const confirm = page.locator(confirmSel).first();
    if (await confirm.isVisible({ timeout: 4000 }).catch(() => false)) {
      await confirm.click();
    }

    // Ticket visible
    const ticketSel = '[data-testid="ticket"], .ticket, .receipt, text=/ticket|recibo|folio/i';
    await expect(page.locator(ticketSel).first()).toBeVisible({ timeout: 10_000 });
  });
});
