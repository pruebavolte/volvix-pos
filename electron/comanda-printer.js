'use strict';
// =========================================================================
// electron/comanda-printer.js — COMANDAS DE COCINA por impresora de red
// 2026-09-19: hasta hoy el POS solo imprimía el TICKET de cobro (USB, print-raw).
// Este módulo manda, además, una COMANDA (qué preparar, sin precios) a una
// impresora ESC/POS por red (JetDirect 9100) cada vez que se cobra.
//
// Config: <userData>/comanda-printer.json  { enabled, printers:[{name,ip,port,width,categories:[]}] }
//   (JSON viejo {enabled,ip,port,width} se migra solo a una impresora "Cocina")
//   - enabled=false (default) → no hace NADA (la flota no cambia de comportamiento).
//   - Se configura desde el menú Volvix → "Impresora de comandas (cocina)…".
// Texto en ASCII puro (sin acentos) para que salga bien en cualquier térmica.
// =========================================================================

const fs = require('fs');
const path = require('path');

const DEFAULTS = { enabled: false, printers: [] };

function cfgPath(app) {
  return path.join(app.getPath('userData'), 'comanda-printer.json');
}

// Normaliza cualquier objeto a una config válida (se aplica al leer Y al guardar)
function cleanPrinter(p, idx) {
  const num = (v, def, min, max) => { const n = parseInt(v, 10); return Number.isFinite(n) && n >= min && n <= max ? n : def; };
  let cats = p && p.categories;
  if (typeof cats === 'string') cats = cats.split(',');
  if (!Array.isArray(cats)) cats = [];
  cats = cats.map((c) => String(c || '').trim().slice(0, 60)).filter(Boolean).slice(0, 50);
  return {
    name: String((p && p.name) || ('Cocina' + (idx ? ' ' + (idx + 1) : ''))).trim().slice(0, 40) || 'Cocina',
    ip: String((p && p.ip) || '').trim().replace(/[^0-9a-zA-Z.\-]/g, '').slice(0, 64),
    port: num(p && p.port, 9100, 1, 65535),
    width: num(p && p.width, 48, 24, 64),
    categories: cats
  };
}
function clean(cfg) {
  let list = cfg && Array.isArray(cfg.printers) ? cfg.printers : null;
  if (!list) list = (cfg && cfg.ip) ? [{ name: 'Cocina', ip: cfg.ip, port: cfg.port, width: cfg.width, categories: [] }] : [];
  return { enabled: !!(cfg && cfg.enabled), printers: list.slice(0, 10).map(cleanPrinter) };
}

// Cache en memoria: con enabled=false (default de toda la flota) no se toca disco en cada ticket.
let _cache = null;
function load(app) {
  if (_cache) return Object.assign({}, _cache);
  try { _cache = clean(JSON.parse(fs.readFileSync(cfgPath(app), 'utf8'))); }
  catch (_) { _cache = clean(DEFAULTS); }
  return Object.assign({}, _cache);
}

function save(app, cfg) {
  const c = clean(cfg);
  fs.writeFileSync(cfgPath(app), JSON.stringify(c, null, 2), 'utf8');
  _cache = c;
  return Object.assign({}, c);
}

// Quitar acentos/eñes → ASCII (las térmicas chinas imprimen basura fuera de ASCII)
function ascii(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[ñÑ]/g, (c) => (c === 'ñ' ? 'n' : 'N'))
    .replace(/[^\x20-\x7E\n]/g, '');
}

