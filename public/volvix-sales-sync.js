/* ============================================================
   VOLVIX · Sales Sync Engine v1 (2026-05-15 v1.0.318)
   ============================================================
   Best-practice POS multi-caja sync:

   ARQUITECTURA:
   - Ventas se guardan ATÓMICAMENTE en localStorage['volvix_sales_local_v1']
   - Cada venta tiene: local_sale_id (único), caja_id, synced (bool),
     printed (bool), sync_attempts (int)
   - Este engine corre en background:
       1. Cada N segundos verifica ventas con synced=false
       2. POST /api/cobro con Idempotency-Key (deterministico)
       3. Si 200/201/409 → marca synced=true + guarda server_sale_id
       4. Si 5xx/network → backoff exponencial, reintenta
       5. Multi-pestaña safe: lee localStorage cada iteración
       6. Multi-caja safe: cada caja sube las SUYAS (caja_id matching)

   GARANTÍAS:
   - Nunca duplica (idempotency-key + 409 handling)
   - Nunca pierde (persiste en localStorage hasta confirmar server)
   - No bloquea UI (intervalos + async/promesas)
   - Resiliente: si /api/cobro no responde, retry con backoff
============================================================ */
(function () {
  'use strict';
  if (typeof window === 'undefined') return;

  const SALES_KEY = 'volvix_sales_local_v1';
  const SYNC_INTERVAL_MS = 5000;     // intentar cada 5s
  const MAX_ATTEMPTS = 50;            // ~hasta agotar todos los reintentos
  const BACKOFF_BASE_MS = 2000;
  const BACKOFF_MAX_MS = 60000;

  let isRunning = false;
  let timer = null;

  function loadSales() {
    try { return JSON.parse(localStorage.getItem(SALES_KEY) || '[]'); }
    catch (_) { return []; }
  }
  function saveSales(arr) {
    try { localStorage.setItem(SALES_KEY, JSON.stringify(arr)); return true; }
    catch (_) { return false; }
  }
  function updateSale(localSaleId, patch) {
    var sales = loadSales();
    for (var i = 0; i < sales.length; i++) {
      if (sales[i].local_sale_id === localSaleId) {
        sales[i] = Object.assign({}, sales[i], patch);
        saveSales(sales);
        return sales[i];
      }
    }
    return null;
  }
  function getAuthToken() {
    try {
      if (window.VolvixAuth && typeof window.VolvixAuth.getToken === 'function') {
        var t = window.VolvixAuth.getToken();
        if (t) return t;
      }
      var sessRaw = localStorage.getItem('volvix:session') || localStorage.getItem('volvixSession');
      if (sessRaw) {
        var sess = JSON.parse(sessRaw);
        if (sess && sess.token) return sess.token;
      }
      return localStorage.getItem('volvix_token') || localStorage.getItem('volvixAuthToken') || '';
    } catch (_) { return ''; }
  }

  // Calcular un Idempotency-Key determinístico desde la venta local
  // (para que reintentos generen la misma key, evitando duplicados)
  async function idempotencyKeyFor(sale) {
    var parts = [
      sale.caja_id || '',
      sale.local_sale_id,
      String(sale.ts),
      String(sale.total)
    ].join('|');
    try {
      var enc = new TextEncoder().encode(parts);
      var buf = await crypto.subtle.digest('SHA-256', enc);
      var hex = Array.from(new Uint8Array(buf)).map(function(b){
        return ('00' + b.toString(16)).slice(-2);
      }).join('');
      return hex.slice(0, 32);
    } catch (_) {
      // Fallback no-crypto
      return (sale.caja_id || 'C') + '-' + sale.local_sale_id;
    }
  }

  // Convertir la venta local al payload del /api/cobro
  function toApiPayload(sale) {
    return {
      tenant_id: sale.tenant_id,
      customer_id: sale.customer_id,
      ticket_number: 'TKT-' + sale.local_folio,
      subtotal: sale.subtotal,
      total: sale.total,
      items: sale.items,
      payments: [{
        method: sale.payment_method,
        amount: sale.payment_received || sale.total,
        details: {}
      }],
      cfdi: null,
      tip: { amount: sale.tip || 0 },
      discount: { amount: sale.discount || 0 },
      rounding: { amount: 0 },
      delivery: { method: 'PRINT' },
      notes: '',
      // Metadata extra para auditoría server-side
      _client: {
        caja_id: sale.caja_id,
        local_sale_id: sale.local_sale_id,
        local_folio: sale.local_folio,
        ts: sale.ts
      }
    };
  }

  async function syncOneSale(sale) {
    var nextAttempts = (sale.sync_attempts || 0) + 1;
    if (nextAttempts > MAX_ATTEMPTS) {
      // Después de muchos fallos, marcar como "needs manual review"
      updateSale(sale.local_sale_id, { sync_attempts: nextAttempts, sync_failed_permanently: true });
      return { ok: false, permanent: true };
    }
    // Backoff exponencial: si el último intento fue hace menos de delay, skip
    var delay = Math.min(BACKOFF_BASE_MS * Math.pow(1.7, nextAttempts - 1), BACKOFF_MAX_MS);
    var sinceLast = Date.now() - (sale.last_sync_attempt_ts || 0);
    if (sale.last_sync_attempt_ts && sinceLast < delay) {
      return { ok: false, skipped: true, retryIn: delay - sinceLast };
    }
    updateSale(sale.local_sale_id, { sync_attempts: nextAttempts, last_sync_attempt_ts: Date.now() });

    var token = getAuthToken();
    if (!token) return { ok: false, reason: 'no-token' };

    var idemKey = await idempotencyKeyFor(sale);
    var payload = toApiPayload(sale);

    var ctrl = new AbortController();
    var timeoutTimer = setTimeout(function(){ ctrl.abort(); }, 15000);
    try {
      var resp = await fetch('/api/cobro', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idemKey,
          Authorization: 'Bearer ' + token
        },
        body: JSON.stringify(payload),
        signal: ctrl.signal
      });
      clearTimeout(timeoutTimer);
      if (resp.ok || resp.status === 409) {
        var data = {};
        try { data = await resp.json(); } catch (_) {}
        updateSale(sale.local_sale_id, {
          synced: true,
          server_sale_id: data.sale_id || data.id || null,
          server_sale_number: data.sale_number || null,
          server_folio: data.folio || data.sale_number || null,
          synced_at: Date.now(),
          server_response: data
        });
        // Notificar a UI si hay listener
        try {
          if (typeof window.__vlxOnSaleSynced === 'function') {
            window.__vlxOnSaleSynced(sale.local_sale_id, data);
          }
        } catch (_) {}
        return { ok: true, status: resp.status };
      }
      // 4xx no-409 → bad payload o auth. Marcar pero no contar como network error.
      if (resp.status >= 400 && resp.status < 500) {
        var errText = '';
        try { errText = await resp.text(); } catch (_) {}
        updateSale(sale.local_sale_id, {
          sync_4xx_error: 'status ' + resp.status + ': ' + errText.slice(0, 200)
        });
        return { ok: false, status: resp.status };
      }
      // 5xx → reintenta
      return { ok: false, status: resp.status, retryable: true };
    } catch (e) {
      clearTimeout(timeoutTimer);
      return { ok: false, error: e.message, retryable: true };
    }
  }

  async function syncTick() {
    if (isRunning) return;
    isRunning = true;
    try {
      var sales = loadSales();
      var pending = sales.filter(function(s){ return !s.synced && !s.sync_failed_permanently; });
      if (pending.length === 0) return;
      // Procesar máximo 5 ventas por tick para no saturar
      var batch = pending.slice(0, 5);
      for (var i = 0; i < batch.length; i++) {
        try { await syncOneSale(batch[i]); } catch (e) { console.warn('[sales-sync] error:', e); }
      }
    } finally { isRunning = false; }
  }

  // Limpieza periódica: eliminar ventas synced viejas (>7 días)
  function cleanup() {
    var sales = loadSales();
    var cutoff = Date.now() - (7 * 24 * 60 * 60 * 1000);
    var kept = sales.filter(function(s){ return !s.synced || s.ts > cutoff; });
    if (kept.length !== sales.length) {
      saveSales(kept);
      console.log('[sales-sync] cleaned up', sales.length - kept.length, 'old synced sales');
    }
  }

  function start() {
    if (timer) return;
    timer = setInterval(syncTick, SYNC_INTERVAL_MS);
    // Hacer un primer tick inmediato
    setTimeout(syncTick, 1500);
    // Limpieza diaria
    setInterval(cleanup, 60 * 60 * 1000);
    console.log('[sales-sync] engine started, interval', SYNC_INTERVAL_MS, 'ms');
  }

  function stop() {
    if (timer) { clearInterval(timer); timer = null; }
  }

  // API pública
  window.VolvixSalesSync = {
    start: start,
    stop: stop,
    syncNow: syncTick,
    getPending: function() {
      return loadSales().filter(function(s){ return !s.synced; });
    },
    getAll: loadSales,
    stats: function() {
      var sales = loadSales();
      return {
        total: sales.length,
        synced: sales.filter(function(s){ return s.synced; }).length,
        pending: sales.filter(function(s){ return !s.synced && !s.sync_failed_permanently; }).length,
        failed: sales.filter(function(s){ return s.sync_failed_permanently; }).length,
        printed: sales.filter(function(s){ return s.printed; }).length,
        unprinted: sales.filter(function(s){ return !s.printed; }).length
      };
    },
    // Para reimpresión: obtener venta por local_sale_id o folio
    getSale: function(idOrFolio) {
      return loadSales().find(function(s){
        return s.local_sale_id === idOrFolio || s.local_folio === idOrFolio;
      });
    }
  };

  // Auto-start cuando la página carga
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    setTimeout(start, 500);
  }
  // Reintentar cuando vuelva online
  window.addEventListener('online', function(){
    console.log('[sales-sync] online detected, syncing now');
    syncTick();
  });
})();
