// Paridad byte a byte: public/volvix-escpos.js (web/android) vs electron/comanda-printer.js (.exe).
'use strict';
const assert = require('assert');
const E = require('../public/volvix-escpos.js');
const C = require('../electron/comanda-printer.js');
const cases = [
  { folio: 'CUENTA', time: '14:05', mode: 'COMER AQUI', note: 'Sin cebolla', items: [{ qty: 2, name: 'Enchiladas Suizas' }, { qty: 1, name: 'Milanesa de Res con papas', modifiers: ['Arroz', 'Frijoles'], note: 'bien cocida' }] },
  { folio: 'T-9', time: '09:00', mode: 'PARA LLEVAR', customer: 'María Peña', items: [{ qty: 12, name: 'Café Americano ÑANDÚ extra grande con crema batida y jarabe' }, { qty: 1, name: 'Sopa', cancel: true }] },
  { items: [{ qty: 1, name: 'Solo cancelar', cancel: true }] }
];
let n = 0;
[32, 48, 42].forEach((w) => cases.forEach((c) => { assert.strictEqual(E.buildComanda(c, w), C.buildEscPos(c, w)); n++; }));
const cfgs = [{ enabled: true, ip: '192.168.1.100' }, { enabled: 1, printers: [{ name: 'Barra', ip: '10.0.0.5', port: '9101', width: 32, categories: 'Bebidas, Cafe' }, { ip: '10.0.0.6' }] }, null, {}];
cfgs.forEach((c) => { assert.deepStrictEqual(E.clean(c), C.clean(c)); n++; });
const P = E.clean({ enabled: true, printers: [{ ip: '1.1.1.1', categories: ['Bebidas'] }, { ip: '2.2.2.2' }] }).printers;
const items = [{ name: 'a', category: 'Bebidas' }, { name: 'b', category: 'Guisados' }, { name: 'c' }];
assert.deepStrictEqual(E.route(P, items), C.route(P, items)); n++;
assert.strictEqual(E.ascii('Camión ñandú Ñ'), C.ascii('Camión ñandú Ñ')); n++;
// Ticket: CP437 y cajon
const t = E.buildTicket('Gracias, señor José ¿ok? Á', { openDrawer: true });
assert.ok(t.startsWith('\x1b@\x1bt\x00')); assert.ok(t.includes('se\xA4or Jos\x82 \xA8ok? A')); assert.ok(t.endsWith('\x1bp\x00\x3c\x78')); n++;
console.log('OK escpos parity: ' + n + ' aserciones');