// Construye los bytes ESC/POS de la comanda.
// c = { folio, time, mode, note, customer, items:[{qty,name,modifiers?:[string],note?}] }
function buildEscPos(c, width) {
  const w = width || 48;
  const ESC = '\x1b', GS = '\x1d';
  const init = ESC + '@';
  const center = ESC + 'a\x01';
  const left = ESC + 'a\x00';
  const big = GS + '!\x11';       // doble alto + doble ancho
  const tall = GS + '!\x01';      // doble alto
  const norm = GS + '!\x00';
  const boldOn = ESC + 'E\x01', boldOff = ESC + 'E\x00';
  const cut = GS + 'V\x42\x00';
  const sep = '-'.repeat(w) + '\n';

  let out = init;
  out += center + big + 'COMANDA\n' + norm;
  const head = [];
  if (c.folio) head.push('Ticket ' + ascii(c.folio));
  if (c.time) head.push(ascii(c.time));
  if (head.length) out += center + head.join('   ') + '\n';
  if (c.mode) out += center + tall + boldOn + ascii(c.mode) + '\n' + boldOff + norm;
  out += left + sep;
  const items = c.items || [];
  const adds = items.filter((it) => !it.cancel), cancels = items.filter((it) => it.cancel);
  const renderItem = (it) => {
    const qty = String(it.qty || 1).replace(/[^0-9]/g, '').slice(0, 3) || '1';
    // En doble ancho caben w/2 caracteres por renglón
    const maxName = Math.max(8, Math.floor(w / 2) - qty.length - 2);
    const name = ascii(it.name || '').toUpperCase().replace(/\s+/g, ' ').trim();
    // Partir en renglones por palabra (máx 3 renglones) para no cortar "PAPAS" en "P / APAS"
    const rows = [];
    let cur = '';
    name.split(' ').forEach((wd) => {
      if (!cur) { cur = wd; return; }
      if ((cur + ' ' + wd).length <= maxName) cur += ' ' + wd;
      else { rows.push(cur); cur = wd; }
    });
    if (cur) rows.push(cur);
    rows.slice(0, 3).forEach((r, idx) => {
      out += big + (idx === 0 ? qty + ' ' : ' '.repeat(qty.length + 1)) + r.slice(0, maxName) + '\n';
    });
    out += norm;
    // T1.3: modificadores bajo el item, tamano normal, prefijo '  * '; comentario del item debajo
    (it.modifiers || []).slice(0, 20).forEach((m) => {
      out += '  * ' + ascii(String(m)).toUpperCase().slice(0, w - 4) + '\n';
    });
    if (it.note) out += '  NOTA: ' + ascii(String(it.note)).slice(0, w - 8) + '\n';
  };
  adds.slice(0, 60).forEach(renderItem);
  if (cancels.length) {
    if (adds.length) out += sep;
    out += center + tall + boldOn + '*** CANCELAR ***\n' + boldOff + norm + left;
    cancels.slice(0, 60).forEach(renderItem);
  }
  out += sep;
  if (c.note) out += tall + boldOn + 'NOTA: ' + ascii(c.note) + '\n' + boldOff + norm;
  if (c.customer && !/publico en general/i.test(ascii(c.customer))) out += 'Cliente: ' + ascii(c.customer) + '\n';
  out += '\n\n\n\n' + cut;
  return out;
}

// Reparte los items entre impresoras segun item.category (puro, testeable).
// Vacio = comodin (recibe lo que nadie reclamo). Sin match ni comodin -> primera impresora.
function route(printers, items) {
  const norm = (v) => ascii(v).trim().toLowerCase();
  const buckets = printers.map(() => []);
  const wild = printers.findIndex((p) => !p.categories.length);
  (items || []).forEach((it) => {
    const cat = norm(it && it.category);
    let idx = cat ? printers.findIndex((p) => p.categories.some((c) => norm(c) === cat)) : -1;
    if (idx < 0) idx = wild >= 0 ? wild : 0;
    buckets[idx].push(it);
  });
  return buckets;
}

// Envía la comanda (una por impresora, en paralelo). Nunca lanza: devuelve {ok, error}.
async function send(app, printerNetwork, comanda) {
  try {
    const cfg = load(app);
    const printers = cfg.printers.filter((p) => p.ip);
    if (!cfg.enabled || !printers.length) return { ok: false, skipped: true, error: 'comandas deshabilitadas' };
    if (!printerNetwork || typeof printerNetwork.printToIP !== 'function') return { ok: false, error: 'printer-network no disponible' };
    if (!comanda || !Array.isArray(comanda.items) || !comanda.items.length) return { ok: false, error: 'comanda sin items' };
    const cut = (v) => String(v || '').slice(0, 120);
    const items = comanda.items.slice(0, 120).map((i) => ({ qty: i && i.qty, name: cut(i && i.name), cancel: !!(i && i.cancel), category: cut(i && i.category),
      modifiers: Array.isArray(i && i.modifiers) ? i.modifiers.slice(0, 20).map(cut) : [], note: cut(i && i.note) }));
    const head = { folio: cut(comanda.folio), time: cut(comanda.time), mode: cut(comanda.mode), note: cut(comanda.note), customer: cut(comanda.customer) };
    const buckets = route(printers, items);
    const results = await Promise.all(printers.map(async (p, k) => {
      if (!buckets[k].length) return { ok: true, printer: p.name, empty: true };
      try {
        const r = await printerNetwork.printToIP(p.ip, p.port, buildEscPos(Object.assign({}, head, { items: buckets[k] }), p.width), { timeout: 8000 });
        return Object.assign({}, r, { printer: p.name });
      } catch (e) { return { ok: false, printer: p.name, error: e.message }; }
    }));
    const failed = results.filter((r) => !r.ok);
    return { ok: !failed.length, results, error: failed.length ? failed.map((r) => r.printer + ': ' + r.error).join('; ') : undefined };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function sampleComanda() {
  return {
    folio: 'PRUEBA', time: new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }),
    mode: 'COMER AQUI', note: 'Sin cebolla',
    items: [{ qty: 2, name: 'Enchiladas Suizas' }, { qty: 1, name: 'Milanesa de Res con papas' }]
  };
}

