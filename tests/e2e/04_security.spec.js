// 04 - Security: sin Bearer → 401, /api/debug → 404, archivos confidenciales → 404
const { test, expect, request } = require('@playwright/test');

const PROTECTED = [
  '/api/products',
  '/api/customers',
  '/api/orders',
  '/api/sales',
  '/api/users',
  '/api/tenants',
];

const DEBUG_PATHS = [
  '/api/debug',
  '/api/_debug',
  '/api/debug/info',
  '/api/admin/debug',
];

const CONFIDENTIAL = [
  '/.env',
  '/.env.local',
  '/.env.production',
  '/server.js',
  '/db/schema.sql',
  '/package.json.bak',
  '/.git/config',
  '/config/secrets.json',
];

test.describe('Security', () => {
  test('endpoints protegidos sin Bearer → 401/403', async ({ baseURL }) => {
    const ctx = await request.newContext({ baseURL });
    let checked = 0;
    for (const path of PROTECTED) {
      const res = await ctx.get(path, { failOnStatusCode: false });
      const code = res.status();
      // Aceptamos 401, 403; rechazamos 200 con datos
      if (code === 200) {
        const body = await res.text();
        // si devuelve HTML de login o vacío, ok; si devuelve JSON con datos, falla
        const looksLikeData = /^\s*[\[{]/.test(body) && body.length > 50;
        expect(looksLikeData, `${path} devuelve datos sin auth`).toBeFalsy();
      } else {
        expect([401, 403, 404]).toContain(code);
      }
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
    await ctx.dispose();
  });

  test('/api/debug* → 404', async ({ baseURL }) => {
    const ctx = await request.newContext({ baseURL });
    for (const path of DEBUG_PATHS) {
      const res = await ctx.get(path, { failOnStatusCode: false });
      expect([404, 401, 403], `${path} debe ser 404 (o al menos no 200)`).toContain(res.status());
    }
    await ctx.dispose();
  });

  test('archivos confidenciales → 404/403', async ({ baseURL }) => {
    const ctx = await request.newContext({ baseURL });
    for (const path of CONFIDENTIAL) {
      const res = await ctx.get(path, { failOnStatusCode: false });
      expect([404, 403], `${path} no debe ser servido (got ${res.status()})`).toContain(res.status());
    }
    await ctx.dispose();
  });
});
