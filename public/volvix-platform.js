/* 2026-09-19 T0.1 — Puente único de plataforma (regla §0.2 LOYVERSE_CLONE_EJECUCION.md).
 * Ninguna pantalla debe llamar window.volvixElectron directo: siempre window.VolvixPlatform.
 * kind: 'electron' (window.volvixElectron existe) | 'android' (Capacitor nativo) | 'web' (resto).
 * Android y web NUNCA lanzan: resuelven { ok:false, unsupported:true }.
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
    // .exe viejo (v1.0.344) = su config comandaGet() no trae printers[]. Se detecta una vez.
    var _legacy = null;
    function legacyMode() {
      if (_legacy !== null) return Promise.resolve(_legacy);
      try {
        return Promise.resolve(api.comandaGet()).then(function (r) { _legacy = !!(r && r.ok && r.cfg && !Array.isArray(r.cfg.printers)); return _legacy; }).catch(function () { return false; });
      } catch (_) { return Promise.resolve(false); }
    }
    // Config vieja {ip,port,width} -> sintetiza printers[0] para que la UI nueva la vea (nunca se pierde 192.168.x.x:9100)
    function normGet(r) {
      try {
        if (r && r.ok && r.cfg && !Array.isArray(r.cfg.printers)) {
          var c = r.cfg;
          r = Object.assign({}, r, { cfg: Object.assign({}, c, { printers: c.ip ? [{ name: 'Cocina', ip: c.ip, port: c.port || 9100, width: c.width || 48, categories: [] }] : [] }) });
        }
      } catch (_) {}
      return r;
    }
    return {
      printTicket: function (opts) {
        if (!api || typeof api.printRawText !== 'function') return unsupported();
        try { return api.printRawText(opts); } catch (e) { return Promise.resolve({ ok: false, error: e && e.message }); }
      },
      printComanda: function (comanda) {
        if (!api || typeof api.comandaPrint !== 'function') return unsupported();
        return legacyMode().then(function (legacy) {
          var c = comanda;
          if (legacy && comanda && Array.isArray(comanda.items)) {
            // .exe viejo: no entiende cancel:true (cocinaria lo cancelado) ni modificadores: se filtran/aplanan aqui.
            var items = comanda.items.filter(function (i) { return !(i && i.cancel); }).map(function (i) {
              var extra = ((i && i.modifiers) || []).concat(i && i.note ? [i.note] : []).filter(Boolean);
              return { qty: i && i.qty, name: String((i && i.name) || '') + (extra.length ? ' (' + extra.join(', ') + ')' : '') };
            });
            if (!items.length) return { ok: true, empty: true };
            c = Object.assign({}, comanda, { items: items });
          }
          try { return api.comandaPrint(c); } catch (e) { return { ok: false, error: e && e.message }; }
        });
      },
      comandaGet: function () {
        if (!api || typeof api.comandaGet !== 'function') return unsupported();
        try { return Promise.resolve(api.comandaGet()).then(normGet); } catch (e) { return Promise.resolve({ ok: false, error: e && e.message }); }
      },
      comandaSave: function (cfg) {
        if (!api || typeof api.comandaSave !== 'function') return unsupported();
        return legacyMode().then(function (legacy) {
          if (!legacy) return api.comandaSave(cfg);
          // .exe viejo: solo guarda {enabled, ip, port, width}. Sin IP nueva NO se pisa la existente (192.168.x.x del cliente).
          var p0 = cfg && Array.isArray(cfg.printers) && cfg.printers[0];
          return Promise.resolve(api.comandaGet()).then(function (cur) {
            var c0 = (cur && cur.cfg) || {};
            var payload = { enabled: !!(cfg && cfg.enabled), ip: (p0 && p0.ip) || c0.ip || '', port: (p0 && p0.port) || c0.port || 9100, width: (p0 && p0.width) || c0.width || 48 };
            return Promise.resolve(api.comandaSave(payload)).then(normGet);
          });
        }).catch(function (e) { return { ok: false, error: e && e.message }; });
      },
      comandaTest: function (cfg) {
        if (!api || typeof api.comandaTest !== 'function') return unsupported();
        try { return api.comandaTest(cfg); } catch (e) { return Promise.resolve({ ok: false, error: e && e.message }); }
      },
      openDrawer: function () {
        if (!api || typeof api.openDrawer !== 'function') return unsupported();
        try { return api.openDrawer(); } catch (e) { return Promise.resolve({ ok: false, error: e && e.message }); }
      },
      scanBarcode: function () {
        if (!api || typeof api.scanBarcode !== 'function') return unsupported();
        try { return api.scanBarcode(); } catch (e) { return Promise.resolve({ ok: false, error: e && e.message }); }
      }
    };
  }

  function noopAdapter() {
    return {
      printTicket: unsupported,
      printComanda: unsupported,
      comandaGet: unsupported,
      comandaSave: unsupported,
      comandaTest: unsupported,
      openDrawer: unsupported,
      scanBarcode: unsupported
    };
  }

  var impl = (kind === 'electron') ? electronAdapter() : noopAdapter();

  global.VolvixPlatform = {
    kind: kind,
    // Objeto nativo del .exe SOLO para adaptadores de impresion que aun necesitan su superficie completa (null fuera de Electron).
    electronApi: function () { return kind === 'electron' ? (global.volvixElectron || null) : null; },
    printTicket: impl.printTicket,
    printComanda: impl.printComanda,
    comandaGet: impl.comandaGet,
    comandaSave: impl.comandaSave,
    comandaTest: impl.comandaTest,
    openDrawer: impl.openDrawer,
    scanBarcode: impl.scanBarcode
  };
})(typeof window !== 'undefined' ? window : this);
