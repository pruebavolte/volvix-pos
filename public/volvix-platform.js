/* 2026-09-19 T0.1 — Puente único de plataforma (regla §0.2 LOYVERSE_CLONE_EJECUCION.md).
 * Ninguna pantalla debe llamar window.volvixElectron directo: siempre window.VolvixPlatform.
 * kind: 'electron' (window.volvixElectron existe) | 'android' (Capacitor nativo) | 'web' (resto).
 * Ningun adaptador lanza: resuelven { ok:false, ... } (web: unsupported:true).
 * 2026-09-20 ANDROID: adaptador real. Bytes ESC/POS armados en public/volvix-escpos.js (compartido con web/exe);
 * el envio (TCP 9100 / Bluetooth SPP) lo hace el plugin nativo VolvixPrinter (android/.../VolvixPrinterPlugin.java),
 * la camara el plugin @capacitor-community/barcode-scanner. Sin logica de negocio en android/.
 */
(function (global) {
  'use strict';

  function detectKind() {
    try {
      if (global.volvixElectron) return 'electron';
    } catch (_) {}
    try {
      if (global.Capacitor && typeof global.Capacitor.isNativePlatform === 'function' &&
          global.Capacitor.isNativePlatform()) {
        return 'android';
      }
    } catch (_) {}
    return 'web';
  }

  var kind = detectKind();
  var unsupported = function () { return Promise.resolve({ ok: false, unsupported: true }); };

  function electronAdapter() {
    var api = global.volvixElectron;
    return {
      printTicket: function (opts) {
        if (!api || typeof api.printRawText !== 'function') return unsupported();
        try { return api.printRawText(opts); } catch (e) { return Promise.resolve({ ok: false, error: e && e.message }); }
      },
      printComanda: function (comanda) {
        if (!api || typeof api.comandaPrint !== 'function') return unsupported();
        try { return api.comandaPrint(comanda); } catch (e) { return Promise.resolve({ ok: false, error: e && e.message }); }
      },
      comandaGet: function () {
        if (!api || typeof api.comandaGet !== 'function') return unsupported();
        try { return api.comandaGet(); } catch (e) { return Promise.resolve({ ok: false, error: e && e.message }); }
      },
      comandaSave: function (cfg) {
        if (!api || typeof api.comandaSave !== 'function') return unsupported();
        try { return api.comandaSave(cfg); } catch (e) { return Promise.resolve({ ok: false, error: e && e.message }); }
      },
      comandaTest: function (cfg) {
        if (!api || typeof api.comandaTest !== 'function') return unsupported();
        try { return api.comandaTest(cfg); } catch (e) { return Promise.resolve({ ok: false, error: e && e.message }); }
      },
      openDrawer: function () {
        if (!api || typeof api.openDrawer !== 'function') return unsupported();
        try { return api.openDrawer(); } catch (e) { return Promise.resolve({ ok: false, error: e && e.message }); }
      },
      pingPrinter: function (ip, port) {
        if (!api || typeof api.pingNetworkPrinter !== 'function') return unsupported();
        try { return api.pingNetworkPrinter(ip, port); } catch (e) { return Promise.resolve({ ok: false, error: e && e.message }); }
      },
      listBluetoothPrinters: function () {
        if (!api || typeof api.listBluetoothPrinters !== 'function') return unsupported();
        try { return api.listBluetoothPrinters(); } catch (e) { return Promise.resolve({ ok: false, error: e && e.message }); }
      },
      scanBarcode: function () {
        if (!api || typeof api.scanBarcode !== 'function') return unsupported();
        try { return api.scanBarcode(); } catch (e) { return Promise.resolve({ ok: false, error: e && e.message }); }
      }
    };
  }

  // ------------------------------------------------------------------ ANDROID (Capacitor)
  function ls(key, def) { try { var v = global.localStorage.getItem(key); return v == null || v === '' ? def : v; } catch (_) { return def; } }
  function lsSet(key, val) { try { global.localStorage.setItem(key, val); } catch (_) {} }
  function fail(e) { return { ok: false, error: (e && (e.message || e.errorMessage)) || String(e || 'error') }; }

  function capPlugin(name) {
    var C = global.Capacitor; if (!C) return null;
    try { if (C.Plugins && C.Plugins[name]) return C.Plugins[name]; } catch (_) {}
    try { if (typeof C.registerPlugin === 'function') return C.registerPlugin(name); } catch (_) {}
    return null;
  }

  // Impresora de TICKETS: reutiliza la config que ya guarda volvix-print-config.js (mismas llaves que el .exe).
  function receiptTarget() {
    var mode = ls('volvix_printer_mode', 'auto');
    var ip = ls('volvix_printer_ip', ''), mac = ls('volvix_bt_printer_mac', '');
    var port = parseInt(ls('volvix_printer_port', '9100'), 10) || 9100;
    var net = ip ? { t: 'net', host: ip, port: port } : null;
    var bt = mac ? { t: 'bt', address: mac } : null;
    if (mode === 'ip') return net;
    if (mode === 'bluetooth') return bt;
    if (mode === 'usb') return null;            // sin USB-host en Android: se avisa, no se rompe la venta
    return net || bt;                            // auto: red primero (igual que el .exe), luego Bluetooth
  }

  function sendBytes(target, bytes) {
    var E = global.VolvixEscPos, P = capPlugin('VolvixPrinter');
    if (!E) return Promise.resolve(fail('volvix-escpos.js no cargado'));
    if (!P) return Promise.resolve({ ok: false, unsupported: true, error: 'plugin de impresion no disponible (actualiza la app)' });
    var data = E.toBase64(bytes);
    try {
      var p = target.t === 'bt' ? P.printBluetooth({ address: target.address, data: data })
                                : P.printRaw({ host: target.host, port: target.port, data: data, timeoutMs: 6000 });
      return Promise.resolve(p).then(function (r) { return { ok: true, bytesWritten: (r && r.bytesWritten) || bytes.length }; }, fail);
    } catch (e) { return Promise.resolve(fail(e)); }
  }

  var COMANDA_KEY = 'volvix_comanda_cfg';
  function loadComandaCfg() {
    var E = global.VolvixEscPos; var raw = null;
    try { raw = JSON.parse(ls(COMANDA_KEY, 'null')); } catch (_) {}
    return E ? E.clean(raw) : { enabled: false, printers: [] };
  }

  function androidAdapter() {
    var noPrinter = { ok: false, unsupported: true, error: 'Impresora de tickets no configurada (Configuracion > Impresoras)' };

    function printComanda(comanda) {
      try {
        var E = global.VolvixEscPos; if (!E) return Promise.resolve(fail('volvix-escpos.js no cargado'));
        var cfg = loadComandaCfg();
        var printers = cfg.printers.filter(function (p) { return p.ip; });
        if (!cfg.enabled || !printers.length) return Promise.resolve({ ok: false, skipped: true, error: 'comandas deshabilitadas' });
        if (!comanda || !Array.isArray(comanda.items) || !comanda.items.length) return Promise.resolve(fail('comanda sin items'));
        var cut = function (v) { return String(v || '').slice(0, 120); };
        var items = comanda.items.slice(0, 120).map(function (i) {
          return { qty: i && i.qty, name: cut(i && i.name), cancel: !!(i && i.cancel), category: cut(i && i.category),
            modifiers: Array.isArray(i && i.modifiers) ? i.modifiers.slice(0, 20).map(cut) : [], note: cut(i && i.note) };
        });
        var head = { folio: cut(comanda.folio), time: cut(comanda.time), mode: cut(comanda.mode), note: cut(comanda.note), customer: cut(comanda.customer) };
        var buckets = E.route(printers, items);
        return Promise.all(printers.map(function (p, k) {
          if (!buckets[k].length) return { ok: true, printer: p.name, empty: true };
          var bytes = E.buildComanda(Object.assign({}, head, { items: buckets[k] }), p.width);
          return sendBytes({ t: 'net', host: p.ip, port: p.port }, bytes).then(function (r) { return Object.assign({}, r, { printer: p.name }); });
        })).then(function (results) {
          var failed = results.filter(function (r) { return !r.ok; });
          return { ok: !failed.length, results: results, error: failed.length ? failed.map(function (r) { return r.printer + ': ' + r.error; }).join('; ') : undefined };
        });
      } catch (e) { return Promise.resolve(fail(e)); }
    }

    return {
      printTicket: function (opts) {
        try {
          opts = opts || {};
          var E = global.VolvixEscPos; if (!E) return Promise.resolve(fail('volvix-escpos.js no cargado'));
          // La comanda de cocina sale ademas del ticket (igual que el .exe) y NUNCA bloquea al ticket.
          var cmd = opts.comanda ? printComanda(opts.comanda).catch(function () { return null; }) : Promise.resolve(null);
          var target = opts.target || receiptTarget();   // opts.target = prueba desde Configuracion sin guardar
          var tk = target ? sendBytes(target, E.buildTicket(opts.text || '', { openDrawer: !!opts.openDrawer })) : Promise.resolve(noPrinter);
          return Promise.all([tk, cmd]).then(function (r) { return Object.assign({}, r[0], { comanda: r[1] }); });
        } catch (e) { return Promise.resolve(fail(e)); }
      },
      printComanda: printComanda,
      comandaGet: function () { return Promise.resolve({ ok: true, cfg: loadComandaCfg() }); },
      comandaSave: function (cfg) {
        try {
          var E = global.VolvixEscPos; if (!E) return Promise.resolve(fail('volvix-escpos.js no cargado'));
          var c = E.clean(cfg); lsSet(COMANDA_KEY, JSON.stringify(c));
          return Promise.resolve({ ok: true, cfg: c });
        } catch (e) { return Promise.resolve(fail(e)); }
      },
      comandaTest: function (cfg) {
        try {
          var E = global.VolvixEscPos; if (!E) return Promise.resolve(fail('volvix-escpos.js no cargado'));
          var p = E.clean(cfg).printers.filter(function (x) { return x.ip; })[0];
          if (!p) return Promise.resolve(fail('falta la IP de la impresora'));
          var sample = { folio: 'PRUEBA', time: new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }), mode: 'COMER AQUI', note: 'Sin cebolla',
            items: [{ qty: 2, name: 'Enchiladas Suizas' }, { qty: 1, name: 'Milanesa de Res con papas' }] };
          return sendBytes({ t: 'net', host: p.ip, port: p.port }, E.buildComanda(sample, p.width));
        } catch (e) { return Promise.resolve(fail(e)); }
      },
      openDrawer: function () {
        try {
          var E = global.VolvixEscPos; if (!E) return Promise.resolve(fail('volvix-escpos.js no cargado'));
          var target = receiptTarget(); if (!target) return Promise.resolve(noPrinter);
          return sendBytes(target, '\x1b@' + E.drawerPulse());
        } catch (e) { return Promise.resolve(fail(e)); }
      },
      pingPrinter: function (ip, port) {
        var P = capPlugin('VolvixPrinter'); if (!P) return unsupported();
        var t0 = Date.now();
        return Promise.resolve(P.ping({ host: ip, port: parseInt(port, 10) || 9100, timeoutMs: 2500 })).then(function (r) { return r && r.ok ? { ok: true, ms: Date.now() - t0 } : { ok: false, error: (r && r.error) || 'no responde' }; }, fail);
      },
      listBluetoothPrinters: function () {
        var P = capPlugin('VolvixPrinter'); if (!P) return unsupported();
        return Promise.resolve(P.listBluetooth()).then(function (r) { return { ok: true, enabled: r && r.enabled, devices: (r && r.devices) || [] }; }, fail);
      },
      scanBarcode: scanBarcodeAndroid
    };
  }

  // Camara: @capacitor-community/barcode-scanner pinta el video DETRAS del WebView -> se oculta todo menos el overlay.
  function scanBarcodeAndroid() {
    var BS = capPlugin('BarcodeScanner');
    if (!BS) return unsupported();
    var doc = global.document, body = doc && doc.body;
    if (!body) return unsupported();
    var cleanup = function () {
      try { BS.showBackground(); } catch (_) {}
      body.classList.remove('vlx-scanning'); doc.documentElement.classList.remove('vlx-scanning');
      var o = doc.getElementById('vlx-scan-overlay'); if (o) o.remove();
      var s = doc.getElementById('vlx-scan-style'); if (s) s.remove();
    };
    return Promise.resolve(BS.checkPermission({ force: true })).then(function (st) {
      if (!st || !st.granted) return { ok: false, error: 'permiso de camara denegado' };
      var style = doc.createElement('style'); style.id = 'vlx-scan-style';
      style.textContent = 'html.vlx-scanning,body.vlx-scanning{background:transparent!important}' +
        'body.vlx-scanning>*:not(#vlx-scan-overlay):not(#vlx-scan-style){visibility:hidden!important}';
      doc.head.appendChild(style);
      var ov = doc.createElement('div'); ov.id = 'vlx-scan-overlay'; ov.setAttribute('data-vlx-keep', '1');
      ov.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:2147483647;padding:16px;text-align:center;color:#fff;font:600 15px system-ui,sans-serif;background:linear-gradient(transparent,rgba(0,0,0,.7))';
      ov.innerHTML = '<div style="margin-bottom:10px">Apunta la camara al codigo de barras</div>' +
        '<button type="button" style="padding:12px 28px;border:0;border-radius:24px;font-size:15px;font-weight:700">Cancelar</button>';
      ov.querySelector('button').onclick = function () { try { BS.stopScan(); } catch (_) {} };
      body.appendChild(ov);
      body.classList.add('vlx-scanning'); doc.documentElement.classList.add('vlx-scanning');
      try { BS.hideBackground(); } catch (_) {}
      return Promise.resolve(BS.startScan()).then(function (r) {
        cleanup();
        return r && r.hasContent ? { ok: true, code: String(r.content), format: r.format } : { ok: false, cancelled: true };
      });
    }).catch(function (e) { cleanup(); return fail(e); });
  }

  function noopAdapter() {
    return {
      printTicket: unsupported,
      printComanda: unsupported,
      comandaGet: unsupported,
      comandaSave: unsupported,
      comandaTest: unsupported,
      openDrawer: unsupported,
      pingPrinter: unsupported,
      listBluetoothPrinters: unsupported,
      scanBarcode: unsupported
    };
  }

  var impl = (kind === 'electron') ? electronAdapter() : (kind === 'android') ? androidAdapter() : noopAdapter();

  global.VolvixPlatform = {
    kind: kind,
    printTicket: impl.printTicket,
    printComanda: impl.printComanda,
    comandaGet: impl.comandaGet,
    comandaSave: impl.comandaSave,
    comandaTest: impl.comandaTest,
    openDrawer: impl.openDrawer,
    pingPrinter: impl.pingPrinter,
    listBluetoothPrinters: impl.listBluetoothPrinters,
    scanBarcode: impl.scanBarcode
  };
})(typeof window !== 'undefined' ? window : this);
