#!/usr/bin/env node
/* Prueba de IMPRESION DE COMANDA contra una impresora TCP FALSA (solo 127.0.0.1:19100).
 *
 *   node scripts/test-comanda-tcp-fake.js
 *
 * - NUNCA toca una impresora real: el servidor falso escucha en 127.0.0.1 (puerto 19100 por defecto,
 *   VLX_FAKE_PORT lo cambia). No escribe en el userData real: usa un directorio temporal propio.
 * - Tramo A: electron/comanda-printer.js (main del .exe NUEVO) + electron/printer-network.js reales.
 * - Tramo B: .exe VIEJO (v1.0.344, se lee de git) detras del adaptador de public/volvix-platform.js:
 *   comprueba que los cancel:true NO llegan a cocina como platillos nuevos.
 * - El IPC volvix:comanda:print end-to-end necesita Electron; aqui solo se avisa si no esta instalado.
 * Sin dependencias: solo node.
 */
'use strict';
const net = require('net');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.VLX_FAKE_PORT) || 19100;
const HOST = '127.0.0.1';
// Directorio temporal DENTRO del repo (el disco del sistema puede estar lleno); se borra al terminar.
const TMP = process.env.VLX_TEST_TMP || path.join(ROOT, '.tmp-comanda-test-' + process.pid);

let fails = 0, checks = 0;
function ok(cond, msg) { checks++; if (!cond) { fails++; console.log('  FALLA: ' + msg); } else console.log('  ok: ' + msg); }

// ---- impresora falsa: guarda los bytes de cada conexion ----
const jobs = [];
const server = net.createServer((sock) => {
  const chunks = [];
  sock.on('data', (d) => chunks.push(d));
  sock.on('close', () => jobs.push(Buffer.concat(chunks)));
  sock.on('error', () => {});
});
const listen = () => new Promise((res, rej) => { server.once('error', rej); server.listen(PORT, HOST, res); });
const settle = () => new Promise((r) => setTimeout(r, 250));

function textOf(buf) { return buf.toString('latin1'); }
// Quita secuencias ESC/GS de control para quedarnos con el texto imprimible
function plain(buf) {
  return textOf(buf).replace(/\x1b[@!EGa-z]\x00?[\x00-\x7f]?/g, (m) => (m.length > 2 ? '' : '')).replace(/\x1d[!Vv][\x00-\xff]{1,2}/g, '').replace(/[\x00-\x09\x0b-\x1f]/g, '');
}

// Texto imprimible: descarta las secuencias ESC/GS (ESC @ = 2 bytes; ESC x n = 3; GS ! n = 3; GS V m n = 4)
function plain(buf) {
  let out = '';
  for (let i = 0; i < buf.length; i++) {
    const c = buf[i];
    if (c === 0x1b) { i += buf[i + 1] === 0x40 ? 1 : 2; continue; }
    if (c === 0x1d) { i += buf[i + 1] === 0x56 ? 3 : 2; continue; }
    out += String.fromCharCode(c);
  }
  return out;
}

