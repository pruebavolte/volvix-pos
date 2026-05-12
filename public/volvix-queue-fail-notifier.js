/**
 * volvix-queue-fail-notifier.js
 * 2026-05-12 BUG-F4 FIX: OfflineQueue emite 'fail' pero nadie escuchaba ->
 * data loss silencioso. Este script registra un listener que muestra toast.
 * REGLA #0: archivo único single-purpose, no modifica OfflineQueue.
 */
(function () {
  'use strict';
  if (window.__vlxQueueFailNotifierLoaded) return;
  window.__vlxQueueFailNotifierLoaded = true;
  function friendlyName(url) {
    if (!url) return 'operación';
    if (/\/api\/sales/.test(url)) return 'venta';
    if (/\/api\/products/.test(url)) return 'producto';
    if (/\/api\/customers/.test(url)) return 'cliente';
    return 'operación';
  }
  function notify(payload) {
    var item = (payload && payload.item) || {};
    var name = friendlyName(item.url);
    var err = String((payload && payload.error) || 'error').slice(0, 100);
    var msg = 'No se pudo sincronizar la ' + name + '. Error: ' + err + '. Reintenta manualmente.';
    if (typeof window.volvixToast === 'function') { window.volvixToast(msg, 'error', 12000); }
    else {
      try {
        var b = document.createElement('div');
        b.style.cssText = 'position:fixed;top:12px;right:12px;z-index:2147483647;max-width:380px;padding:12px;border-radius:8px;background:#dc2626;color:#fff;font:13px system-ui;box-shadow:0 6px 24px rgba(0,0,0,.3);cursor:pointer';
        b.textContent = '⚠️ ' + msg;
        b.onclick = function () { b.remove(); };
        setTimeout(function () { try { b.remove(); } catch (_) {} }, 15000);
        (document.body || document.documentElement).appendChild(b);
      } catch (_) {}
    }
    console.error('[OfflineQueue FAIL]', payload);
  }
  function attach() {
    if (window.OfflineQueue && typeof window.OfflineQueue.on === 'function') {
      window.OfflineQueue.on('fail', notify);
    }
    window.addEventListener('offlinequeue:fail', function (e) { notify(e.detail); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', attach);
  else attach();
  setTimeout(attach, 2000);
})();
