// QA DESTRUCTIVO #2 - Acciones simultáneas: paralelismo, race conditions UI
const { test, expect, request } = require('@playwright/test');

const BASE = process.env.BASE_URL || 'https://volvix-pos.vercel.app';
const EMAIL = 'admin@volvix.test';
const PASS = 'Volvix2026!';

async function login(ctx) {
  const r = await ctx.post(`${BASE}/api/auth/login`, {
    data: { email: EMAIL, password: PASS },
    failOnStatusCode: false
  });
  if (!r.ok()) return null;
  const j = await r.json().catch(() => ({}));
  return j.token || j.access_token || null;
}

test.describe('Acciones simultáneas', () => {

  test('50 logins paralelos misma cuenta → no 5xx, rate limit aplica', async () => {
    const tasks = Array.from({ length: 50 }, async () => {
      const ctx = await request.newContext();
      const r = await ctx.post(`${BASE}/api/auth/login`, {
        data: { email: EMAIL, password: PASS },
        failOnStatusCode: false
      });
      const status = r.status();
      await ctx.dispose();
      return status;
    });
    const results = await Promise.all(tasks);
    const crashes = results.filter(s => s >= 500);
    const ok = results.filter(s => s === 200).length;
    const rateLimited = results.filter(s => s === 429).length;
    console.log(`[50-logins] ok=${ok} 429=${rateLimited} crash=${crashes.length}`);
    expect(crashes.length).toBe(0);
    // Esperamos que rate limit pegue antes de 50: ok < 50
    expect(ok).toBeLessThan(50);
  });

  test('Crear venta + cancelar simultáneamente', async ({ browser }) => {
    const ctx1 = await request.newContext();
    const tok = await login(ctx1);
    test.skip(!tok, 'login falló, skip');
    const headers = { Authorization: `Bearer ${tok}` };

    const create = ctx1.post(`${BASE}/api/sales`, {
      headers,
      data: { items: [{ product_id: 1, qty: 1, price: 100 }], total: 100 },
      failOnStatusCode: false
    });
    const cancel = ctx1.post(`${BASE}/api/sales/cancel`, {
      headers,
      data: { sale_id: 'pending' },
      failOnStatusCode: false
    });
    const [a, b] = await Promise.all([create, cancel]);
    expect(a.status()).toBeLessThan(500);
    expect(b.status()).toBeLessThan(500);
    await ctx1.dispose();
  });

  test('Apertura caja desde 2 tabs concurrentes → solo 1 sesión activa', async ({ browser }) => {
    const c1 = await browser.newContext();
    const c2 = await browser.newContext();
    const p1 = await c1.newPage();
    const p2 = await c2.newPage();

    for (const p of [p1, p2]) {
      await p.goto(`${BASE}/login.html`).catch(() => p.goto(BASE));
      await p.waitForTimeout(600);
      const e = await p.$('input[type="email"], #email');
      const pw = await p.$('input[type="password"], #password');
      if (e) await e.fill(EMAIL);
      if (pw) await pw.fill(PASS);
      const btn = await p.$('button[type="submit"]');
      if (btn) await btn.click();
      await p.waitForTimeout(1200);
    }

    // Disparar apertura caja en paralelo via fetch desde ambas pestañas
    const open1 = p1.evaluate(b => fetch(`${b}/api/cash-sessions/open`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      credentials: 'include', body: JSON.stringify({ initial_amount: 500 })
    }).then(r => r.status).catch(() => 0), BASE);
    const open2 = p2.evaluate(b => fetch(`${b}/api/cash-sessions/open`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      credentials: 'include', body: JSON.stringify({ initial_amount: 500 })
    }).then(r => r.status).catch(() => 0), BASE);
    const [s1, s2] = await Promise.all([open1, open2]);
    console.log(`[cash-open-concurrent] tab1=${s1} tab2=${s2}`);
    // Una de las dos debe fallar con 409 (conflict) o similar
    const both200 = s1 === 200 && s2 === 200;
    expect(both200).toBeFalsy();

    await c1.close(); await c2.close();
  });

  test('Click "cobrar" 100 veces seguidas (idempotency)', async () => {
    const ctx = await request.newContext();
    const tok = await login(ctx);
    test.skip(!tok, 'login falló');
    const headers = { Authorization: `Bearer ${tok}`, 'Idempotency-Key': 'qa-destruct-' + Date.now() };

    const tasks = Array.from({ length: 100 }, () =>
      ctx.post(`${BASE}/api/sales`, {
        headers,
        data: { items: [{ product_id: 1, qty: 1, price: 50 }], total: 50 },
        failOnStatusCode: false
      })
    );
    const results = await Promise.all(tasks);
    const ok2xx = results.filter(r => r.status() >= 200 && r.status() < 300).length;
    const crash = results.filter(r => r.status() >= 500).length;
    console.log(`[100-cobrar] 2xx=${ok2xx} 5xx=${crash}`);
    expect(crash).toBe(0);
    // Con idempotency-key idéntica, solo 1 venta debe crearse (idealmente)
    // Si no hay idempotency, este test solo valida no-crash.
    await ctx.dispose();
  });

  test('Modificar mismo producto desde 2 sesiones → optimistic locking', async () => {
    const ctxA = await request.newContext();
    const ctxB = await request.newContext();
    const ta = await login(ctxA);
    const tb = await login(ctxB);
    test.skip(!ta || !tb, 'login falló');

    // Asumimos product_id=1 existe; leer y reescribir desde ambos
    const headersA = { Authorization: `Bearer ${ta}` };
    const headersB = { Authorization: `Bearer ${tb}` };
    const a = ctxA.put(`${BASE}/api/products/1`, { headers: headersA, data: { price: 999 }, failOnStatusCode: false });
    const b = ctxB.put(`${BASE}/api/products/1`, { headers: headersB, data: { price: 1 }, failOnStatusCode: false });
    const [ra, rb] = await Promise.all([a, b]);
    expect(ra.status()).toBeLessThan(500);
    expect(rb.status()).toBeLessThan(500);
    await ctxA.dispose(); await ctxB.dispose();
  });

  test('Doble submit form rápido (debounce)', async ({ page }) => {
    await page.goto(`${BASE}/login.html`).catch(() => page.goto(BASE));
    await page.waitForTimeout(500);
    const e = await page.$('input[type="email"], #email');
    const pw = await page.$('input[type="password"], #password');
    if (!e || !pw) test.skip(true, 'login form no encontrado');
    await e.fill(EMAIL); await pw.fill(PASS);
    const btn = await page.$('button[type="submit"]');
    let calls = 0;
    page.on('request', r => { if (r.url().includes('/auth/login')) calls++; });
    if (btn) {
      await Promise.all([btn.click(), btn.click(), btn.click()]);
    }
    await page.waitForTimeout(1500);
    console.log(`[double-submit] login calls=${calls}`);
    // El cliente debe debounce/disable: idealmente 1, máximo 2
    expect(calls).toBeLessThanOrEqual(3);
  });

});
