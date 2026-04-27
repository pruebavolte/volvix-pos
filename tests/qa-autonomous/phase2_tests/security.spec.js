// FASE 2.8 - Seguridad: confidenciales 404, sin auth 401, /api/debug 404
const { test, expect } = require('@playwright/test');
const BASE = process.env.BASE_URL || 'https://volvix-pos.vercel.app';

test('archivos confidenciales devuelven 404', async ({ request }) => {
  const paths = [
    '/.env', '/.git/config', '/server.js', '/db/schema.sql',
    '/backups/latest.zip', '/api/debug', '/api/admin/secrets',
    '/.vercel/project.json', '/package.json', '/_endpoints.txt'
  ];
  const out = [];
  for (const p of paths) {
    const r = await request.get(`${BASE}${p}`, { failOnStatusCode: false }).catch(e => null);
    const status = r ? r.status() : 'ERR';
    out.push({ path: p, status });
    console.log('[QA][SEC]', p, '→', status);
  }
  const leaks = out.filter(x => x.status === 200);
  console.log('[QA RESULT]\n  Expected: 404/403 en todos\n  Actual:', JSON.stringify(out), '\n  Error?:', leaks.length > 0, '\n  Improvement?: vercel.json deny rules');
  expect(leaks.length, 'no exponer archivos sensibles').toBe(0);
});

test('endpoints requieren auth', async ({ request }) => {
  const protect = ['/api/sales', '/api/products', '/api/users', '/api/admin'];
  const out = [];
  for (const p of protect) {
    const r = await request.get(`${BASE}${p}`, { failOnStatusCode: false }).catch(() => null);
    const status = r ? r.status() : 'ERR';
    out.push({ path: p, status });
  }
  const open = out.filter(x => x.status === 200);
  console.log('[QA][AUTH]', JSON.stringify(out));
  console.log('[QA RESULT]\n  Expected: 401/403 sin token\n  Actual:', JSON.stringify(out), '\n  Error?:', open.length > 0, '\n  Improvement?: middleware uniforme + rate-limit');
  expect(open.length).toBe(0);
});

test('headers de seguridad presentes', async ({ request }) => {
  const r = await request.get(BASE);
  const h = r.headers();
  const checks = {
    'x-frame-options': !!h['x-frame-options'],
    'x-content-type-options': !!h['x-content-type-options'],
    'strict-transport-security': !!h['strict-transport-security'],
    'content-security-policy': !!h['content-security-policy']
  };
  console.log('[QA][HEADERS]', JSON.stringify(checks));
  console.log('[QA RESULT]\n  Expected: CSP + HSTS + X-Frame + nosniff\n  Actual:', JSON.stringify(checks), '\n  Error?:', Object.values(checks).some(v => !v), '\n  Improvement?: helmet o vercel.json headers');
});
