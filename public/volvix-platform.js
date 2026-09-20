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
