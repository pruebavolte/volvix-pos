// FASE 2.7 - Multitenant: TNT001 NO debe ver datos TNT002
const { test, expect } = require('@playwright/test');
const BASE = process.env.BASE_URL || 'https://volvix-pos.vercel.app';
test.use({ storageState: 'artifacts/storage.json' });

test('admin TNT001 no ve recursos TNT002', async ({ page, request }) => {
  page.on('pageerror', e => console.log('[QA][PAGEERROR]', e.message));
  await page.goto(`${BASE}/multipos_suite_v3.html`).catch(() => page.goto(BASE));
  await page.waitForTimeout(800);

  // Intentar acceder a recursos de otro tenant via API
  const probes = [
    `${BASE}/api/products?tenant=TNT002`,
    `${BASE}/api/sales?tenant=TNT002`,
    `${BASE}/api/customers?tenant=TNT002`,
    `${BASE}/api/tenant/TNT002/users`
  ];
  const results = [];
  for (const url of probes) {
    const r = await request.get(url, { failOnStatusCode: false }).catch(e => ({ status: () => 'ERR', text: () => Promise.resolve(e.message) }));
    const status = r.status ? r.status() : 'ERR';
    const body = await (r.text ? r.text() : Promise.resolve('')).catch(() => '');
    const leaks = /TNT002/i.test(body || '');
    results.push({ url, status, leaks, len: (body || '').length });
    console.log('[QA][TENANT]', url, '→', status, leaks ? 'LEAK!' : 'ok');
  }
  await page.screenshot({ path: 'artifacts/multitenant.png' }).catch(() => {});
  const leaked = results.filter(r => r.leaks);
  expect(leaked.length, 'NO debe haber leaks de TNT002').toBe(0);
  console.log('[QA RESULT]\n  Expected: 401/403/404 + body sin TNT002\n  Actual:', JSON.stringify(results), '\n  Error?:', leaked.length > 0, '\n  Improvement?: RLS en Supabase + middleware tenant-check');
});
