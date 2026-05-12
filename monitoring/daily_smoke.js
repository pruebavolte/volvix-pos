#!/usr/bin/env node
/**
 * monitoring/daily_smoke.js
 * Smoke test diario contra producción real. Crea producto + venta + verifica
 * stock + cleanup. Loggea resultado a /api/log/client.
 * Uso: VOLVIX_API=https://volvix-pos.vercel.app VOLVIX_EMAIL=... VOLVIX_PWD=... node monitoring/daily_smoke.js
 */
const https = require('https');
const API = process.env.VOLVIX_API || 'https://volvix-pos.vercel.app';
const EMAIL = process.env.VOLVIX_EMAIL || 'admin@volvix.test';
const PWD = process.env.VOLVIX_PWD || 'Volvix2026!';

function req(method, path, body, headers) {
  return new Promise((resolve, reject) => {
    const u = new URL(API + path);
    const h = Object.assign({ 'Content-Type': 'application/json' }, headers || {});
    const r = https.request({ hostname: u.hostname, path: u.pathname + u.search, method, headers: h },
      res => { let d = ''; res.on('data', c => d += c); res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(d || '{}') }); } catch (e) { resolve({ status: res.statusCode, body: d.slice(0, 200) }); } }); });
    r.on('error', reject); if (body !== undefined) r.write(JSON.stringify(body)); r.end();
  });
}

async function main() {
  const t0 = Date.now();
  const result = { started_at: new Date().toISOString(), steps: [] };
  // 1. health
  const h = await req('GET', '/api/health');
  result.steps.push({ name: 'health', ok: h.status === 200, status: h.status });
  // 2. login
  const l = await req('POST', '/api/login', { email: EMAIL, password: PWD });
  if (!l.body.token) { result.steps.push({ name: 'login', ok: false }); console.log(JSON.stringify(result, null, 2)); process.exit(1); }
  const auth = { 'Authorization': 'Bearer ' + l.body.token };
  result.steps.push({ name: 'login', ok: true });
  // 3. create product stock=2
  const code = 'SMOKE-' + Date.now();
  const p = await req('POST', '/api/products', { name: code, code, price: 1, stock: 2, tenant_id: 'TNT001' }, auth);
  const prodId = p.body.id;
  result.steps.push({ name: 'create_product', ok: !!prodId, code, stock: p.body.stock });
  // 4. create sale qty=1
  const s = await req('POST', '/api/sales', {
    items: [{ id: prodId, code, name: code, price: 1, qty: 1, subtotal: 1 }],
    total: 1, payment_method: 'efectivo', tenant_id: 'TNT001'
  }, Object.assign({}, auth, { 'Idempotency-Key': 'smoke-' + Date.now() }));
  const saleId = s.body.id;
  result.steps.push({ name: 'create_sale', ok: s.status === 200 && !!saleId, status: s.status });
  // 5. verify stock = 1
  const v = await req('GET', '/api/products?q=' + code + '&limit=3', null, auth);
  const products = Array.isArray(v.body) ? v.body : (v.body.products || []);
  const found = products.find(x => x.code === code);
  const stockOk = found && found.stock === 1;
  result.steps.push({ name: 'stock_decremented', ok: stockOk, stock_now: found && found.stock });
  // 6. cleanup product
  if (prodId) await req('DELETE', '/api/products/' + prodId, null, auth).catch(() => {});
  result.steps.push({ name: 'cleanup', ok: true });

  result.duration_ms = Date.now() - t0;
  result.all_pass = result.steps.every(s => s.ok);
  console.log(JSON.stringify(result, null, 2));
  // Reportar a telemetry
  await req('POST', '/api/log/client', {
    level: result.all_pass ? 'info' : 'error',
    message: 'telemetry.smoke_test',
    meta: { all_pass: result.all_pass, duration_ms: result.duration_ms, steps_failed: result.steps.filter(s => !s.ok).map(s => s.name) }
  }).catch(() => {});
  process.exit(result.all_pass ? 0 : 1);
}
main().catch(e => { console.error(e); process.exit(1); });
