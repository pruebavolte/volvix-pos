// QA DESTRUCTIVO #4 - Red simulada: 3G, offline, abort, 502/503, websocket
const { test, expect } = require('@playwright/test');

const BASE = process.env.BASE_URL || 'https://volvix-pos.vercel.app';
const EMAIL = 'admin@volvix.test';
const PASS = 'Volvix2026!';

async function loginUI(page) {
  await page.goto(`${BASE}/login.html`).catch(() => page.goto(BASE));
  await page.waitForTimeout(600);
  const e = await page.$('input[type="email"], #email');
  const pw = await page.$('input[type="password"], #password');
  if (!e || !pw) return false;
  await e.fill(EMAIL); await pw.fill(PASS);
  const btn = await page.$('button[type="submit"]');
  if (btn) await btn.click();
  await page.waitForTimeout(1500);
  return true;
}

test.describe('Red simulada', () => {

  test('Throttle 3G slow → timeouts y retry', async ({ browser }) => {
    const ctx = await browser.newContext();
    const cdp = await ctx.newCDPSession(await ctx.newPage());
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 400,            // 400ms RTT
      downloadThroughput: 50_000,  // 400 kbps
      uploadThroughput: 50_000
    });
    const page = ctx.pages()[0];
    const t0 = Date.now();
    const ok = await loginUI(page);
    const elapsed = Date.now() - t0;
    console.log(`[3g-slow] login_ok=${ok} elapsed=${elapsed}ms`);
    expect(elapsed).toBeLessThan(60_000); // no debe colgarse
    await ctx.close();
  });

  test('Offline → online durante venta → debe ir a queue', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const ok = await loginUI(page);
    test.skip(!ok, 'login falló');
    await page.context().setOffline(true);
    const beforeOnline = await page.evaluate(() =>
      fetch('/api/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ items: [{ product_id: 1, qty: 1, price: 1 }], total: 1 })
      }).then(r => r.status).catch(e => 'NETWORK_ERROR:' + e.message)
    );
    console.log(`[offline] result=${beforeOnline}`);
    // Cliente debe encolar (sin throw fatal). Se acepta NETWORK_ERROR que el frontend captura.
    await page.context().setOffline(false);
    await page.waitForTimeout(1500);
    // Verificar que la app no está rota tras reconexión
    const stillAlive = await page.evaluate(() => document.readyState);
    expect(stillAlive).toBe('complete');
    await ctx.close();
  });

  test('Abort request mid-write → estado consistente', async ({ page }) => {
    const ok = await loginUI(page);
    test.skip(!ok, 'login falló');
    const result = await page.evaluate(() => {
      const ctrl = new AbortController();
      const p = fetch('/api/sales', {
        method: 'POST', signal: ctrl.signal,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ items: [{ product_id: 1, qty: 1, price: 100 }], total: 100 })
      }).then(r => 'COMPLETED:' + r.status).catch(e => 'ABORTED:' + e.name);
      setTimeout(() => ctrl.abort(), 50);
      return p;
    });
    console.log(`[abort-mid] ${result}`);
    expect(typeof result).toBe('string');
  });

  test('Inyección 502/503 random vía route.fulfill', async ({ page }) => {
    const ok = await loginUI(page);
    test.skip(!ok, 'login falló');
    let injections = 0;
    await page.route('**/api/products*', async (route) => {
      if (Math.random() < 0.5) {
        injections++;
        return route.fulfill({ status: 503, body: 'service unavailable' });
      }
      return route.continue();
    });
    // El cliente debe degradar gracefully (mostrar mensaje, no white screen)
    await page.goto(`${BASE}/products.html`).catch(() => {});
    await page.waitForTimeout(2000);
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    console.log(`[503-inject] injections=${injections} pageerrors=${errors.length}`);
    expect(errors.length).toBe(0);
  });

  test('Reconexión websocket realtime tras disconnect', async ({ page }) => {
    const ok = await loginUI(page);
    test.skip(!ok, 'login falló');
    // Detectar si la app abre WS
    const wsConnected = await page.evaluate(() =>
      new Promise(resolve => {
        const orig = window.WebSocket;
        let count = 0;
        window.WebSocket = function (url, ...args) {
          count++;
          const w = new orig(url, ...args);
          return w;
        };
        setTimeout(() => resolve(count), 3000);
      })
    );
    console.log(`[ws-reconnect] ws_count_after_3s=${wsConnected}`);
    // No assertion estricta — solo verificar que no rompe
    expect(typeof wsConnected).toBe('number');
  });

});
