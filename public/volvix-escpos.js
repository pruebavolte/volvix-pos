/* 2026-09-20 Loyverse APK — Armado de bytes ESC/POS COMPARTIDO (vive en public/: web + exe + android).
 * Puro (sin DOM, sin hardware): el envio lo hace cada adaptador de window.VolvixPlatform.
 * Referencia y paridad: electron/comanda-printer.js (ascii/clean/route/buildEscPos son la misma logica;
 * scripts/test-escpos-parity.js compara byte a byte). Los "bytes" son strings latin1 (cada char = 1 byte).
 */
(function (root) {
  'use strict';

  var ESC = '\x1b', GS = '\x1d';

  // Quitar acentos/eñes -> ASCII (las termicas chinas imprimen basura fuera de ASCII)
  function ascii(s) {
    return String(s || '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[ñÑ]/g, function (c) { return c === 'ñ' ? 'n' : 'N'; })
      .replace(/[^\x20-\x7E\n]/g, '');
  }

  // Texto de TICKET: conserva acentos comunes en CP437 (ESC t 0) para que "Gracias por su compra, señor" salga bien.
  var CP437 = { 'á': 0xA0, 'é': 0x82, 'í': 0xA1, 'ó': 0xA2, 'ú': 0xA3, 'ñ': 0xA4, 'Ñ': 0xA5, 'ü': 0x81, 'Ü': 0x9A, 'É': 0x90, '¿': 0xA8, '¡': 0xAD };
  function cp437(s) {
    var out = '';
    String(s == null ? '' : s).split('').forEach(function (ch) {
      if (CP437[ch] != null) { out += String.fromCharCode(CP437[ch]); return; }
      var c = ch.charCodeAt(0);
      if ((c >= 0x20 && c <= 0x7E) || c === 10) { out += ch; return; }
      if (c === 13 || c === 9) { out += c === 9 ? ' ' : ''; return; }
      // Resto: quitar diacritico (Á -> A, à -> a) y descartar lo no imprimible
      var base = ch.normalize('NFD').replace(/[̀-ͯ]/g, '');
      out += base.replace(/[^\x20-\x7E]/g, '');
    });
    return out;
  }

  function num(v, def, min, max) { var n = parseInt(v, 10); return isFinite(n) && n >= min && n <= max ? n : def; }

  // Normaliza una impresora de comandas (se aplica al leer Y al guardar) — igual que comanda-printer.js
  function cleanPrinter(p, idx) {
    var cats = p && p.categories;
    if (typeof cats === 'string') cats = cats.split(',');
    if (!Array.isArray(cats)) cats = [];
    cats = cats.map(function (c) { return String(c || '').trim().slice(0, 60); }).filter(Boolean).slice(0, 50);
    return {
      name: String((p && p.name) || ('Cocina' + (idx ? ' ' + (idx + 1) : ''))).trim().slice(0, 40) || 'Cocina',
      ip: String((p && p.ip) || '').trim().replace(/[^0-9a-zA-Z.\-]/g, '').slice(0, 64),
      port: num(p && p.port, 9100, 1, 65535),
      width: num(p && p.width, 48, 24, 64),
      categories: cats
    };
  }
  function clean(cfg) {
    var list = cfg && Array.isArray(cfg.printers) ? cfg.printers : null;
    if (!list) list = (cfg && cfg.ip) ? [{ name: 'Cocina', ip: cfg.ip, port: cfg.port, width: cfg.width, categories: [] }] : [];
    return { enabled: !!(cfg && cfg.enabled), printers: list.slice(0, 10).map(cleanPrinter) };
  }

  // Bytes ESC/POS de la COMANDA. c = { folio, time, mode, note, customer, items:[{qty,name,modifiers?,note?,cancel?}] }
  function buildComanda(c, width) {
    var w = width || 48;
    var init = ESC + '@';
    var center = ESC + 'a\x01';
    var left = ESC + 'a\x00';
    var big = GS + '!\x11';       // doble alto + doble ancho
    var tall = GS + '!\x01';      // doble alto
    var norm = GS + '!\x00';
    var boldOn = ESC + 'E\x01', boldOff = ESC + 'E\x00';
    var cut = GS + 'V\x42\x00';
    var sep = new Array(w + 1).join('-') + '\n';

    var out = init;
    out += center + big + 'COMANDA\n' + norm;
    var head = [];
    if (c.folio) head.push('Ticket ' + ascii(c.folio));
    if (c.time) head.push(ascii(c.time));
    if (head.length) out += center + head.join('   ') + '\n';
    if (c.mode) out += center + tall + boldOn + ascii(c.mode) + '\n' + boldOff + norm;
    out += left + sep;
    var items = c.items || [];
    var adds = items.filter(function (it) { return !it.cancel; }), cancels = items.filter(function (it) { return it.cancel; });
    var renderItem = function (it) {
      var qty = String(it.qty || 1).replace(/[^0-9]/g, '').slice(0, 3) || '1';
      // En doble ancho caben w/2 caracteres por renglon
      var maxName = Math.max(8, Math.floor(w / 2) - qty.length - 2);
      var name = ascii(it.name || '').toUpperCase().replace(/\s+/g, ' ').trim();
      // Partir en renglones por palabra (max 3 renglones) para no cortar "PAPAS" en "P / APAS"
      var rows = [];
      var cur = '';
      name.split(' ').forEach(function (wd) {
        if (!cur) { cur = wd; return; }
        if ((cur + ' ' + wd).length <= maxName) cur += ' ' + wd;
        else { rows.push(cur); cur = wd; }
      });
      if (cur) rows.push(cur);
      rows.slice(0, 3).forEach(function (r, idx) {
        out += big + (idx === 0 ? qty + ' ' : new Array(qty.length + 2).join(' ')) + r.slice(0, maxName) + '\n';
      });
      out += norm;
      // Modificadores bajo el item, tamano normal, prefijo '  * '; comentario del item debajo
      (it.modifiers || []).slice(0, 20).forEach(function (m) {
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

  // Reparte los items entre impresoras segun item.category. Vacio = comodin. Sin match ni comodin -> primera.
  function route(printers, items) {
    var norm = function (v) { return ascii(v).trim().toLowerCase(); };
    var buckets = printers.map(function () { return []; });
    var wild = -1;
    printers.forEach(function (p, i) { if (wild < 0 && !p.categories.length) wild = i; });
    (items || []).forEach(function (it) {
      var cat = norm(it && it.category);
      var idx = -1;
      if (cat) printers.forEach(function (p, i) { if (idx < 0 && p.categories.some(function (c) { return norm(c) === cat; })) idx = i; });
      if (idx < 0) idx = wild >= 0 ? wild : 0;
      buckets[idx].push(it);
    });
    return buckets;
  }

  // Pulso del cajon (conector RJ11 de la impresora, pin 2): ESC p 0 t1 t2
  function drawerPulse() { return ESC + 'p\x00\x3c\x78'; }

  // Ticket de venta: texto ya armado por VolvixTicketCustomizer.renderText -> bytes.
  // opts: { openDrawer, cut (default true) }
  function buildTicket(text, opts) {
    opts = opts || {};
    var out = ESC + '@' + ESC + 't\x00';                 // init + CP437
    out += cp437(String(text || '').replace(/\r/g, ''));
    out += '\n\n\n';
    if (opts.cut !== false) out += GS + 'V\x42\x00';     // avance + corte parcial
    if (opts.openDrawer) out += drawerPulse();
    return out;
  }

  // latin1-string -> base64 (btoa en navegador/WebView, Buffer en node)
  function toBase64(bytes) {
    if (typeof btoa === 'function') return btoa(bytes);
    return Buffer.from(bytes, 'latin1').toString('base64');
  }

  var api = {
    ascii: ascii, cp437: cp437, clean: clean, cleanPrinter: cleanPrinter, route: route,
    buildComanda: buildComanda, buildTicket: buildTicket, drawerPulse: drawerPulse, toBase64: toBase64
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.VolvixEscPos = api;
})(typeof window !== 'undefined' ? window : this);
