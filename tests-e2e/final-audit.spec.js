// B16 — Auditoría visual final contra prod
const { test, expect } = require('@playwright/test');
const fs = require('fs');

const BASE = process.env.BASE_URL || 'https://volvix-pos.vercel.app';

test.describe.parallel('B16 final audit', () => {
  test('login flow', async ({ page }) => {
    await page.goto(BASE + '/login.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    await expect(page).toHaveTitle(/Volvix|Iniciar/i);
    const hasEmailInput = await page.locator('input[type="email"]').count();
    expect(hasEmailInput).toBeGreaterThan(0);
  });

  test('public marketplace no toast stock bajo', async ({ page }) => {
    await page.goto(BASE + '/marketplace.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);
    const text = await page.evaluate(() => document.body.innerText);
    expect(text).not.toContain('necesitan reabastecimiento');
  });

  test('404 custom branded', async ({ request }) => {
    const r = await request.get(BASE + '/no-such-page.html', { failOnStatusCode: false });
    expect(r.status()).toBe(404);
    const t = await r.text();
    expect(t).toContain('Volvix');
    expect(t).toContain('Página no encontrada');
  });

  test('kiosk products endpoint público', async ({ request }) => {
    const r = await request.get(BASE + '/api/kiosk/products');
    expect(r.ok()).toBeTruthy();
    const j = await r.json();
    expect(j.ok).toBe(true);
    expect(j.items.length).toBeGreaterThan(0);
  });

  test('owner_panel + ai_engine + ai_academy renderizan títulos correctos', async ({ page }) => {
    await page.goto(BASE + '/login.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    await page.fill('input[type="email"]', 'admin@volvix.test');
    await page.fill('input[type="password"]', 'Volvix2026!');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(3500);

    await page.goto(BASE + '/volvix_owner_panel_v7.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    await expect(page).toHaveTitle(/Volvix Core|Panel/i);

    await page.goto(BASE + '/volvix_ai_engine.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    await expect(page).toHaveTitle(/AI Engine/i);

    await page.goto(BASE + '/volvix_ai_academy.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    await expect(page).toHaveTitle(/Academy/i);
  });

  test('cross-tenant API isolation', async ({ request }) => {
    const lA = await request.post(BASE + '/api/login', {
      data: { email: 'admin@volvix.test', password: 'Volvix2026!' }
    });
    const tokA = (await lA.json()).token;
    const lB = await request.post(BASE + '/api/login', {
      data: { email: 'owner@volvix.test', password: 'Volvix2026!' }
    });
    const tokB = (await lB.json()).token;

    const sA = await request.get(BASE + '/api/sales?limit=200', { headers: { Authorization: 'Bearer ' + tokA } });
    const arrA = await sA.json();
    const idsA = new Set((Array.isArray(arrA) ? arrA : (arrA.items || [])).map(x => x.pos_user_id));

    const sB = await request.get(BASE + '/api/sales?limit=200', { headers: { Authorization: 'Bearer ' + tokB } });
    const arrB = await sB.json();
    const idsB = new Set((Array.isArray(arrB) ? arrB : (arrB.items || [])).map(x => x.pos_user_id));

    expect(idsA.size).toBeLessThanOrEqual(1);
    expect(idsB.size).toBeLessThanOrEqual(1);
    // No overlap
    const overlap = [...idsA].filter(x => idsB.has(x));
    expect(overlap.length).toBe(0);
  });

  test('vendor portal A vs B ven distintos POs', async ({ request }) => {
    const lA = await request.post(BASE + '/api/login', {
      data: { email: 'admin@volvix.test', password: 'Volvix2026!' }
    });
    const tokA = (await lA.json()).token;
    const meA = await (await request.get(BASE + '/api/vendor/me', { headers: { Authorization: 'Bearer ' + tokA } })).json();

    const lB = await request.post(BASE + '/api/login', {
      data: { email: 'owner@volvix.test', password: 'Volvix2026!' }
    });
    const tokB = (await lB.json()).token;
    const meB = await (await request.get(BASE + '/api/vendor/me', { headers: { Authorization: 'Bearer ' + tokB } })).json();

    expect(meA.vendor.name).not.toBe(meB.vendor.name);
    expect(meA.vendor.name).toBe('Distribuidora Don Chucho');
    expect(meB.vendor.name).toBe('Proveedora Los Compadres');
  });

  test('mega-dashboard KPIs reales', async ({ request }) => {
    const l = await request.post(BASE + '/api/login', {
      data: { email: 'admin@volvix.test', password: 'Volvix2026!' }
    });
    const tok = (await l.json()).token;
    const r = await request.get(BASE + '/api/dashboard/today', { headers: { Authorization: 'Bearer ' + tok } });
    const d = await r.json();
    expect(d.ok).toBe(true);
    expect(typeof d.sales_today).toBe('number');
    expect(typeof d.tickets_today).toBe('number');
  });
});
