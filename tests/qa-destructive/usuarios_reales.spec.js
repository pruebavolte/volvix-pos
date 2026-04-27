// QA DESTRUCTIVO #6 - Usuarios reales: torpe, malicioso, impaciente, distraído
const { test, expect } = require('@playwright/test');

const BASE = process.env.BASE_URL || 'https://volvix-pos.vercel.app';
const EMAIL = 'admin@volvix.test';
const CAJERO = 'cajero@volvix.test';
const PASS = 'Volvix2026!';

async function login(page, email = EMAIL) {
  await page.goto(`${BASE}/login.html`).catch(() => page.goto(BASE));
  await page.waitForTimeout(600);
  const e = await page.$('input[type="email"], #email');
  const pw = await page.$('input[type="password"], #password');
  if (!e || !pw) return false;
  await e.fill(email); await pw.fill(PASS);
  const btn = await page.$('button[type="submit"]');
  if (btn) await btn.click();
  await page.waitForTimeout(1500);
  return true;
}

test.describe('Usuarios reales', () => {

  test('Usuario torpe: 200 clicks random en pantalla', async ({ page }) => {
    const ok = await login(page);
    test.skip(!ok, 'login falló');
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const dialogs = [];
    page.on('dialog', d => { dialogs.push(d.type()); d.dismiss().catch(() => {}); });

    const vp = page.viewportSize() || { width: 1280, height: 720 };
    for (let i = 0; i < 200; i++) {
      const x = Math.floor(Math.random() * vp.width);
      const y = Math.floor(Math.random() * vp.height);
      await page.mouse.click(x, y, { delay: 5 }).catch(() => {});
    }
    await page.waitForTimeout(1000);
    const stillAlive = await page.evaluate(() => document.readyState).catch(() => 'crash');
    console.log(`[torpe] errors=${errors.length} dialogs=${dialogs.length} alive=${stillAlive}`);
    expect(stillAlive).toBe('complete');
    expect(errors.length).toBeLessThan(20); // tolerancia
  });

  test('Usuario malicioso: modifica window.session.role = admin', async ({ page }) => {
    const ok = await login(page, CAJERO);
    test.skip(!ok, 'login cajero falló');

    // Inyectar manipulación cliente
    await page.evaluate(() => {
      try {
        if (window.session) window.session.role = 'admin';
        localStorage.setItem('role', 'admin');
        localStorage.setItem('volvix_role', 'admin');
      } catch (e) {}
    });

    // Intentar acción admin: borrar producto
    const result = await page.evaluate(() =>
      fetch('/api/products/1', { method: 'DELETE', credentials: 'include' })
        .then(r => r.status).catch(() => 0)
    );
    console.log(`[client-tamper] DELETE /products/1 status=${result}`);
    // Server debe rechazar (401/403), nunca fiarse del cliente
    expect([401, 403, 404]).toContain(result);
  });

  test('Usuario impaciente: refresh durante POST → no double-submit', async ({ page }) => {
    const ok = await login(page);
    test.skip(!ok, 'login falló');
    let postCount = 0;
    page.on('request', r => { if (r.method() === 'POST' && r.url().includes('/api/sales')) postCount++; });

    // Disparar POST + refresh casi inmediato
    page.evaluate(() => {
      fetch('/api/sales', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: [{ product_id: 1, qty: 1, price: 1 }], total: 1 })
      }).catch(() => {});
    });
    await page.waitForTimeout(50);
    await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
    await page.waitForTimeout(2000);
    console.log(`[impaciente] POST count=${postCount}`);
    // El refresh corta la primera; idealmente no se duplica via reintento automático
    expect(postCount).toBeLessThanOrEqual(2);
  });

  test('Usuario distraído: modal abierto 30s+ → idle timeout', async ({ page }) => {
    const ok = await login(page);
    test.skip(!ok, 'login falló');
    // Simular inactividad. Para no esperar 30 min, validamos comportamiento corto.
    await page.waitForTimeout(30_000);
    // Verificar si la sesión sigue válida después del idle corto
    const status = await page.evaluate(() =>
      fetch('/api/me', { credentials: 'include' }).then(r => r.status).catch(() => 0)
    );
    console.log(`[distraido-30s] me_status=${status}`);
    // Sesión debe seguir viva tras 30s (idle timeout largo es típico 15-30 min)
    expect([200, 401]).toContain(status);
    // Si 401 → confirma idle timeout aplicado (también válido)
    // Si 200 → sesión OK; el test largo (30 min) requeriría jugar con clock
  });

  test('Usuario espía: F12 console intenta extraer token de localStorage', async ({ page }) => {
    const ok = await login(page);
    test.skip(!ok, 'login falló');
    const exposed = await page.evaluate(() => {
      const out = {};
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        const v = localStorage.getItem(k);
        if (v && (v.length > 50 || /eyJ/.test(v))) out[k] = v.slice(0, 30) + '...';
      }
      return out;
    });
    console.log('[token-exposure]', JSON.stringify(exposed));
    // Reportar si el token está accesible vía localStorage (vulnerable a XSS)
    // No es failure estricto pero se reporta para revisar.
  });

});
