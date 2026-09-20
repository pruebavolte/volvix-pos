#!/usr/bin/env node
/* test-returns-match.js — harness del emparejamiento de items de POST /api/returns (sin red, sin BD, sin deps).
 *
 * Extrae el handler REAL de api/index.js (no una copia), lo compila con stubs y lo corre contra una BD falsa en
 * memoria. Sirve para reproducir el bug "reembolso imposible: el carrito guarda `code`" y para regresion.
 *
 * Uso:
 *   node scripts/test-returns-match.js                      # contra api/index.js del worktree
 *   node scripts/test-returns-match.js <ruta/api/index.js>  # contra otra version (p.ej. git show HEAD~1:api/index.js > /tmp/x.js)
 *   node scripts/test-returns-match.js --strict             # exit 1 si algun escenario falla (CI)
 * Cada escenario declara el comportamiento DESEADO; FAIL = el handler no lo cumple.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const strict = args.includes('--strict');
const file = args.find(a => !a.startsWith('--')) || path.join(__dirname, '..', 'api', 'index.js');
const src = fs.readFileSync(file, 'utf8');

// --- extraer el handler real ---------------------------------------------------------------------------------
const start = src.indexOf("'POST /api/returns': requireAuth(");
if (start < 0) { console.error('No encuentro el handler POST /api/returns en ' + file); process.exit(2); }
const endMarker = src.indexOf('\n  // R7c FIX-N4 (2026-04-28): DELETED legacy minimal', start);
if (endMarker < 0) { console.error('No encuentro el fin del handler (marcador R7c FIX-N4)'); process.exit(2); }
let chunk = src.slice(start, endMarker).trim();
chunk = chunk.replace(/^'POST \/api\/returns': requireAuth\(/, '').replace(/\),\s*$/, '');

// --- BD falsa ------------------------------------------------------------------------------------------------
function makeDb(sale) {
  const db = { sale: JSON.parse(JSON.stringify(sale)), returns: [], salePatches: [] };
  db.supabaseRequest = async function (method, p, body) {
    if (method === 'GET' && p.startsWith('/pos_sales?id=eq.')) return [db.sale];
    if (method === 'GET' && p.startsWith('/pos_users?')) return [{ tenant_id: 'T1' }];
    if (method === 'GET' && p.startsWith('/pos_returns?sale_id=eq.')) return db.returns.map(r => ({ items: r.items, items_returned: r.items_returned }));
    if (method === 'GET' && p.startsWith('/cuts?')) return [];
    if (method === 'POST' && p === '/pos_returns') { const row = Object.assign({ id: 'R' + (db.returns.length + 1) }, body); db.returns.push(row); return [row]; }
    if (method === 'PATCH' && p.startsWith('/pos_sales?id=eq.')) { db.salePatches.push(body); return []; }
    throw new Error('supabaseRequest no simulado: ' + method + ' ' + p);
  };
  return db;
}

async function run(sale, requestBody, prior) {
  const db = makeDb(sale);
  (prior || []).forEach(p => db.returns.push(p));
  let out = { status: 200, json: null };
  const sendJSON = (res, obj, code) => { out = { status: code || 200, json: obj }; };
  const sendError = (res, err) => { out = { status: 500, json: { error: String(err && err.message || err) } }; };
  const factory = new Function('supabaseRequest', 'readBody', 'resolveTenant', 'sendJSON', 'sendError', 'resolveOwnerPosUserId', 'requireAuthStub',
    'const requireAuth = requireAuthStub; return (' + chunk + ');');
  const handler = factory(db.supabaseRequest, async () => requestBody, () => 'T1', sendJSON, sendError, () => 'OWNER', f => f);
  await handler({ user: { id: 'U1', role: 'owner', tenant_id: 'T1' }, url: '/api/returns' }, {});
  return { out, db };
}

// --- escenarios ----------------------------------------------------------------------------------------------
const UUID_A = '11111111-1111-4111-8111-111111111111';
const UUID_B = '22222222-2222-4222-8222-222222222222';
const base = { id: 'S1', tenant_id: 'T1', pos_user_id: 'U1', status: 'completed', created_at: new Date().toISOString() };

const scenarios = [
  {
    name: '01 linea con uuid, devolver por product_id (camino feliz)',
    sale: Object.assign({}, base, { items: [{ id: UUID_A, product_id: UUID_A, code: 'MIL', name: 'Milanesa', price: 150, qty: 2 }] }),
    body: { sale_id: 'S1', items: [{ product_id: UUID_A, qty: 1 }], reason: 'x' },
    want: r => r.out.status === 200 && r.out.json.refund_amount === 150,
  },
  {
    name: '02 linea con uuid, cliente manda solo `code` (el bug reportado)',
    sale: Object.assign({}, base, { items: [{ id: UUID_A, product_id: UUID_A, code: 'MIL', name: 'Milanesa', price: 150, qty: 2 }] }),
    body: { sale_id: 'S1', items: [{ code: 'MIL', qty: 1 }], reason: 'x' },
    want: r => r.out.status === 200 && r.out.json.refund_amount === 150,
  },
  {
    name: '03 linea SIN uuid (cobro rapido / producto sin id), devolver por code',
    sale: Object.assign({}, base, { items: [{ product_id: null, id: null, code: 'QUICKPOS', name: 'Cobro rapido', price: 25, qty: 1 }] }),
    body: { sale_id: 'S1', items: [{ code: 'QUICKPOS', qty: 1 }], reason: 'x' },
    want: r => r.out.status === 200 && r.out.json.refund_amount === 25,
  },
  {
    name: '04 payload EXACTO del cliente (newReturnNext): {product_id:null, code, name, qty, price} sobre linea sin uuid',
    sale: Object.assign({}, base, { items: [{ product_id: null, id: null, code: 'QUICKPOS', name: 'Cobro rapido', price: 25, qty: 1 }] }),
    body: { sale_id: 'S1', items: [{ product_id: null, code: 'QUICKPOS', name: 'Cobro rapido', qty: 1, price: 25 }], reason: 'x' },
    want: r => r.out.status === 200,
    note: 'sin `code: li.code` en picked[] de salvadorex-pos.html el server responde "item missing product_id"',
  },
  {
    name: '05 dos lineas del mismo producto con distinto modificador: devolver ambas (qty 2)',
    sale: Object.assign({}, base, { items: [
      { id: UUID_A, product_id: UUID_A, code: 'MIL', name: 'Milanesa', price: 150, qty: 1, modifiers: [{ label: 'Arroz' }] },
      { id: UUID_A, product_id: UUID_A, code: 'MIL', name: 'Milanesa', price: 165, qty: 1, modifiers: [{ label: 'Queso extra', price_delta: 15 }] },
    ] }),
    body: { sale_id: 'S1', items: [{ product_id: UUID_A, qty: 2 }], reason: 'x' },
    want: r => r.out.status === 200 && r.out.json.refund_amount === 315,
    note: 'con `find` (1a linea) origQty=1 y rechaza qty 2; el reembolso correcto es 150+165=315',
  },
  {
    name: '06 devolver 1 de 2 lineas iguales-producto: reembolsa el precio de la 1a linea y no marca la venta como refunded',
    sale: Object.assign({}, base, { items: [
      { id: UUID_A, product_id: UUID_A, code: 'MIL', name: 'Milanesa', price: 150, qty: 1, modifiers: [{ label: 'Arroz' }] },
      { id: UUID_A, product_id: UUID_A, code: 'MIL', name: 'Milanesa', price: 165, qty: 1, modifiers: [{ label: 'Queso extra' }] },
    ] }),
    body: { sale_id: 'S1', items: [{ product_id: UUID_A, qty: 1 }], reason: 'x' },
    want: r => r.out.status === 200 && r.out.json.refund_amount === 150 && r.db.salePatches.length === 1 && r.db.salePatches[0].status === 'partially_refunded',
  },
  {
    name: '07 anti-fraude: no se puede devolver mas de lo vendido (qty 3 de 2)',
    sale: Object.assign({}, base, { items: [{ id: UUID_A, product_id: UUID_A, code: 'MIL', name: 'Milanesa', price: 150, qty: 2 }] }),
    body: { sale_id: 'S1', items: [{ product_id: UUID_A, qty: 3 }], reason: 'x' },
    want: r => r.out.status === 400,
  },
  {
    name: '08 anti-fraude: devolver 1 por uuid y luego 2 por code excede lo vendido (2)',
    sale: Object.assign({}, base, { items: [{ id: UUID_A, product_id: UUID_A, code: 'MIL', name: 'Milanesa', price: 150, qty: 2 }] }),
    prior: [{ status: 'approved', items: [{ product_id: UUID_A, qty: 1 }] }],
    body: { sale_id: 'S1', items: [{ code: 'MIL', qty: 2 }], reason: 'x' },
    want: r => r.out.status === 400 && /exceeds/.test(String(r.out.json.error)),
    note: 'la clave de "ya devuelto" debe ser canonica (no la que mande el cliente)',
  },
  {
    name: '09 producto que no esta en la venta -> 400',
    sale: Object.assign({}, base, { items: [{ id: UUID_A, product_id: UUID_A, code: 'MIL', name: 'Milanesa', price: 150, qty: 2 }] }),
    body: { sale_id: 'S1', items: [{ product_id: UUID_B, qty: 1 }], reason: 'x' },
    want: r => r.out.status === 400,
  },
  {
    name: '10 devolucion total por code deja la venta en refunded',
    sale: Object.assign({}, base, { items: [{ id: UUID_A, product_id: UUID_A, code: 'MIL', name: 'Milanesa', price: 150, qty: 1 }] }),
    body: { sale_id: 'S1', items: [{ code: 'MIL', qty: 1 }], reason: 'x' },
    want: r => r.out.status === 200 && r.db.salePatches.some(p => p.status === 'refunded'),
  },
];

(async () => {
  let fails = 0;
  console.log('Handler: ' + file + '\n');
  for (const s of scenarios) {
    let r, ok = false, detail = '';
    try { r = await run(s.sale, s.body, s.prior); ok = !!s.want(r); detail = 'HTTP ' + r.out.status + ' ' + JSON.stringify(r.out.json).slice(0, 110); }
    catch (e) { detail = 'EXCEPCION ' + e.message; }
    if (!ok) fails++;
    console.log((ok ? 'PASS ' : 'FAIL ') + s.name + '\n       -> ' + detail + (s.note && !ok ? '\n       nota: ' + s.note : ''));
  }
  console.log('\n' + (scenarios.length - fails) + '/' + scenarios.length + ' escenarios OK');
  process.exit(strict && fails ? 1 : 0);
})();
