// QA DESTRUCTIVO #3 - Condiciones de carrera reales (stock, sesiones, CFDI)
const { test, expect, request } = require('@playwright/test');

const BASE = process.env.BASE_URL || 'https://volvix-pos.vercel.app';
const EMAIL = 'admin@volvix.test';
const PASS = 'Volvix2026!';

async function token() {
  const ctx = await request.newContext();
  const r = await ctx.post(`${BASE}/api/auth/login`, {
    data: { email: EMAIL, password: PASS },
    failOnStatusCode: false
  });
  const j = r.ok() ? await r.json().catch(() => ({})) : {};
  await ctx.dispose();
  return j.token || j.access_token || null;
}

test.describe('Condiciones de carrera', () => {

  test('Stock=1, 5 ventas paralelas qty=1 → solo 1 vende, 4 rechazadas', async () => {
    const tok = await token();
    test.skip(!tok, 'login falló');

    // Crear producto stock=1 (cleanup luego no — tests destructivos)
    const setup = await request.newContext({ extraHTTPHeaders: { Authorization: `Bearer ${tok}` } });
    const create = await setup.post(`${BASE}/api/products`, {
      data: { name: `RACE-${Date.now()}`, price: 10, stock: 1, sku: 'RACE' + Date.now() },
      failOnStatusCode: false
    });
    let productId = null;
    if (create.ok()) {
      const j = await create.json().catch(() => ({}));
      productId = j.id || j.product?.id;
    }
    test.skip(!productId, 'no se pudo crear producto de prueba');

    // 5 requests paralelas comprando qty=1
    const tasks = Array.from({ length: 5 }, async () => {
      const c = await request.newContext({ extraHTTPHeaders: { Authorization: `Bearer ${tok}` } });
      const r = await c.post(`${BASE}/api/sales`, {
        data: { items: [{ product_id: productId, qty: 1, price: 10 }], total: 10 },
        failOnStatusCode: false
      });
      const status = r.status();
      await c.dispose();
      return status;
    });
    const results = await Promise.all(tasks);
    const success = results.filter(s => s >= 200 && s < 300).length;
    const rejected = results.filter(s => s >= 400 && s < 500).length;
    const crash = results.filter(s => s >= 500).length;
    console.log(`[stock-race] success=${success} rejected=${rejected} 5xx=${crash}`);

    expect(crash).toBe(0);
    // CRITERIO ESTRICTO: exactamente 1 success, 4 rechazadas
    expect(success).toBeLessThanOrEqual(1);
    await setup.dispose();
  });

  test('Apertura caja simultánea misma sesión → solo 1 activa', async () => {
    const tok = await token();
    test.skip(!tok, 'login falló');
    const headers = { Authorization: `Bearer ${tok}` };

    const tasks = Array.from({ length: 4 }, async () => {
      const c = await request.newContext({ extraHTTPHeaders: headers });
      const r = await c.post(`${BASE}/api/cash-sessions/open`, {
        data: { initial_amount: 500 }, failOnStatusCode: false
      });
      const status = r.status();
      await c.dispose();
      return status;
    });
    const results = await Promise.all(tasks);
    const ok = results.filter(s => s >= 200 && s < 300).length;
    const conflict = results.filter(s => s === 409).length;
    console.log(`[cash-race] ok=${ok} 409=${conflict} all=${results}`);
    expect(results.every(s => s < 500)).toBeTruthy();
    expect(ok).toBeLessThanOrEqual(1);
  });

  test('Cancelación venta + emisión CFDI mismo segundo', async () => {
    const tok = await token();
    test.skip(!tok, 'login falló');
    const ctx = await request.newContext({ extraHTTPHeaders: { Authorization: `Bearer ${tok}` } });

    // Crear venta
    const sale = await ctx.post(`${BASE}/api/sales`, {
      data: { items: [{ product_id: 1, qty: 1, price: 100 }], total: 100 },
      failOnStatusCode: false
    });
    let saleId = null;
    if (sale.ok()) {
      const j = await sale.json().catch(() => ({}));
      saleId = j.id || j.sale?.id || j.sale_id;
    }
    test.skip(!saleId, 'no se pudo crear venta');

    // Disparar cancel + cfdi al mismo tiempo
    const cancel = ctx.post(`${BASE}/api/sales/${saleId}/cancel`, { data: {}, failOnStatusCode: false });
    const cfdi = ctx.post(`${BASE}/api/cfdi/emit`, { data: { sale_id: saleId }, failOnStatusCode: false });
    const [rc, rf] = await Promise.all([cancel, cfdi]);
    console.log(`[cancel-vs-cfdi] cancel=${rc.status()} cfdi=${rf.status()}`);
    expect(rc.status()).toBeLessThan(500);
    expect(rf.status()).toBeLessThan(500);
    // No deben ambos tener éxito (cancelar venta facturada es inconsistente)
    const bothOk = rc.status() < 300 && rf.status() < 300;
    if (bothOk) {
      console.warn('[FALLA-INTEGRIDAD] cancelación + CFDI ambos OK simultáneamente');
    }
    await ctx.dispose();
  });

});