async function main() {
  fs.mkdirSync(TMP, { recursive: true });
  await listen();
  console.log('Impresora falsa en ' + HOST + ':' + PORT + ' | tmp: ' + path.relative(ROOT, TMP));

  const net_ = require(path.join(ROOT, 'electron', 'printer-network.js'));
  const cp = require(path.join(ROOT, 'electron', 'comanda-printer.js'));
  const fakeApp = { getPath: () => TMP };
  cp.save(fakeApp, { enabled: true, printers: [{ name: 'Falsa', ip: HOST, port: PORT, width: 48, categories: [] }] });

  // ============ TRAMO A: main del .exe nuevo ============
  console.log('\n[A] electron/comanda-printer.js (exe nuevo)');
  let r = await cp.send(fakeApp, net_, { folio: 'T1', time: '12:00', mode: 'COMER AQUI', items: [{ qty: 2, name: 'Milanesa de Res' }, { qty: 1, name: 'Jalapeños añejos' }] });
  await settle();
  ok(r && r.ok, 'send() normal devuelve ok');
  let b = jobs[jobs.length - 1] || Buffer.alloc(0);
  ok(b[0] === 0x1b && b[1] === 0x40, 'empieza con ESC @ (init)');
  ok(b.slice(-4).includes(0x1d) && textOf(b.slice(-4)).indexOf('\x1dV') >= 0, 'termina con corte GS V');
  ok([...b].every((x) => x < 0x80), 'todo ASCII (sin acentos rotos)');
  ok(/MILANESA DE RES/.test(textOf(b)) && /JALAPENOS ANEJOS/.test(textOf(b)), 'nombres en mayusculas y sin acentos/enie');

  const n0 = jobs.length;
  r = await cp.send(fakeApp, net_, { folio: 'T2', items: [{ qty: 1, name: 'Milanesa', modifiers: ['Arroz', 'Sin cebolla'], note: 'bien cocida' }] });
  await settle(); b = jobs[jobs.length - 1];
  ok(jobs.length === n0 + 1 && /\* ARROZ/.test(textOf(b)) && /\* SIN CEBOLLA/.test(textOf(b)) && /NOTA: bien cocida/.test(textOf(b)), 'modificadores y nota bajo el item');

  const n1 = jobs.length;
  r = await cp.send(fakeApp, net_, { folio: 'T3', items: [{ qty: 1, name: 'Pizza grande' }, { qty: 2, name: 'Pizza chica', cancel: true }] });
  await settle(); b = jobs[jobs.length - 1]; const t3 = textOf(b);
  const iCancel = t3.indexOf('*** CANCELAR ***');
  ok(jobs.length === n1 + 1 && iCancel > 0, 'exe nuevo: el cancelado va en su seccion "*** CANCELAR ***"');
  ok(t3.indexOf('PIZZA GRANDE') > 0 && t3.indexOf('PIZZA GRANDE') < iCancel && t3.indexOf('PIZZA CHICA') > iCancel, 'exe nuevo: lo nuevo antes de CANCELAR y lo cancelado despues (no como platillo nuevo)');

  const n2 = jobs.length;
  r = await cp.send(fakeApp, net_, { folio: 'T4', items: [{ qty: 1, name: 'Pizza', cancel: true }] });
  await settle();
  ok(jobs.length === n2 + 1 && /\*\*\* CANCELAR \*\*\*/.test(textOf(jobs[jobs.length - 1])), 'exe nuevo: solo-cancel imprime un ticket solo de CANCELAR (funcion T1.7 intencional)');

  // ============ TRAMO B: .exe VIEJO v1.0.344 detras del adaptador ============
  console.log('\n[B] .exe viejo v1.0.344 + adaptador public/volvix-platform.js');
  let oldSrc = null;
  try { oldSrc = execFileSync('git', ['show', 'v1.0.344:electron/comanda-printer.js'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch (_) {}
  if (!oldSrc) { console.log('  (omitido: no existe el tag v1.0.344 en este clon)'); } else {
    const oldPath = path.join(TMP, 'comanda-printer-v1.0.344.js');
    fs.writeFileSync(oldPath, oldSrc);
    const OLD = require(oldPath);
    const oldTmp = path.join(TMP, 'old-userdata'); fs.mkdirSync(oldTmp, { recursive: true });
    const oldApp = { getPath: () => oldTmp };
    OLD.save(oldApp, { enabled: true, ip: HOST, port: PORT, width: 48 });
    const api = {
      comandaGet: async () => ({ ok: true, cfg: OLD.load(oldApp) }),
      comandaSave: async (c) => ({ ok: true, cfg: OLD.save(oldApp, c) }),
      comandaPrint: (c) => OLD.send(oldApp, net_, c),
      printRawText: async (o) => (o && o.comanda ? OLD.send(oldApp, net_, o.comanda) : { ok: true })
    };
    const g = { volvixElectron: api, localStorage: { getItem() { return null; }, setItem() {} }, console };
    g.window = g; g.globalThis = g; vm.createContext(g);
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'public', 'volvix-platform.js'), 'utf8'), g);
    const P = g.VolvixPlatform;

    const j0 = jobs.length;
    await P.printComanda({ folio: 'V1', items: [{ qty: 1, name: 'Pizza grande', modifiers: ['Queso extra'] }, { qty: 2, name: 'Pizza chica', cancel: true }] });
    await settle(); const tv = textOf(jobs[jobs.length - 1] || Buffer.alloc(0));
    ok(jobs.length === j0 + 1 && plain(jobs[jobs.length - 1] || Buffer.alloc(0)).replace(/\s+/g, '').indexOf('PIZZAGRANDE(QUESOEXTRA)') >= 0, 'viejo/printComanda: modificador aplanado al nombre');
    ok(!/PIZZA CHICA/.test(tv), 'viejo/printComanda: el cancel:true NO llega a cocina');

    const j1 = jobs.length;
    await P.printTicket({ text: 'ticket', comanda: { folio: 'V2', items: [{ qty: 3, name: 'Hamburguesa' }, { qty: 1, name: 'Papas', cancel: true }] } });
    await settle(); const tt = textOf(jobs[jobs.length - 1] || Buffer.alloc(0));
    ok(jobs.length === j1 + 1 && /HAMBURGUESA/.test(tt) && !/PAPAS/.test(tt), 'viejo/printTicket (N1): la comanda del ticket tampoco lleva el cancelado');

    const j2 = jobs.length;
    const rr = await P.printComanda({ folio: 'V3', items: [{ qty: 1, name: 'Pizza', cancel: true }] });
    await settle();
    ok(jobs.length === j2 && rr && rr.empty, 'viejo: solo-cancel NO imprime nada');
    const rg = await P.comandaSave({ enabled: true, printers: [] });
    ok(rg && rg.ok && OLD.load(oldApp).ip === HOST, 'viejo: guardar sin impresoras NO pisa la IP configurada');
  }

  // ============ IPC end-to-end ============
  console.log('\n[C] IPC volvix:comanda:print (Electron)');
  let hasElectron = false;
  try { require.resolve('electron', { paths: [ROOT] }); hasElectron = true; } catch (_) {}
  console.log(hasElectron ? '  electron presente pero NO se lanza aqui (requiere ventana); probar en el .exe.' : '  NO cubierto: electron no esta instalado en node_modules (no se descargo nada).');

  console.log('\n' + (fails ? 'RESULTADO: ' + fails + ' FALLA(S) de ' + checks : 'RESULTADO: OK (' + checks + ' verificaciones)'));
}

main().catch((e) => { console.log('ERROR: ' + (e && e.stack || e)); fails++; }).finally(() => {
  try { server.close(); } catch (_) {}
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) {}
  process.exit(fails ? 1 : 0);
});
