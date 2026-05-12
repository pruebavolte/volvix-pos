/**
 * volvix-offline-queue.js
 * Offline queue avanzado para Volvix POS.
 *
 * Features:
 *  - Persistencia en IndexedDB (fallback localStorage).
 *  - Retry con backoff exponencial + jitter.
 *  - Resolución de conflictos (last-write-wins, server-wins, merge custom).
 *  - Indicador visual de sincronización (badge flotante).
 *  - Detección automática online/offline.
 *  - Deduplicación por idempotency key.
 *  - Eventos personalizados (queue:add, queue:sync, queue:done, queue:fail).
 *
 * Uso:
 *   OfflineQueue.init({ endpoint: '/api/sync', maxRetries: 5 });
 *   OfflineQueue.enqueue({ method: 'POST', url: '/api/ventas', body: {...} });
 *
 * Expone: window.OfflineQueue
 */
(function (global) {
  'use strict';

  // ─────────────────────────────────────────────────────────────
  // Configuración por defecto
  // ─────────────────────────────────────────────────────────────
  const DEFAULTS = {
    dbName: 'volvix_offline_queue',
    storeName: 'requests',
    endpoint: null,
    maxRetries: 6,
    baseDelay: 1000,        // ms
    maxDelay: 60000,        // 1 min tope
    syncIntervalMs: 15000,  // chequeo periódico
    conflictStrategy: 'last-write-wins', // 'server-wins' | 'merge'
    mergeFn: null,
    showIndicator: true,
    indicatorPosition: 'bottom-right',
    debug: false,
  };

  let cfg = { ...DEFAULTS };
  let db = null;
  let useFallback = false;
  let syncing = false;
  let syncTimer = null;
  const listeners = {};

  // ─────────────────────────────────────────────────────────────
  // Logger
  // ─────────────────────────────────────────────────────────────
  function log(...a) { if (cfg.debug) console.log('[OfflineQueue]', ...a); }
  function warn(...a) { console.warn('[OfflineQueue]', ...a); }
  function err(...a) { console.error('[OfflineQueue]', ...a); }

  // ─────────────────────────────────────────────────────────────
  // Event emitter ligero
  // ─────────────────────────────────────────────────────────────
  function on(event, fn) {
    (listeners[event] = listeners[event] || []).push(fn);
  }
  function off(event, fn) {
    if (!listeners[event]) return;
    listeners[event] = listeners[event].filter(f => f !== fn);
  }
  function emit(event, payload) {
    log('event', event, payload);
    (listeners[event] || []).forEach(fn => {
      try { fn(payload); } catch (e) { err('listener', e); }
    });
    try {
      window.dispatchEvent(new CustomEvent('offlinequeue:' + event, { detail: payload }));
    } catch (_) { /* ignore */ }
  }

  // ─────────────────────────────────────────────────────────────
  // IndexedDB helpers
  // ─────────────────────────────────────────────────────────────
  function openDB() {
    return new Promise((resolve) => {
      if (!('indexedDB' in window)) {
        useFallback = true;
        warn('IndexedDB no soportado, usando localStorage');
        return resolve(null);
      }
      const req = indexedDB.open(cfg.dbName, 1);
      req.onupgradeneeded = (e) => {
        const _db = e.target.result;
        if (!_db.objectStoreNames.contains(cfg.storeName)) {
          const store = _db.createObjectStore(cfg.storeName, { keyPath: 'id' });
          store.createIndex('createdAt', 'createdAt', { unique: false });
          store.createIndex('idempotencyKey', 'idempotencyKey', { unique: false });
        }
      };
      req.onsuccess = (e) => { db = e.target.result; resolve(db); };
      req.onerror = () => {
        useFallback = true;
        warn('IndexedDB error, usando localStorage');
        resolve(null);
      };
    });
  }

  function tx(mode = 'readonly') {
    return db.transaction(cfg.storeName, mode).objectStore(cfg.storeName);
  }

  // Fallback localStorage
  const LS_KEY = 'volvix_offline_queue_fallback';
  function lsRead() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); }
    catch (_) { return []; }
  }
  function lsWrite(arr) {
    localStorage.setItem(LS_KEY, JSON.stringify(arr));
  }

  // ─────────────────────────────────────────────────────────────
  // CRUD de la cola
  // ─────────────────────────────────────────────────────────────
  function putRequest(item) {
    if (useFallback) {
      const arr = lsRead();
      const i = arr.findIndex(x => x.id === item.id);
      if (i >= 0) arr[i] = item; else arr.push(item);
      lsWrite(arr);
      return Promise.resolve(item);
    }
    return new Promise((resolve, reject) => {
      const r = tx('readwrite').put(item);
      r.onsuccess = () => resolve(item);
      r.onerror = () => reject(r.error);
    });
  }

  function deleteRequest(id) {
    if (useFallback) {
      lsWrite(lsRead().filter(x => x.id !== id));
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      const r = tx('readwrite').delete(id);
      r.onsuccess = () => resolve();
      r.onerror = () => reject(r.error);
    });
  }

  function getAll() {
    if (useFallback) return Promise.resolve(lsRead());
    return new Promise((resolve, reject) => {
      const r = tx().getAll();
      r.onsuccess = () => resolve(r.result || []);
      r.onerror = () => reject(r.error);
    });
  }

  function findByIdempotency(key) {
    if (!key) return Promise.resolve(null);
    return getAll().then(all => all.find(x => x.idempotencyKey === key) || null);
  }

  // ─────────────────────────────────────────────────────────────
  // Enqueue
  // ─────────────────────────────────────────────────────────────
  function makeId() {
    return 'q_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
  }

  async function enqueue(req) {
    if (!req || !req.url) throw new Error('enqueue requires {url, method?, body?}');
    if (req.idempotencyKey) {
      const existing = await findByIdempotency(req.idempotencyKey);
      if (existing) {
        log('dedup hit', req.idempotencyKey);
        return existing;
      }
    }
    const item = {
      id: makeId(),
      method: (req.method || 'POST').toUpperCase(),
      url: req.url,
      headers: req.headers || {},
      body: req.body ?? null,
      idempotencyKey: req.idempotencyKey || null,
      retries: 0,
      nextAttempt: Date.now(),
      createdAt: Date.now(),
      lastError: null,
      conflictStrategy: req.conflictStrategy || cfg.conflictStrategy,
      meta: req.meta || {},
    };
    await putRequest(item);
    emit('add', item);
    updateIndicator();
    if (navigator.onLine) scheduleSync(0);
    return item;
  }

  // ─────────────────────────────────────────────────────────────
  // Sync loop
  // ─────────────────────────────────────────────────────────────
  function backoff(retries) {
    const exp = Math.min(cfg.maxDelay, cfg.baseDelay * Math.pow(2, retries));
    const jitter = Math.random() * exp * 0.3;
    return Math.floor(exp + jitter);
  }

  async function processItem(item) {
    try {
      // 2026-05-11: timeout de 10s para evitar deadlocks si la red cuelga.
      // Sin esto, un fetch que nunca responda mantiene syncing=true permanente.
      const ctrl = new AbortController();
      const t = setTimeout(() => { try { ctrl.abort(); } catch (_) {} }, 10000);
      let resp;
      try {
        resp = await fetch(item.url, {
          method: item.method,
          headers: { 'Content-Type': 'application/json', ...item.headers },
          body: item.body != null ? JSON.stringify(item.body) : undefined,
          signal: ctrl.signal,
        });
      } finally {
        clearTimeout(t);
      }

      if (resp.status === 409) {
        // Conflicto — caso especial: si es BARCODE_TAKEN o PRODUCT_DUPLICATE_SKU
        // para POST /api/products, el producto YA EXISTE. Reintentar como
        // PATCH /api/products/:id con el id retornado. Esto convierte
        // "crear-si-no-existe" en UPSERT real desde el cliente.
        const serverData = await resp.json().catch(() => ({}));
        const isDuplicateProduct = serverData && (
          serverData.error_code === 'BARCODE_TAKEN' ||
          serverData.error_code === 'PRODUCT_DUPLICATE_SKU' ||
          serverData.error === 'PRODUCT_DUPLICATE_SKU' ||
          (serverData.existing && serverData.existing.id)
        );
        if (isDuplicateProduct && item.method === 'POST' && /^\/api\/products$/.test(item.url)) {
          // Necesitamos el ID del producto existente. El backend lo devuelve en `existing.id`
          // si está disponible. Si no, hacemos GET por code para obtenerlo.
          let existingId = serverData.existing && serverData.existing.id;
          if (!existingId && item.body && (item.body.code || item.body.barcode)) {
            try {
              const lookupParam = item.body.code
                ? 'code=eq.' + encodeURIComponent(item.body.code)
                : 'barcode=eq.' + encodeURIComponent(item.body.barcode);
              const r = await fetch('/api/productos?' + lookupParam + '&select=id&limit=1', {
                headers: { ...item.headers }
              });
              if (r.ok) {
                const arr = await r.json().then(j => j.items || j.data || j || []);
                if (Array.isArray(arr) && arr[0] && arr[0].id) existingId = arr[0].id;
              }
            } catch (_) {}
          }
          if (existingId) {
            // Necesitamos el `version` del producto para optimistic locking del PATCH.
            // El response 409 puede incluirlo en existing.version; si no, hacemos GET.
            let existingVersion = serverData.existing && serverData.existing.version;
            if (existingVersion === undefined) {
              try {
                const r = await fetch('/api/productos?id=eq.' + existingId + '&select=version&limit=1', {
                  headers: { ...item.headers }
                });
                if (r.ok) {
                  const arr = await r.json().then(j => j.items || j.data || j || []);
                  if (Array.isArray(arr) && arr[0]) existingVersion = arr[0].version;
                }
              } catch (_) {}
            }
            // Reintentar como PATCH con version (optimistic locking)
            const patchBody = Object.assign({}, item.body, {
              version: existingVersion !== undefined ? existingVersion : 1
            });
            const patchResp = await fetch('/api/products/' + existingId, {
              method: 'PATCH',
              headers: {
                'Content-Type': 'application/json',
                'If-Match': String(existingVersion !== undefined ? existingVersion : 1),
                ...item.headers
              },
              body: JSON.stringify(patchBody)
            });
            if (patchResp.ok) {
              await deleteRequest(item.id);
              emit('done', { item, upserted: true, id: existingId });
              return;
            }
            // PATCH también falló — log y caer a flujo normal
            console.warn('[offline-queue] PATCH upsert failed:', patchResp.status, await patchResp.text().catch(() => ''));
          }
        }
        const resolved = await resolveConflict(item, serverData);
        if (resolved.action === 'drop') {
          await deleteRequest(item.id);
          emit('done', { item, resolved: true });
          return;
        }
        if (resolved.action === 'replace') {
          item.body = resolved.body;
          item.retries = 0;
          item.nextAttempt = Date.now();
          await putRequest(item);
          return;
        }
      }

      if (!resp.ok) throw new Error('HTTP ' + resp.status);

      await deleteRequest(item.id);
      emit('done', { item });
    } catch (e) {
      item.retries += 1;
      item.lastError = String(e && e.message || e);

      // 2026-05-12 BUG #1 FIX: NO eliminar items por errores de red.
      // Antes: tras 6 retries con HTTP 503/timeout/NetworkError, el item se
      // eliminaba permanentemente → PERDIDA DE DATOS si offline > 1 minuto.
      // Ahora: solo eliminamos en errores DEFINITIVOS (4xx cliente: 400/401/403/404/422)
      // o cuando el conflict resolver decidió 'drop'. Errores de red/5xx se
      // reintentan indefinidamente hasta que vuelva la conexión.
      const errStr = item.lastError;
      const httpMatch = errStr.match(/^HTTP (\d{3})/);
      const httpCode = httpMatch ? parseInt(httpMatch[1], 10) : 0;
      const isClientError = httpCode >= 400 && httpCode < 500 && httpCode !== 408 && httpCode !== 429;
      const isNetworkError = !httpCode || httpCode >= 500 ||
        /NetworkError|Failed to fetch|abort|timeout|ECONNREFUSED|ENOTFOUND|offline/i.test(errStr);

      if (item.retries >= cfg.maxRetries) {
        if (isClientError) {
          // Error de cliente real (400, 401, 403, etc.) — el request es invalido,
          // reintentarlo no va a ayudar. Eliminar y notificar.
          emit('fail', { item, error: item.lastError, reason: 'client-error' });
          await deleteRequest(item.id);
          return;
        }
        if (isNetworkError) {
          // Error de red persistente. NO eliminar — el usuario espera que sus
          // datos sobrevivan. Resetar retries a maxRetries/2 y darle un delay
          // largo (5 min) para que no se quede en retry-loop, pero que vuelva
          // a intentar cuando la red regrese.
          item.retries = Math.floor(cfg.maxRetries / 2);
          item.nextAttempt = Date.now() + 5 * 60 * 1000; // 5 minutos
          await putRequest(item);
          emit('retry-paused', { item, reason: 'network-error-persistent', resumeIn: 5 * 60 * 1000 });
          return;
        }
        // Otro tipo de error desconocido — comportamiento original (eliminar)
        emit('fail', { item, error: item.lastError, reason: 'unknown-error' });
        await deleteRequest(item.id);
        return;
      }
      item.nextAttempt = Date.now() + backoff(item.retries);
      await putRequest(item);
      emit('retry', { item, delay: item.nextAttempt - Date.now() });
    }
  }

  async function resolveConflict(item, serverData) {
    const strat = item.conflictStrategy || cfg.conflictStrategy;
    if (strat === 'server-wins') return { action: 'drop' };
    if (strat === 'merge' && typeof cfg.mergeFn === 'function') {
      try {
        const merged = await cfg.mergeFn(item.body, serverData);
        return { action: 'replace', body: merged };
      } catch (e) {
        warn('mergeFn fallo', e);
        return { action: 'drop' };
      }
    }
    // last-write-wins → reintentar tal cual con header de override
    item.headers = { ...(item.headers || {}), 'X-Force-Overwrite': '1' };
    return { action: 'replace', body: item.body };
  }

  // 2026-05-11: paralelización con concurrencia limitada (default 8) + drain loop.
  // Antes: procesaba SECUENCIAL → 100 items en 30s+.
  // Ahora: 8 workers paralelos + loop hasta cola vacía (items nuevos durante sync
  // también se procesan en la misma sesión, no esperan al próximo setInterval).
  // ANTI-DEADLOCK: si syncing está pegado > 60s, se asume crashed y se resetea.
  let __syncStartedAt = 0;
  async function syncNow(opts) {
    const force = !!(opts && opts.force);
    if (syncing) {
      // Anti-deadlock: si lleva >45s "sincronizando", reset y continuar.
      // 2026-05-12 BUG #2 FIX: si la llamada es forzada (force=true), reseteamos
      // syncing sin esperar 45s — el caller sabe lo que hace (ej. usuario hizo click).
      const stuck = __syncStartedAt && (Date.now() - __syncStartedAt) > 45000;
      if (stuck || force) {
        warn('[offline-queue] FORZANDO reset', force ? '(force=true)' : '(>45s)');
        syncing = false;
      } else {
        return;
      }
    }
    if (!navigator.onLine) return;
    syncing = true;
    __syncStartedAt = Date.now();
    emit('sync-start');
    updateIndicator();

    // 2026-05-12 BUG #2 FIX: cuando se llama syncNow forzado, resetear el
    // nextAttempt de TODOS los items que tienen lastError, para procesarlos
    // de inmediato. Antes podian quedarse en "pause" indefinida si su backoff
    // los empujaba al futuro y syncNow nunca alcanzaba a procesarlos.
    if (force) {
      try {
        const all = await getAll();
        const now = Date.now();
        let touched = 0;
        for (const item of all) {
          if (item.lastError && item.nextAttempt > now) {
            item.nextAttempt = now;
            await putRequest(item);
            touched++;
          }
        }
        if (touched > 0) log('[offline-queue] force=true reseteo nextAttempt en', touched, 'items');
      } catch (e) { warn('force reset err', e); }
    }

    try {
      const all = await getAll();
      const now = Date.now();
      const due = all
        .filter(x => x.nextAttempt <= now)
        .sort((a, b) => a.createdAt - b.createdAt);

      // Coalescing por (method+url+body.code|barcode|name)
      const seen = new Map();
      const winners = [];
      for (let i = due.length - 1; i >= 0; i--) {
        const it = due[i];
        const k = (it.method || 'POST') + '|' + (it.url || '') + '|' +
                  (it.body && (it.body.code || it.body.barcode || it.body.name) || '');
        if (seen.has(k)) {
          await deleteRequest(it.id);
          emit('coalesced', { item: it, kept: seen.get(k) });
        } else {
          seen.set(k, it.id);
          winners.unshift(it);
        }
      }

      if (winners.length > 0) {
        // Paralelo con concurrencia limitada + TIMEOUT GLOBAL (30s por round)
        const concurrency = cfg.concurrency || 8;
        let idx = 0;
        const workers = Array(Math.min(concurrency, winners.length)).fill(0).map(async () => {
          while (idx < winners.length) {
            if (!navigator.onLine) return;
            const item = winners[idx++];
            if (!item) return;
            try { await processItem(item); }
            catch (e) { warn('worker err', e); }
          }
        });
        // Race contra timeout 30s para evitar deadlock permanente
        const TIMEOUT_MS = 30000;
        await Promise.race([
          Promise.all(workers),
          new Promise(resolve => setTimeout(() => {
            warn('[offline-queue] round timeout 30s, abandono workers en background');
            resolve('timeout');
          }, TIMEOUT_MS))
        ]);
      }
    } catch (e) {
      err('sync error', e);
    } finally {
      syncing = false;
      emit('sync-end');
      updateIndicator();
      // Auto-reschedule si quedan items pendientes
      try {
        const remaining = await getAll();
        if (remaining.length > 0 && navigator.onLine) {
          const minNext = Math.min.apply(null, remaining.map(x => x.nextAttempt || 0));
          const delay = Math.max(500, minNext - Date.now());
          setTimeout(() => syncNow(), delay);
        }
      } catch (_) {}
    }
  }

  function scheduleSync(delay = 500) {
    setTimeout(() => { syncNow(); }, delay);
  }

  // ─────────────────────────────────────────────────────────────
  // Indicador visual
  // ─────────────────────────────────────────────────────────────
  let indicatorEl = null;
  function ensureIndicator() {
    if (!cfg.showIndicator || indicatorEl) return;
    indicatorEl = document.createElement('div');
    indicatorEl.id = 'volvix-oq-indicator';
    const pos = cfg.indicatorPosition;
    const [v, h] = pos.split('-');
    Object.assign(indicatorEl.style, {
      position: 'fixed',
      [v]: '12px',
      [h]: '12px',
      padding: '6px 10px',
      background: 'rgba(0,0,0,0.78)',
      color: '#fff',
      font: '12px/1.2 system-ui, sans-serif',
      borderRadius: '14px',
      zIndex: 999999,
      pointerEvents: 'none',
      transition: 'opacity .25s',
      opacity: '0',
    });
    document.body.appendChild(indicatorEl);
  }

  async function updateIndicator() {
    if (!cfg.showIndicator) return;
    if (!document.body) { document.addEventListener('DOMContentLoaded', updateIndicator); return; }
    ensureIndicator();
    const all = await getAll().catch(() => []);
    const n = all.length;
    if (n === 0 && !syncing) {
      indicatorEl.style.opacity = '0';
      return;
    }
    let label;
    if (!navigator.onLine) label = `offline · ${n} pendiente${n === 1 ? '' : 's'}`;
    else if (syncing) label = `sincronizando… ${n}`;
    else label = `${n} pendiente${n === 1 ? '' : 's'}`;
    indicatorEl.textContent = label;
    indicatorEl.style.background = !navigator.onLine
      ? 'rgba(180,40,40,0.9)'
      : (syncing ? 'rgba(40,100,200,0.9)' : 'rgba(0,0,0,0.78)');
    indicatorEl.style.opacity = '1';
  }

  // ─────────────────────────────────────────────────────────────
  // Init
  // ─────────────────────────────────────────────────────────────
  async function init(userCfg = {}) {
    cfg = { ...DEFAULTS, ...userCfg };
    await openDB();
    window.addEventListener('online', () => { emit('online'); scheduleSync(0); updateIndicator(); });
    window.addEventListener('offline', () => { emit('offline'); updateIndicator(); });
    if (syncTimer) clearInterval(syncTimer);
    syncTimer = setInterval(() => syncNow(), cfg.syncIntervalMs);
    updateIndicator();
    log('init', cfg, 'fallback=', useFallback);
    if (navigator.onLine) scheduleSync(500);
    return true;
  }

  async function clear() {
    if (useFallback) { lsWrite([]); return; }
    return new Promise((resolve, reject) => {
      const r = tx('readwrite').clear();
      r.onsuccess = () => { updateIndicator(); resolve(); };
      r.onerror = () => reject(r.error);
    });
  }

  async function size() {
    const all = await getAll();
    return all.length;
  }

  // ─────────────────────────────────────────────────────────────
  // Export
  // ─────────────────────────────────────────────────────────────
  global.OfflineQueue = {
    init,
    enqueue,
    syncNow,
    getAll,
    clear,
    size,
    on,
    off,
    get config() { return { ...cfg }; },
  };
})(window);
