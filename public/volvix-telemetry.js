/**
 * volvix-telemetry.js — Post-deploy monitoring. Reporta a /api/log/client
 * (endpoint existente, NO modifica backend). Telemetria en .meta.
 * Metricas: M1 queue_fail, M2 sale_latency, M3 queue_stats, M4/M5 server-side.
 */
(function () {
  'use strict';
  if (window.__vlxTelemetryLoaded) return;
  window.__vlxTelemetryLoaded = true;
  var BUFFER = [], FLUSH_MS = 30000, MAX_BUFFER = 50;
  var dev = (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) ? 'apk'
          : /Electron/i.test(navigator.userAgent) ? 'exe' : 'web';
  function tnt() { try { return localStorage.getItem('volvix_tenant_id') || JSON.parse(localStorage.getItem('volvix_user') || '{}').tenant_id || 'unknown'; } catch (_) { return 'unknown'; } }
  function emit(msg, meta) {
    BUFFER.push({ level: 'info', message: 'telemetry.' + msg, meta: Object.assign({ tenant_id: tnt(), device_type: dev, ts: Date.now() }, meta || {}) });
    if (BUFFER.length >= MAX_BUFFER) flush();
  }
  var origFetch = window.fetch.bind(window);
  function flush() {
    if (!BUFFER.length || !navigator.onLine) return;
    var batch = BUFFER.splice(0, BUFFER.length);
    batch.forEach(function (ev) {
      try { origFetch('/api/log/client', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ev) }).catch(function () {}); } catch (_) {}
    });
  }
  // M2: medir POST /api/sales
  window.fetch = function (input, init) {
    var url = (typeof input === 'string') ? input : (input && input.url);
    var isSale = url && /\/api\/sales(\?|$|\/)/.test(url) && ((init && init.method === 'POST') || (input && input.method === 'POST'));
    if (!isSale) return origFetch(input, init);
    var t0 = performance.now();
    return origFetch(input, init).then(function (r) {
      emit('sale_latency', { duration_ms: Math.round(performance.now() - t0), status: r.status, success: r.ok });
      return r;
    }).catch(function (e) {
      emit('sale_latency', { duration_ms: Math.round(performance.now() - t0), error: String(e.message || e).slice(0, 100), success: false });
      throw e;
    });
  };
  // M1: queue_fail listener
  function attach() {
    if (window.OfflineQueue && typeof window.OfflineQueue.on === 'function') {
      window.OfflineQueue.on('fail', function (p) {
        var i = (p && p.item) || {};
        emit('queue_fail', { url: i.url, method: i.method, retries: i.retries, reason: p && p.reason, error: String((p && p.error) || '').slice(0, 150), idempotencyKey: i.idempotencyKey });
      });
    }
    window.addEventListener('offlinequeue:fail', function (e) {
      var i = (e.detail && e.detail.item) || {};
      emit('queue_fail', { url: i.url, retries: i.retries, error: String((e.detail && e.detail.error) || '').slice(0, 150) });
    });
  }
  // M3: queue_stats cada 5min
  function stats() {
    if (!window.OfflineQueue || typeof window.OfflineQueue.getAll !== 'function') return;
    window.OfflineQueue.getAll().then(function (all) {
      var now = Date.now();
      emit('queue_stats', { total: all.length, with_retries: all.filter(function (x) { return (x.retries || 0) > 0; }).length, older_than_1h: all.filter(function (x) { return x.createdAt && (now - x.createdAt > 3600000); }).length });
    }).catch(function () {});
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', attach);
  else attach();
  setTimeout(attach, 2000);
  setInterval(flush, FLUSH_MS);
  setInterval(stats, 300000);
  setTimeout(stats, 30000);
  window.addEventListener('beforeunload', flush);
})();