// HTML del mini-config (se abre con preload.js → window.volvixElectron.comanda*)
function configHtml(cfg) {
  const esc = (s) => String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Impresora de comandas</title>
<style>body{font-family:Segoe UI,Arial,sans-serif;margin:0;padding:18px;background:#fafaf9;color:#222}
h2{margin:0 0 6px;font-size:18px}p{margin:0 0 14px;color:#555;font-size:13px}
label{display:block;font-size:13px;margin:10px 0 4px}input[type=text],input[type=number]{width:100%;padding:8px;border:1px solid #bbb;border-radius:6px;font-size:14px;box-sizing:border-box}
.row{display:flex;gap:10px}.row>div{flex:1}.chk{display:flex;align-items:center;gap:8px;margin-top:14px;font-size:14px}
.btns{display:flex;gap:10px;margin-top:18px}button{padding:9px 14px;border:0;border-radius:6px;font-size:14px;cursor:pointer}
#save{background:#1f7a3f;color:#fff}#test{background:#2b5fd9;color:#fff}#msg{margin-top:12px;font-size:13px;min-height:18px}</style></head><body>
<h2>Impresora de comandas (cocina)</h2>
<p>Al cobrar, además del ticket, se manda la comanda (productos y cantidades, sin precios) a esta impresora de red. Esta ventana edita la impresora principal; para varias impresoras por categoría usa Configuración → Periféricos → Impresoras.</p>
<div class="row"><div><label>IP de la impresora</label><input id="ip" type="text" value="${esc((cfg.printers[0] || {}).ip)}" placeholder="192.168.1.100"></div>
<div style="flex:0 0 110px"><label>Puerto</label><input id="port" type="number" value="${esc((cfg.printers[0] || {}).port || 9100)}"></div>
<div style="flex:0 0 130px"><label>Ancho (chars)</label><input id="width" type="number" value="${esc((cfg.printers[0] || {}).width || 48)}" title="48 = 80mm, 32 = 58mm"></div></div>
<label class="chk"><input id="enabled" type="checkbox" ${cfg.enabled ? 'checked' : ''}> Imprimir comandas al cobrar</label>
<div class="btns"><button id="test">Imprimir comanda de prueba</button><button id="save">Guardar</button></div>
<div id="msg"></div>
<script>
const $=id=>document.getElementById(id);const api=window.volvixElectron||{};
let base=${JSON.stringify(cfg.printers || [])};function read(){const p=Object.assign({name:'Cocina',categories:[]},base[0]||{},{ip:$('ip').value.trim(),port:parseInt($('port').value,10)||9100,width:parseInt($('width').value,10)||48});return {enabled:$('enabled').checked,printers:[p].concat(base.slice(1))};}
$('save').onclick=async()=>{try{const r=await api.comandaSave(read());$('msg').textContent=r&&r.ok?'Guardado. '+(r.cfg.enabled?'Comandas ACTIVAS ('+r.cfg.printers.length+' impresora(s))':'Comandas desactivadas'):'Error: '+(r&&r.error);}catch(e){$('msg').textContent='Error: '+e.message;}};
$('test').onclick=async()=>{$('msg').textContent='Enviando prueba...';try{const r=await api.comandaTest(read());$('msg').textContent=r&&r.ok?'Comanda de prueba enviada ('+r.bytesWritten+' bytes). Revise la impresora de cocina.':'No se pudo imprimir: '+(r&&r.error);}catch(e){$('msg').textContent='Error: '+e.message;}};
</script></body></html>`;
}

module.exports = { load, save, send, route, clean, buildEscPos, sampleComanda, configHtml, ascii };
