// QA DESTRUCTIVO #1 - Inputs extremos: payloads que deben romper el sistema
// Todos los endpoints deben responder 4xx (validación), NUNCA 5xx (crash).
const { test, expect, request } = require('@playwright/test');

const BASE = process.env.BASE_URL || 'https://volvix-pos.vercel.app';
const EMAIL = 'admin@volvix.test';
const PASS = 'Volvix2026!';

let TOKEN = '';

test.beforeAll(async () => {
  const ctx = await request.newContext();
  const r = await ctx.post(`${BASE}/api/auth/login`, {
    data: { email: EMAIL, password: PASS },
    failOnStatusCode: false
  });
  if (r.ok()) {
    const j = await r.json().catch(() => ({}));
    TOKEN = j.token || j.access_token || '';
  }
  await ctx.dispose();
});

function authedCtx() {
  return request.newContext({
    extraHTTPHeaders: TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}
  });
}

function expectNot5xx(status, label) {
  // Aceptamos 200, 201, 204, 400-499. Rechazamos 500-599 (crash).
  if (status >= 500) throw new Error(`[${label}] devolvió ${status} (server crash). Esperado 4xx o 2xx.`);
  expect(status).toBeLessThan(500);
}

test.describe('Inputs extremos', () => {

  test('String 100k chars en product.name → 400, no 500', async () => {
    const ctx = await authedCtx();
    const huge = 'A'.repeat(100_000);
    const r = await ctx.post(`${BASE}/api/products`, {
      data: { name: huge, price: 10, sku: 'BIG' },
      failOnStatusCode: false
    });
    expectNot5xx(r.status(), 'huge-name');
    await ctx.dispose();
  });

  test('Solo emojis en RFC del cliente', async () => {
    const ctx = await authedCtx();
    const r = await ctx.post(`${BASE}/api/customers`, {
      data: { name: 'Test', rfc: '🔥🔥🔥🔥', email: 'a@a.test' },
      failOnStatusCode: false
    });
    expectNot5xx(r.status(), 'emoji-rfc');
    await ctx.dispose();
  });

  test('Bytes nulos \\x00 en campos', async () => {
    const ctx = await authedCtx();
    const r = await ctx.post(`${BASE}/api/products`, {
      data: { name: 'Test\x00null\x00bytes', price: 1 },
      failOnStatusCode: false
    });
    expectNot5xx(r.status(), 'null-bytes');
    await ctx.dispose();
  });

  test('Unicode RTL override (‮) en nombre', async () => {
    const ctx = await authedCtx();
    const r = await ctx.post(`${BASE}/api/products`, {
      data: { name: 'admin‮gnp.exe', price: 1 },
      failOnStatusCode: false
    });
    expectNot5xx(r.status(), 'rtl-override');
    await ctx.dispose();
  });

  test('Path traversal en file/asset query', async () => {
    const ctx = await authedCtx();
    const payloads = [
      '../../../etc/passwd',
      '..\\..\\..\\windows\\system32\\config\\sam',
      '%2e%2e%2f%2e%2e%2fetc%2fpasswd',
      'file:///etc/passwd'
    ];
    for (const p of payloads) {
      const r = await ctx.get(`${BASE}/api/assets?path=${encodeURIComponent(p)}`, { failOnStatusCode: false });
      expectNot5xx(r.status(), `path-traversal:${p}`);
      const txt = await r.text().catch(() => '');
      expect(txt.toLowerCase()).not.toContain('root:x:');
    }
    await ctx.dispose();
  });

  test('SQL injection múltiples payloads en query', async () => {
    const ctx = await authedCtx();
    const payloads = [
      "' OR 1=1--",
      "'; DROP TABLE users;--",
      "' UNION SELECT NULL,NULL,NULL--",
      "1' AND SLEEP(5)--",
      "admin'/*",
      "\" OR \"\"=\"",
      "'); DELETE FROM products WHERE 1=1; --"
    ];
    for (const p of payloads) {
      const r = await ctx.get(`${BASE}/api/products?search=${encodeURIComponent(p)}`, { failOnStatusCode: false });
      expectNot5xx(r.status(), `sqli:${p}`);
    }
    await ctx.dispose();
  });

  test('Numbers fuera de rango: MAX_SAFE+1, Infinity, NaN', async () => {
    const ctx = await authedCtx();
    const cases = [
      { price: Number.MAX_SAFE_INTEGER + 1 },
      { price: 'Infinity' },
      { price: '-Infinity' },
      { price: 'NaN' },
      { price: 1e308 },
      { price: -1e308 }
    ];
    for (const data of cases) {
      const r = await ctx.post(`${BASE}/api/products`, {
        data: { name: 'X', ...data },
        failOnStatusCode: false
      });
      expectNot5xx(r.status(), `num:${JSON.stringify(data)}`);
    }
    await ctx.dispose();
  });

  test('Float precision 0.1+0.2 en price total', async () => {
    const ctx = await authedCtx();
    // 0.1 + 0.2 = 0.30000000000000004 → server debe redondear a 2 decimales (centavos)
    const r = await ctx.post(`${BASE}/api/sales`, {
      data: { items: [{ price: 0.1, qty: 1 }, { price: 0.2, qty: 1 }], total: 0.30000000000000004 },
      failOnStatusCode: false
    });
    expectNot5xx(r.status(), 'float-precision');
    await ctx.dispose();
  });

  test('Cantidades negativas en sale items', async () => {
    const ctx = await authedCtx();
    const r = await ctx.post(`${BASE}/api/sales`, {
      data: { items: [{ product_id: 1, qty: -5, price: 10 }], total: -50 },
      failOnStatusCode: false
    });
    expectNot5xx(r.status(), 'negative-qty');
    expect(r.status()).toBeGreaterThanOrEqual(400);
    await ctx.dispose();
  });

  test('Array gigante: items con 10,000 elementos', async () => {
    const ctx = await authedCtx();
    const items = Array.from({ length: 10_000 }, (_, i) => ({
      product_id: (i % 10) + 1, qty: 1, price: 1
    }));
    const r = await ctx.post(`${BASE}/api/sales`, {
      data: { items, total: 10_000 },
      failOnStatusCode: false
    });
    expectNot5xx(r.status(), 'huge-array');
    await ctx.dispose();
  });

  test('Body JSON malformado / truncado', async () => {
    const ctx = await authedCtx();
    const r = await ctx.post(`${BASE}/api/products`, {
      headers: { 'Content-Type': 'application/json' },
      data: '{"name":"X","price":1', // sin cerrar
      failOnStatusCode: false
    });
    expectNot5xx(r.status(), 'malformed-json');
    await ctx.dispose();
  });

  test('Content-Type spoofing: XML como JSON', async () => {
    const ctx = await authedCtx();
    const r = await ctx.post(`${BASE}/api/products`, {
      headers: { 'Content-Type': 'application/json' },
      data: '<?xml version="1.0"?><root><name>X</name></root>',
      failOnStatusCode: false
    });
    expectNot5xx(r.status(), 'xml-as-json');
    await ctx.dispose();
  });

});
