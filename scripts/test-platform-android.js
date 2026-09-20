// Harness node: adaptador ANDROID de window.VolvixPlatform con Capacitor/plugins falsos.
'use strict';
const assert = require('assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const load = (f) => fs.readFileSync(path.join(__dirname, '..', 'public', f), 'utf8');
function mkWindow(withPlugin) {
  const store = {}; const calls = [];
  const win = {
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } },
    Capacitor: { isNativePlatform: () => true, Plugins: withPlugin ? { VolvixPrinter: {
      printRaw: async (o) => { calls.push(['net', o.host, o.port, Buffer.from(o.data, 'base64').toString('latin1')]); return { ok: true, bytesWritten: Buffer.from(o.data, 'base64').length }; },
      printBluetooth: async (o) => { calls.push(['bt', o.address, Buffer.from(o.data, 'base64').toString('latin1')]); return { ok: true, bytesWritten: 1 }; },
      ping: async (o) => ({ ok: o.host === '10.0.0.9' }),
      listBluetooth: async () => ({ ok: true, enabled: true, devices: [{ name: 'PT-210', address: 'AA:BB:CC:DD:EE:FF' }] })
    } } : {} },
    btoa: (s) => Buffer.from(s, 'latin1').toString('base64'), document: null, console
  };
  win.window = win; vm.createContext(win);
  vm.runInContext(load('volvix-escpos.js'), win); vm.runInContext(load('volvix-platform.js'), win);
  return { win, calls, store, P: win.VolvixPlatform };
}
(async () => {
  let n = 0;
  // 1) kind + sin plugin: nunca lanza
  let t = mkWindow(false); assert.strictEqual(t.P.kind, 'android');
  let r = await t.P.printTicket({ text: 'hola' }); assert.strictEqual(r.ok, false); n++;
  r = await t.P.scanBarcode(); assert.strictEqual(r.unsupported, true); n++;
  // 2) sin impresora de tickets configurada: aviso claro, no rompe
  t = mkWindow(true);
  r = await t.P.printTicket({ text: 'Total $10' }); assert.strictEqual(r.ok, false); assert.strictEqual(r.unsupported, true); assert.match(r.error, /no configurada/); n++;
  // 3) ticket por red + cajon + comanda a 2 impresoras (comida->A, bebida->B)
  t.store.volvix_printer_mode = 'ip'; t.store.volvix_printer_ip = '10.0.0.5'; t.store.volvix_printer_port = '9100';
  await t.P.comandaSave({ enabled: true, printers: [{ name: 'Cocina', ip: '10.0.0.20', categories: ['Guisados'] }, { name: 'Barra', ip: '10.0.0.21', port: 9101, categories: ['Bebidas'] }] });
  r = await t.P.printTicket({ text: 'Señor Gracias', openDrawer: true, comanda: { folio: 'T1', items: [{ qty: 1, name: 'Milanesa', category: 'Guisados', modifiers: ['Arroz'] }, { qty: 2, name: 'Coca', category: 'Bebidas' }] } });
  assert.strictEqual(r.ok, true); assert.strictEqual(r.comanda.ok, true); n++;
  const by = (h) => t.calls.filter((c) => c[1] === h)[0];
  assert.ok(by('10.0.0.5')[3].includes('Se\xA4or Gracias') && by('10.0.0.5')[3].endsWith('\x1bp\x00\x3c\x78')); n++;
  assert.ok(by('10.0.0.20')[3].includes('MILANESA') && by('10.0.0.20')[3].includes('* ARROZ') && !by('10.0.0.20')[3].includes('COCA')); n++;
  assert.ok(by('10.0.0.21')[3].includes('COCA') && by('10.0.0.21')[2] === 9101 && !by('10.0.0.21')[3].includes('MILANESA')); n++;
  // 4) comandas deshabilitadas por defecto = no hace nada (igual que el .exe)
  const t2 = mkWindow(true); r = await t2.P.printComanda({ items: [{ qty: 1, name: 'x' }] }); assert.strictEqual(r.skipped, true); n++;
  // 5) config: get/save normaliza; test manda 1 comanda de prueba
  const g = await t.P.comandaGet(); assert.strictEqual(g.cfg.printers.length, 2); n++;
  t.calls.length = 0; r = await t.P.comandaTest({ printers: [{ ip: '10.0.0.30' }] }); assert.strictEqual(r.ok, true); assert.ok(t.calls[0][3].includes('PRUEBA')); n++;
  // 6) Bluetooth: modo bluetooth + MAC -> printBluetooth; openDrawer -> pulso
  t.store.volvix_printer_mode = 'bluetooth'; t.store.volvix_bt_printer_mac = 'AA:BB:CC:DD:EE:FF'; t.calls.length = 0;
  r = await t.P.printTicket({ text: 'x' }); assert.strictEqual(r.ok, true); assert.strictEqual(t.calls[0][0], 'bt'); n++;
  t.calls.length = 0; r = await t.P.openDrawer(); assert.ok(t.calls[0][2].endsWith('\x1bp\x00\x3c\x78')); n++;
  // 7) target override (Probar desde Configuracion) + ping + lista BT
  t.calls.length = 0; r = await t.P.printTicket({ text: 'p', target: { t: 'net', host: '10.0.0.77', port: 9100 } }); assert.strictEqual(t.calls[0][1], '10.0.0.77'); n++;
  assert.strictEqual((await t.P.pingPrinter('10.0.0.9', 9100)).ok, true); assert.strictEqual((await t.P.pingPrinter('1.1.1.1', 9100)).ok, false); n++;
  assert.strictEqual((await t.P.listBluetoothPrinters()).devices[0].name, 'PT-210'); n++;
  // 8) modo usb en android -> aviso, no rompe
  t.store.volvix_printer_mode = 'usb'; r = await t.P.printTicket({ text: 'x' }); assert.strictEqual(r.unsupported, true); n++;
  console.log('OK platform android: ' + n + ' aserciones');
})().catch((e) => { console.error('FALLO', e); process.exit(1); });
