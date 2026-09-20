#!/usr/bin/env node
/* e2e-loyverse.js — E2E REAL por API para el clon Loyverse (venta con modificadores, detalle/recibo, devolucion por code,
 * tickets abiertos con nombre/comentario, active-modules). Sin dependencias (node >= 18).
 *
 * SEGURIDAD (leer antes de correr):
 *  - Solo corre contra el tenant de PRUEBA `TNT-LOYV-TEST`. Aborta ANTES de cualquier escritura si el JWT del login no es de ese tenant
 *    (nunca contra TNT-MATA8 ni ningun negocio real).
 *  - Las credenciales viven SOLO en un JSON local FUERA del repo y NO se imprimen ni se guardan en los resultados:
 *      C:/tmp/openclaw-gateway/loyverse-test-cred.json  ->  { "base_url": "https://systeminternational.app", "email": "...", "password": "...", "tenant_id": "TNT-LOYV-TEST" }
 *    (otra ruta: --cred <archivo>). El tenant + usuario owner + ~6 productos los crea el DUENO (esta rama no crea cuentas ni escribe la BD).
 *  - Escribe en produccion SOLO en ese tenant: ventas de prueba, una devolucion y un ticket abierto (que se borra al final).
 *
 * USO:
 *   node scripts/e2e-loyverse.js --plan            # imprime los pasos, sin red
 *   node scripts/e2e-loyverse.js                   # corre y guarda resultados en docs/e2e-loyverse-results.json
 *   node scripts/e2e-loyverse.js --base http://127.0.0.1:8080 --cred ruta.json --out salida.json
 * Algunos pasos dependen de que la rama web/loyverse este desplegada (GET /api/sales/:id, recibo con modificadores): en produccion previa daran FALLA
 * esperada; el resultado lo dice ("[requiere deploy]").
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const TEST_TENANT = 'TNT-LOYV-TEST';
const MODULES = ['modifiers', 'open_tickets', 'predefined_tickets', 'dining_options', 'print_bill', 'kitchen_printers'];
const STEPS = [
  '1. login por API (email+password del JSON local) y guarda: JWT debe ser del tenant ' + TEST_TENANT,
  '2. GET /api/products (>=2 productos)',
  '3. POST /api/sales con items[].modifiers (2) y items[].note',
  '4. GET /api/sales/:id -> conserva modifiers y note            [requiere deploy]',
  '5. GET /api/sales/:id/receipt y /reprint -> muestran modificadores y nota [requiere deploy]',
  '6. POST /api/returns SOLO con `code` -> 200 y refund_amount > 0; segunda devolucion que excede -> 400',
  '7. POST /api/sales/pending con name/comment/dining/employee -> GET lista lo devuelve (parseMeta real) -> DELETE',
  '8. GET /api/tenant/active-modules -> ninguno de los 6 modulos ' + MODULES.join(',') + ' oculto (default ON)',
  '9. (opcional, si el JSON trae admin_token de superadmin) POST /api/admin/tenants/' + TEST_TENANT + '/modules: apagar/encender los 6 y releer',
];
if (args.includes('--plan')) { console.log(STEPS.join('\n')); process.exit(0); }

const credFile = opt('--cred', 'C:/tmp/openclaw-gateway/loyverse-test-cred.json');
const outFile = opt('--out', path.join(__dirname, '..', 'docs', 'e2e-loyverse-results.json'));
let cred;
try { cred = JSON.parse(fs.readFileSync(credFile, 'utf8')); } catch (e) { console.error('No puedo leer ' + credFile + ' (' + e.message + '). Ver cabecera: lo crea el dueno.'); process.exit(2); }
if (cred.tenant_id !== TEST_TENANT) { console.error('ABORTA: tenant_id del JSON debe ser ' + TEST_TENANT); process.exit(2); }
const BASE = String(opt('--base', cred.base_url || 'https://systeminternational.app')).replace(/\/$/, '');

const results = []; let token = '';
const rec = (name, ok, detail) => { results.push({ step: name, ok: !!ok, detail: String(detail == null ? '' : detail).slice(0, 300) }); console.log((ok ? 'OK    ' : 'FALLA ') + name + (detail ? '  -> ' + String(detail).slice(0, 160) : '')); return ok; };
async function api(method, p, body, extra) {
  const headers = Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}, extra || {});
  const r = await fetch(BASE + p, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch (_) {}
  return { status: r.status, json, text };
}
const jwtTenant = t => { try { const p = JSON.parse(Buffer.from(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')); return p.tenant_id || p.company_id || ''; } catch (_) { return ''; } };
const uuid = () => crypto.randomUUID();

(async () => {
  // 1 login (no se imprime nada del password/token)
  const lg = await api('POST', '/api/login', { email: cred.email, password: cred.password });
  token = lg.json && lg.json.token || '';
  if (!rec('1 login', lg.status === 200 && token, 'HTTP ' + lg.status)) return finish();
  if (jwtTenant(token) !== TEST_TENANT) { rec('1b guarda de tenant', false, 'el JWT NO es de ' + TEST_TENANT + ' -> ABORTA sin escribir nada'); token = ''; return finish(); }
  rec('1b guarda de tenant', true, TEST_TENANT);

  // 2 productos
  const pr = await api('GET', '/api/products');
  const list = Array.isArray(pr.json) ? pr.json : ((pr.json && (pr.json.items || pr.json.products || pr.json.data)) || []);
  if (!rec('2 productos', list.length >= 2, list.length + ' productos')) return finish();
  const [p1, p2] = list;

  // 3 venta con modificadores y nota
  const mk = (p, qty, extra) => Object.assign({ id: p.id, product_id: p.id, code: p.code, name: p.name, price: Number(p.price) || 10, qty }, extra);
  const items = [mk(p1, 2, { modifiers: [{ label: 'Arroz' }, { label: 'Queso extra', price_delta: 15 }], note: 'sin sal' }), mk(p2, 1, { modifiers: [], note: '' })];
  const total = items.reduce((s, i) => s + i.price * i.qty, 0);
  const sale = await api('POST', '/api/sales', { items, total, payment_method: 'efectivo', amount_paid: total }, { 'Idempotency-Key': uuid() });
  const saleId = sale.json && (sale.json.id || (sale.json.sale && sale.json.sale.id));
  if (!rec('3 POST /api/sales', (sale.status === 200 || sale.status === 201) && saleId, 'HTTP ' + sale.status + ' ' + (saleId ? '' : sale.text.slice(0, 100)))) return finish();

  // 4 detalle
  const det = await api('GET', '/api/sales/' + saleId);
  const dit = det.json && (det.json.items || (det.json.sale && det.json.sale.items) || [])[0];
  rec('4 GET /api/sales/:id conserva modifiers+note [requiere deploy]', det.status === 200 && dit && (dit.modifiers || []).length === 2 && dit.note === 'sin sal', 'HTTP ' + det.status);

  // 5 recibo / reimpresion
  const rc = await api('GET', '/api/sales/' + saleId + '/receipt');
  rec('5a recibo HTML muestra modificadores [requiere deploy]', rc.status === 200 && /Arroz/.test(rc.text) && /Queso extra/.test(rc.text) && /sin sal/.test(rc.text), 'HTTP ' + rc.status);
  const rp = await api('GET', '/api/sales/' + saleId + '/reprint');
  rec('5b reprint HTML muestra modificadores', rp.status === 200 && /Arroz/.test(rp.text) && /sin sal/.test(rp.text), 'HTTP ' + rp.status);

  // 6 devolucion SOLO por code
  const ret = await api('POST', '/api/returns', { sale_id: saleId, items: [{ code: p1.code, qty: 1 }], reason: 'e2e loyverse', refund_method: 'cash' });
  rec('6a devolucion por code -> 200 y refund_amount>0 [requiere deploy]', ret.status === 200 && ret.json && Number(ret.json.refund_amount) > 0, 'HTTP ' + ret.status + ' ' + (ret.json && (ret.json.error || ret.json.refund_amount)));
  const ret2 = await api('POST', '/api/returns', { sale_id: saleId, items: [{ code: p1.code, qty: 5 }], reason: 'e2e exceso' });
  rec('6b devolver de mas -> 400', ret2.status === 400, 'HTTP ' + ret2.status);

  // 7 ticket abierto
  const pend = await api('POST', '/api/sales/pending', { items, total, name: 'Mesa E2E', comment: 'comentario e2e', dining: 'Para llevar', employee: 'e2e', notes: 'nota' }, { 'Idempotency-Key': uuid() });
  const pid = pend.json && pend.json.id;
  rec('7a POST /api/sales/pending (id real, no PND-*)', pend.status === 201 && pid && !/^PND-/.test(String(pid)), 'HTTP ' + pend.status + ' id=' + pid);
  const pl = await api('GET', '/api/sales/pending');
  const row = ((pl.json && pl.json.items) || []).find(r => String(r.id) === String(pid));
  let meta = {}; try { meta = require(path.join(__dirname, '..', 'public', 'volvix-open-tickets.js')).parseMeta(row || {}); } catch (_) {}
  rec('7b lista devuelve name/comment/dining/employee (parseMeta real)', row && meta.name === 'Mesa E2E' && meta.comment === 'comentario e2e' && meta.dining === 'Para llevar' && meta.employee === 'e2e', row ? JSON.stringify(meta) : 'no aparece');
  if (pid) { const dl = await api('DELETE', '/api/sales/pending/' + encodeURIComponent(pid)); rec('7c DELETE del ticket abierto', dl.status === 200, 'HTTP ' + dl.status); }

  // 8 active-modules
  const am = await api('GET', '/api/tenant/active-modules');
  const mods = (am.json && am.json.modules) || {};
  const hidden = MODULES.filter(k => mods[k] && mods[k].state && mods[k].state !== 'enabled');
  rec('8 active-modules: los 6 modulos ON (o sin fila = ON)', am.status === 200 && am.json && am.json.ok && !hidden.length, hidden.length ? 'ocultos: ' + hidden.join(',') : 'defaults_open=' + (am.json && am.json.defaults_open));

  // 9 toggle (solo superadmin)
  if (cred.admin_token) {
    const keep = token; token = cred.admin_token;
    const off = await api('POST', '/api/admin/tenants/' + TEST_TENANT + '/modules', { modules: Object.fromEntries(MODULES.map(k => [k, { state: 'hidden' }])) });
    token = keep; const a2 = await api('GET', '/api/tenant/active-modules'); const m2 = (a2.json && a2.json.modules) || {};
    rec('9a apagar los 6 -> active-modules los marca hidden', off.status < 300 && MODULES.every(k => m2[k] && m2[k].state === 'hidden'), 'HTTP ' + off.status);
    token = cred.admin_token; await api('POST', '/api/admin/tenants/' + TEST_TENANT + '/modules', { modules: Object.fromEntries(MODULES.map(k => [k, { state: 'enabled' }])) }); token = keep;
    const a3 = await api('GET', '/api/tenant/active-modules'); const m3 = (a3.json && a3.json.modules) || {};
    rec('9b reencender los 6', MODULES.every(k => m3[k] && m3[k].state === 'enabled'), '');
  } else rec('9 toggle on/off', true, 'OMITIDO (sin admin_token de superadmin en el JSON)');
  finish();
})().catch(e => { rec('ERROR', false, e.message); finish(); });

function finish() {
  const fails = results.filter(r => !r.ok).length;
  try { fs.writeFileSync(outFile, JSON.stringify({ when: new Date().toISOString(), base: BASE, tenant: TEST_TENANT, fails, results }, null, 2)); console.log('\nResultados: ' + outFile); } catch (_) {}
  console.log(fails ? fails + ' FALLA(S)' : 'TODO OK');
  process.exitCode = fails ? 1 : 0;
}
