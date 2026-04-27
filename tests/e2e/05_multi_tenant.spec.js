// 05 - Multi-tenant: cajero de TNT001 NO puede leer datos de TNT002
const { test, expect, request } = require('@playwright/test');
const { USERS, login, getStoredToken } = require('./fixtures');

test.describe('Multi-tenant isolation', () => {
  let cajeroToken;

  test.beforeAll(async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await login(page, USERS.cajero);
    await page.waitForURL(url => !/login\.html?$/i.test(url.toString()), { timeout: 20_000 });
    cajeroToken = await getStoredToken(page);
    await ctx.close();
    expect(cajeroToken, 'cajero debe tener token').toBeTruthy();
  });

  test('cajero (TNT001) NO accede a TNT002', async ({ baseURL }) => {
    const ctx = await request.newContext({
      baseURL,
      extraHTTPHeaders: { Authorization: `Bearer ${cajeroToken}` },
    });

    // Intentar leer recursos de otro tenant: parámetro ?tenant_id, header X-Tenant, path
    const attempts = [
      { method: 'get', path: '/api/products?tenant_id=TNT002' },
      { method: 'get', path: '/api/customers?tenant_id=TNT002' },
      { method: 'get', path: '/api/tenants/TNT002/products' },
      { method: 'get', path: '/api/tenants/TNT002/orders' },
    ];

    let blockedCount = 0;
    let totalChecked = 0;
    for (const a of attempts) {
      const res = await ctx[a.method](a.path, { failOnStatusCode: false });
      const code = res.status();
      totalChecked++;
      // Aceptable: 401/403/404 o lista vacía. Falla: 200 con datos de TNT002
      if (code === 200) {
        const body = await res.text();
        let isEmptyOrFiltered = true;
        try {
          const json = JSON.parse(body);
          const arr = Array.isArray(json) ? json : (json.data || json.items || json.results || []);
          if (Array.isArray(arr) && arr.length > 0) {
            // Ningún item debe pertenecer a TNT002
            const leak = arr.some(it => {
              const tid = it.tenant_id || it.tenantId || it.tenant;
              return tid === 'TNT002';
            });
            isEmptyOrFiltered = !leak;
          }
        } catch { /* no JSON: tratar como bloqueado */ }
        if (isEmptyOrFiltered) blockedCount++;
        expect(isEmptyOrFiltered, `${a.path} filtró datos de TNT002`).toBeTruthy();
      } else {
        expect([401, 403, 404]).toContain(code);
        blockedCount++;
      }
    }

    expect(blockedCount).toBe(totalChecked);
    await ctx.dispose();
  });

  test('cajero header X-Tenant-ID forzado a TNT002 → bloqueo', async ({ baseURL }) => {
    const ctx = await request.newContext({
      baseURL,
      extraHTTPHeaders: {
        Authorization: `Bearer ${cajeroToken}`,
        'X-Tenant-ID': 'TNT002',
      },
    });
    const res = await ctx.get('/api/products', { failOnStatusCode: false });
    const code = res.status();
    if (code === 200) {
      const body = await res.json().catch(() => ({}));
      const arr = Array.isArray(body) ? body : (body.data || body.items || []);
      const leak = Array.isArray(arr) && arr.some(it => (it.tenant_id || it.tenantId) === 'TNT002');
      expect(leak, 'X-Tenant-ID spoofed no debe devolver datos de TNT002').toBeFalsy();
    } else {
      expect([401, 403, 404]).toContain(code);
    }
    await ctx.dispose();
  });
});
