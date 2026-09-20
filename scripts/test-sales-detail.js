#!/usr/bin/env node
/* test-sales-detail.js — harness de GET /api/sales/:id (detalle), /receipt (HTML) y /escpos (bytes) contra el codigo REAL de api/index.js.
 * Sin red ni BD ni deps. Verifica: el detalle existe y conserva items[].modifiers/note, aislamiento por tenant (IDOR), y que el recibo HTML y el
 * ESC/POS muestran nombre + modificadores + nota (escapados). Uso: node scripts/test-sales-detail.js [--strict] [ruta/api/index.js]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const args = process.argv.slice(2);
const strict = args.includes('--strict');
const file = args.find(a => !a.startsWith('--')) || path.join(__dirname, '..', 'api', 'index.js');
const src = fs.readFileSync(file, 'utf8');

function extract(route) {
  const head = "handlers['" + route + "'] = requireAuth(";
  const a = src.indexOf(head);
  if (a < 0) return null;
  const e = src.indexOf('\n  });', a);
  return src.slice(a + head.length - 'requireAuth('.length, e + '\n  })'.length).replace(/^requireAuth/, 'requireAuth');
}

const UUID = '11111111-1111-4111-8111-111111111111';
const SALE = {
  id: UUID, tenant_id: 'T1', total: 165, payment_method: 'efectivo', created_at: '2026-09-20T10:00:00Z',
  items: [{ code: 'MIL', name: 'Milanesa <b>', price: 165, qty: 1, modifiers: [{ label: 'Arroz' }, { label: 'Queso extra', price_delta: 15 }], note: 'sin sal & sin <script>' }],
};

async function call(route, id, tenant) {
  const chunk = extract(route);
  if (!chunk) return { missing: true };
  let out = { status: 200, json: null, raw: null, headers: {} };
  const res = { statusCode: 200, setHeader(k, v) { out.headers[k] = v; }, end(b) { out.raw = b; out.status = this.statusCode; } };
  const sendJSON = (r, obj, code) => { out.status = code || 200; out.json = obj; };
  const supabaseRequest = async (m, p) => {
    if (m === 'GET' && p.startsWith('/pos_sales?id=eq.')) return p.indexOf(UUID) >= 0 ? [JSON.parse(JSON.stringify(SALE))] : [];
    if (m === 'GET' && p.startsWith('/payments?')) return [];
    if (m === 'PATCH') return [];
    throw new Error('no simulado ' + m + ' ' + p);
  };
  const F = new Function('requireAuth', 'supabaseRequest', 'sendJSON', 'sendError', 'b36IsSuperadmin', 'b36Tenant', 'isUuid', 'Buffer', 'String',
    'return (' + chunk.replace(/^requireAuth/, 'requireAuth') + ');');
  const h = F(f => f, supabaseRequest, sendJSON, (r, e) => { out = { status: 500, json: { error: String(e && e.message || e) } }; },
    () => false, () => tenant, v => /^[0-9a-f-]{36}$/i.test(v), Buffer, String);
  await h({ user: { tenant_id: tenant } }, res, { id });
  return out;
}

const tests = [
  ['01 GET /api/sales/:id existe y devuelve la venta con modifiers y note', async () => {
    const r = await call('GET /api/sales/:id', UUID, 'T1');
    if (r.missing) return 'el handler NO existe (404 en produccion)';
    const it = r.json && r.json.items && r.json.items[0];
    return r.status === 200 && it && it.modifiers.length === 2 && it.note ? null : 'HTTP ' + r.status + ' ' + JSON.stringify(r.json).slice(0, 120);
  }],
  ['02 otro tenant -> 404 (sin IDOR)', async () => { const r = await call('GET /api/sales/:id', UUID, 'OTRO'); return r.missing ? 'no existe' : (r.status === 404 ? null : 'HTTP ' + r.status); }],
  ['03 id no-uuid -> 404', async () => { const r = await call('GET /api/sales/:id', 'no-es-uuid', 'T1'); return r.missing ? 'no existe' : (r.status === 404 ? null : 'HTTP ' + r.status); }],
  ['04 receipt HTML: nombre + modificadores + nota y todo escapado', async () => {
    const r = await call('GET /api/sales/:id/receipt', UUID, 'T1'); const h = String(r.raw || '');
    if (!h) return 'sin HTML (HTTP ' + r.status + ')';
    if (h.indexOf('<script>') >= 0 || h.indexOf('<b>') >= 0) return 'HTML sin escapar';
    return (h.indexOf('Milanesa') >= 0 && h.indexOf('+ Arroz') >= 0 && h.indexOf('Queso extra') >= 0 && h.indexOf('Nota: sin sal') >= 0) ? null : 'faltan datos: ' + h.slice(h.indexOf('<table'), h.indexOf('<table') + 260);
  }],
  ['05 escpos: renglones con item, modificadores y nota', async () => {
    const r = await call('GET /api/sales/:id/escpos', UUID, 'T1'); const t = Buffer.isBuffer(r.raw) ? r.raw.toString('binary') : String(r.raw || '');
    return (t.indexOf('1x Milanesa') >= 0 && t.indexOf('+ Arroz') >= 0 && t.indexOf('Nota: sin sal') >= 0 && t.indexOf('Total: 165') >= 0) ? null : JSON.stringify(t.slice(0, 200));
  }],
];

(async () => {
  console.log('Handlers: ' + file + '\n');
  let fails = 0;
  for (const [n, fn] of tests) { let e; try { e = await fn(); } catch (x) { e = 'EXCEPCION ' + x.message; } if (e) fails++; console.log((e ? 'FAIL ' : 'PASS ') + n + (e ? '\n       -> ' + e : '')); }
  console.log('\n' + (tests.length - fails) + '/' + tests.length + ' OK');
  process.exit(strict && fails ? 1 : 0);
})();
