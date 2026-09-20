#!/usr/bin/env node
/* test-pending-sales.js — harness de POST /api/sales/pending (tickets abiertos) contra el esquema REAL de pending_sales.
 * Sin red ni BD ni deps. Extrae el handler REAL de api/index.js y el parseMeta REAL de public/volvix-open-tickets.js.
 *
 * Esquema real verificado (2026-09-20, lectura PostgREST OpenAPI de la BD de produccion): pending_sales tiene
 *   id, tenant_id, user_id(uuid), reference, items(jsonb), customer_id, customer_name, total, notes,
 *   expires_at, restored_at, cancelled_at, created_at   -> NO tiene name / comment / employee / dining.
 * Por eso el server manda primero las columnas nuevas (falla con PGRST204/42703) y reintenta con VLXMETA en notes.
 * Con la migracion docs/migrations-propuesta-pending-sales.sql aplicada, `--con-columnas` simula el esquema nuevo.
 *
 * Uso: node scripts/test-pending-sales.js [--con-columnas] [--strict] [ruta/api/index.js]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const args = process.argv.slice(2);
const strict = args.includes('--strict');
const conColumnas = args.includes('--con-columnas');
const file = args.find(a => !a.startsWith('--')) || path.join(__dirname, '..', 'api', 'index.js');
const src = fs.readFileSync(file, 'utf8');

const marker = "handlers['POST /api/sales/pending'] = requireAuth(withIdempotency('sales.pending', ";
const a = src.indexOf(marker);
const b = src.indexOf("handlers['GET /api/sales/pending']", a);
if (a < 0 || b < 0) { console.error('No encuentro el handler POST /api/sales/pending'); process.exit(2); }
const fnStart = a + marker.length;
const fnEnd = src.lastIndexOf('}));', b) + 1; // incluye la llave de cierre de la funcion
const chunk = src.slice(fnStart, fnEnd);

const OT = require(path.join(__dirname, '..', 'public', 'volvix-open-tickets.js'));

const COLS_REALES = ['id', 'tenant_id', 'user_id', 'reference', 'items', 'customer_id', 'customer_name', 'total', 'notes', 'expires_at', 'restored_at', 'cancelled_at', 'created_at'];
const COLS_NUEVAS = COLS_REALES.concat(['name', 'comment', 'employee', 'dining']);

async function post(body, opts) {
  opts = opts || {};
  const cols = conColumnas ? COLS_NUEVAS : COLS_REALES;
  const inserts = []; const calls = [];
  const supabaseRequest = async (method, p, row) => {
    calls.push(method + ' ' + p);
    if (opts.dbDown) throw new Error('connection refused');
    if (method === 'POST' && p === '/pending_sales') {
      const bad = Object.keys(row).filter(k => cols.indexOf(k) < 0);
      if (bad.length) throw new Error('PGRST204 Could not find the \'' + bad[0] + '\' column of \'pending_sales\' in the schema cache');
      const saved = Object.assign({ id: 'ID' + (inserts.length + 1) }, row); inserts.push(saved); return [saved];
    }
    throw new Error('no simulado: ' + method + ' ' + p);
  };
  let out = { status: 0, json: null };
  const sendJSON = (res, obj, code) => { out = { status: code || 200, json: obj }; };
  const F = new Function('requireAuth', 'withIdempotency', 'b36Tenant', 'rateLimit', 'send429', 'rateLimitRetryMs', 'readBody', 'checkBodyError',
    'sendValidation', 'b36ToNum', 'sanitizeText', 'supabaseRequest', 'logAudit', 'sendJSON', 'sendError', 'IS_PROD',
    'const handlers = {}; handlers.x = ' + chunk + '; return handlers.x;');
  const handler = F(f => f, (n, f) => f, () => 'T1', () => true, () => {}, () => 0, async () => body, () => false,
    (res, m, f) => { out = { status: 400, json: { error: m, field: f } }; }, v => { const n = Number(v); return Number.isFinite(n) ? n : null; },
    v => String(v), supabaseRequest, () => {}, sendJSON, (res, e) => { out = { status: 500, json: { error: String(e.message || e) } }; }, !!opts.prod);
  await handler({ user: { id: 'U1' } }, {});
  return { out, inserts, calls };
}

const item = [{ code: 'MIL', name: 'Milanesa', price: 150, qty: 1, modifiers: [{ label: 'Arroz' }], note: 'sin sal' }];
const big = n => 'x'.repeat(n);
const tests = [
  ['01 con meta: reintenta con VLXMETA y el cliente (parseMeta real) recupera name/comment/employee/dining', async () => {
    const r = await post({ items: item, total: 150, name: 'Mesa 4', comment: 'sin cebolla', employee: 'Ana', dining: 'Para llevar', notes: 'nota del ticket' });
    if (r.out.status !== 201 || !r.inserts.length) return 'HTTP ' + r.out.status;
    const m = OT.parseMeta(r.inserts[0]);
    if (m.name !== 'Mesa 4' || m.comment !== 'sin cebolla' || m.employee !== 'Ana' || m.dining !== 'Para llevar') return 'meta perdida: ' + JSON.stringify(m);
    if (!conColumnas && m.note !== 'nota del ticket') return 'nota perdida: ' + JSON.stringify(m.note);
    return null;
  }],
  ['02 sin meta: 1 sola llamada, notes intacto', async () => {
    const r = await post({ items: item, total: 150, notes: 'hola' });
    return (r.out.status === 201 && r.calls.length === 1 && r.inserts[0].notes === 'hola') ? null : JSON.stringify({ s: r.out.status, calls: r.calls });
  }],
  ['03 items[].modifiers e items[].note llegan intactos al insert (jsonb)', async () => {
    const r = await post({ items: item, total: 150, name: 'M1' });
    const it = r.inserts[0] && r.inserts[0].items[0];
    return (it && it.modifiers[0].label === 'Arroz' && it.note === 'sin sal') ? null : 'items alterados: ' + JSON.stringify(it);
  }],
  ['04 peor caso de longitudes (nombre 80 + comentario 200 + mesero 80 + dining 40 + nota 500) sigue siendo JSON valido y <=500', async () => {
    const r = await post({ items: item, total: 150, name: big(80), comment: big(200), employee: big(80), dining: big(40), notes: big(500) });
    if (r.out.status !== 201) return 'HTTP ' + r.out.status;
    const row = r.inserts[0]; const m = OT.parseMeta(row);
    if (!conColumnas && String(row.notes).length > 500) return 'notes de ' + String(row.notes).length + ' chars';
    return (m.name === big(80) || m.name.length > 0) && m.comment.length > 0 && m.dining === big(40) ? null : 'meta perdida: ' + JSON.stringify(m).slice(0, 160);
  }],
  ['05 comillas y saltos de linea en el comentario no rompen el JSON de VLXMETA', async () => {
    const r = await post({ items: item, total: 150, name: 'Mesa "5"', comment: 'linea1\nlinea2 \\ fin', notes: big(480) });
    const m = OT.parseMeta(r.inserts[0] || {});
    return (r.out.status === 201 && m.name.indexOf('Mesa') === 0 && m.comment.indexOf('linea1') === 0) ? null : 'meta: ' + JSON.stringify(m).slice(0, 160);
  }],
  ['06 BD caida en PRODUCCION: 503 PENDING_PERSIST_FAILED (no id sintetico PND-*)', async () => {
    const r = await post({ items: item, total: 150, name: 'M1' }, { dbDown: true, prod: true });
    return (r.out.status === 503 && r.out.json.error_code === 'PENDING_PERSIST_FAILED') ? null : 'HTTP ' + r.out.status + ' ' + JSON.stringify(r.out.json).slice(0, 100);
  }],
  ['07 BD caida en dev: se conserva el fallback sintetico (201 con id PND-*)', async () => {
    const r = await post({ items: item, total: 150, name: 'M1' }, { dbDown: true, prod: false });
    return (r.out.status === 201 && /^PND-/.test(r.out.json.id)) ? null : 'HTTP ' + r.out.status;
  }],
  ['08 items vacio -> 400', async () => {
    const r = await post({ items: [], total: 0 });
    return r.out.status === 400 ? null : 'HTTP ' + r.out.status;
  }],
];

(async () => {
  console.log('Handler: ' + file + '\nEsquema simulado: ' + (conColumnas ? 'NUEVO (con name/comment/employee/dining)' : 'REAL de produccion (sin esas columnas)') + '\n');
  let fails = 0;
  for (const [name, fn] of tests) {
    let err; try { err = await fn(); } catch (e) { err = 'EXCEPCION ' + e.message; }
    if (err) fails++;
    console.log((err ? 'FAIL ' : 'PASS ') + name + (err ? '\n       -> ' + err : ''));
  }
  console.log('\n' + (tests.length - fails) + '/' + tests.length + ' OK');
  process.exit(strict && fails ? 1 : 0);
})();
