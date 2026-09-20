// Harness local T1.1: logica de lista/orden/busqueda/merge y flujo guardar->abrir->agregar->re-guardar.
// Uso: node scripts/test-open-tickets.js  (sin red, sin BD)
const fs = require('fs'), assert = require('assert');
const OT = require('../public/volvix-open-tickets.js');
const html = fs.readFileSync(__dirname + '/../public/salvadorex-pos.html', 'latin1').replace(/\r/g, '');
const a = html.indexOf('  window.VolvixComanda = (function () {');
const b = html.indexOf('  // ============================================================\n  // 6) SELECTOR DE CLIENTE');
assert(a > 0 && b > a);
const block = html.slice(a, b);

// ---- logica pura
const rows = [
  { id: 1, name: 'Mesa 2', total: 150, created_at: '2026-09-19T15:00:00Z', items: [{ code: 'A', name: 'Milanesa', price: 100, qty: 1 }] },
  { id: 2, notes: 'VLXMETA:' + JSON.stringify({ n: 'Barra', c: 'sin cebolla', e: 'Ana', d: 'Para llevar', t: 'nota' }), total: 50, created_at: '2026-09-19T16:00:00Z', items: [{ code: 'A', name: 'Milanesa', price: 100, qty: 2 }, { code: 'B', name: 'Coca', price: 20, qty: 1 }] },
  { id: 3, name: 'Alfredo', comment: 'cumple', total: 300, created_at: '2026-09-19T14:00:00Z', items: [] },
].map(OT.normRow);
assert.strictEqual(rows[1].name, 'Barra'); assert.strictEqual(rows[1].employee, 'Ana'); assert.strictEqual(rows[1].note, 'nota');
assert.deepStrictEqual(OT.filterSort(rows, { sort: 'name' }).map(r => r.id), [3, 2, 1]);
assert.deepStrictEqual(OT.filterSort(rows, { sort: 'total' }).map(r => r.id), [3, 1, 2]);
assert.deepStrictEqual(OT.filterSort(rows, { sort: 'time' }).map(r => r.id), [2, 1, 3]);
assert.deepStrictEqual(OT.filterSort(rows, { q: 'cebolla' }).map(r => r.id), [2]);
assert.deepStrictEqual(OT.filterSort(rows, { q: 'ANA' }).map(r => r.id), [2]);
const merged = OT.mergeItems([rows[0], rows[1]]);
assert.strictEqual(merged.length, 2); assert.strictEqual(merged.find(i => i.code === 'A').qty, 3);
assert.deepStrictEqual(OT.predefinedNames('T1').slice(0, 2), ['Mesa 1', 'Mesa 2']);
console.log('logica pura OK');

// ---- flujo
const server = []; let nid = 1; const comandas = []; const toasts = [];
global.window = global; global.localStorage = { getItem: () => null, setItem() {} };
global.document = { getElementById: () => null };
global.CART = []; global.VolvixOpenTickets = Object.assign({}, OT);
global.VolvixPlatform = { printComanda: async c => { comandas.push(c); } };
global.showToast = m => toasts.push(m); global.renderCart = () => {};
global._vTenant = () => 'T1'; global.idbQueue = async () => {};
global.confirm = () => true;
global._authFetch = async (url, o = {}) => {
  const m = (o.method || 'GET');
  if (m === 'POST') { const p = JSON.parse(o.body); const row = Object.assign({ id: 'P' + nid++, created_at: new Date().toISOString() }, p); server.push(row); return { ok: true, json: async () => ({ ok: true, id: row.id }) }; }
  if (m === 'DELETE') { const id = decodeURIComponent(url.split('/').pop()); const i = server.findIndex(r => r.id === id); if (i >= 0) server.splice(i, 1); return { ok: true, json: async () => ({}) }; }
  return { ok: true, json: async () => ({ ok: true, items: server.slice() }) };
};
let asked = 0, chosenName = 'Mesa 3';
global.VolvixOpenTickets.askSaveMeta = async () => { asked++; return { name: chosenName, comment: 'c' }; };
let listOpts = null; global.VolvixOpenTickets.openList = o => { listOpts = o; };
new Function(block + '\nwindow.__t = { CARTref: () => CART };').call(global);
// el bloque usa CART libre: lo enlazamos como global (ya definido)
(async () => {
  CART.push({ id: 'p1', code: 'A', name: 'Milanesa', price: 100, qty: 1, modifiers: [{ label: 'Arroz' }] });
  await window.savePendingSale();
  assert.strictEqual(asked, 1); assert.strictEqual(server.length, 1); assert.strictEqual(server[0].name, 'Mesa 3');
  assert.strictEqual(CART.length, 0);
  // Guardar con carrito vacio abre la lista
  await window.savePendingSale(); assert(listOpts, 'abre lista');
  assert.strictEqual(listOpts.rows.length, 1);
  listOpts.onOpen(listOpts.rows[0]);
  assert.strictEqual(CART.length, 1); assert.strictEqual(window.__vlxOpenTicket.name, 'Mesa 3');
  CART.push({ id: 'p2', code: 'B', name: 'Coca', price: 20, qty: 1, modifiers: [] });
  comandas.length = 0;
  await window.savePendingSale();
  assert.strictEqual(asked, 1, 'no vuelve a preguntar');
  assert.strictEqual(server.length, 1, 'actualiza: reemplaza, no duplica');
  assert.strictEqual(server[0].name, 'Mesa 3'); assert.strictEqual(server[0].items.length, 2);
  assert.strictEqual(comandas.length, 1); assert.deepStrictEqual(comandas[0].items.map(i => i.name), ['Coca'], 'solo lo nuevo a cocina');
  // segundo ticket + merge
  CART.push({ id: 'p1', code: 'A', name: 'Milanesa', price: 100, qty: 1, modifiers: [{ label: 'Arroz' }] });
  chosenName = 'Mesa 4'; await window.savePendingSale(); assert.strictEqual(server.length, 2);
  await window.restorePendingSale();
  const res = await listOpts.onMerge(listOpts.rows);
  assert.strictEqual(server.length, 1); assert.strictEqual(res.length, 1);
  assert.strictEqual(server[0].items.find(i => i.code === 'A').qty, 2);
  assert.strictEqual(server[0].name, 'Mesa 3 + Mesa 4');
  // pagar ticket abierto lo borra
  listOpts.onOpen(res[0]); window.__vlxCloseOpenTicket(); await new Promise(r => setTimeout(r, 5));
  assert.strictEqual(server.length, 0);
  console.log('flujo guardar->abrir->agregar->re-guardar->merge->cobrar OK');
})().catch(e => { console.error('FALLO', e); process.exit(1); });
