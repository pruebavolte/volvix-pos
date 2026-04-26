/* ============================================================
   Volvix POS — Offline Wiring
   Agent-12 / Ronda 6 Fibonacci
   - Registra Service Worker /sw.js
   - Indicador visual online/offline
   - Cola persistente (localStorage + IndexedDB)
   - Sync automatico al recuperar conexion
   - Auto-update cuando hay nueva version del SW
   ============================================================ */

(function () {
  'use strict';

  const LOG = (...a) => console.log('[OFFLINE]', ...a);
  const WARN = (...a) => console.warn('[OFFLINE]', ...a);

  const QUEUE_KEY = 'volvix:offline-queue';
  const SW_PATH   = '/sw.js';

  /* ---------- 1. SERVICE WORKER ---------- */
  let swRegistration = null;

  async function registerSW() {
    if (!('serviceWorker' in navigator)) {
      WARN('SW no soportado por este navegador');
      return;
    }
    try {
      const reg = await navigator.serviceWorker.register(SW_PATH, { scope: '/' });
      swRegistration = reg;
      LOG('SW registrado:', reg.scope);

      // Detectar nueva version
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        if (!nw) return;
        nw.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) {
            LOG('Nueva version disponible');
            showUpdateBanner(nw);
          }
        });
      });

      // Background sync (si esta soportado)
      if ('sync' in reg) {
        try { await reg.sync.register('volvix-sync'); } catch (_) {}
      }

      // Mensajes desde el SW
      navigator.serviceWorker.addEventListener('message', (e) => {
        const msg = e.data || {};
        if (msg.type === 'sync-complete') {
          LOG(`Sync: ${msg.ok} ok, ${msg.fail} fallidas`);
          if (typeof window.toast === 'function' && msg.ok > 0) {
            window.toast(`Sincronizadas ${msg.ok} operaciones`, 'success');
          }
        }
      });

      // Recargar al activar nuevo SW
      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (refreshing) return;
        refreshing = true;
        LOG('Nuevo SW activo, recargando...');
        window.location.reload();
      });
    } catch (err) {
      WARN('SW error:', err.message);
    }
  }

  function showUpdateBanner(worker) {
    if (document.getElementById('sw-update-banner')) return;
    const b = document.createElement('div');
    b.id = 'sw-update-banner';
    b.style.cssText = `
      position:fixed;bottom:20px;left:50%;transform:translateX(-50%);
      background:#1f2937;color:#fff;padding:12px 18px;border-radius:10px;
      box-shadow:0 6px 20px rgba(0,0,0,.25);z-index:99999;
      display:flex;gap:12px;align-items:center;font-family:system-ui,sans-serif;
      font-size:14px;
    `;
    b.innerHTML = `
      <span>Nueva version disponible</span>
      <button id="sw-update-btn" style="
        background:#22c55e;color:#fff;border:none;padding:6px 12px;
        border-radius:6px;cursor:pointer;font-weight:600;">
        Actualizar
      </button>
      <button id="sw-update-skip" style="
        background:transparent;color:#9ca3af;border:none;cursor:pointer;">
        Despues
      </button>
    `;
    document.body.appendChild(b);
    document.getElementById('sw-update-btn').onclick = () => {
      worker.postMessage({ type: 'SKIP_WAITING' });
      b.remove();
    };
    document.getElementById('sw-update-skip').onclick = () => b.remove();
  }

  /* ---------- 2. INDICADOR ONLINE/OFFLINE ---------- */
  function createIndicator() {
    if (document.getElementById('connection-status')) return;
    const ind = document.createElement('div');
    ind.id = 'connection-status';
    ind.style.cssText = `
      position:fixed;top:80px;right:20px;padding:8px 14px;
      border-radius:20px;font-size:12px;font-weight:bold;
      z-index:9990;transition:all .3s;cursor:pointer;
      font-family:system-ui,sans-serif;user-select:none;
      box-shadow:0 2px 8px rgba(0,0,0,.15);
    `;
    ind.title = 'Click para forzar sync';
    ind.onclick = () => {
      syncOfflineQueue();
      if (typeof window.toast === 'function') {
        window.toast('Sincronizando...', 'info');
      }
    };
    document.body.appendChild(ind);
    updateIndicator();
  }

  function updateIndicator() {
    const ind = document.getElementById('connection-status');
    if (!ind) return;
    const qLen = queueLength();
    if (navigator.onLine) {
      ind.style.background = 'rgba(34,197,94,0.92)';
      ind.style.color = '#fff';
      ind.innerHTML = qLen > 0
        ? `Online · ${qLen} pend.`
        : 'Online';
    } else {
      ind.style.background = 'rgba(239,68,68,0.92)';
      ind.style.color = '#fff';
      ind.innerHTML = qLen > 0
        ? `Offline · ${qLen} en cola`
        : 'Offline';
    }
  }

  /* ---------- 3. COLA OFFLINE (localStorage) ---------- */
  function readQueue() {
    try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); }
    catch { return []; }
  }
  function writeQueue(q) {
    try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); } catch (_) {}
    updateIndicator();
  }
  function queueLength() {
    return readQueue().length;
  }

  function addToOfflineQueue(op) {
    if (!op || !op.endpoint) {
      WARN('addToOfflineQueue: op invalido', op);
      return;
    }
    const q = readQueue();
    q.push({
      id: `op_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      ...op,
      queued_at: Date.now(),
      attempts: 0
    });
    writeQueue(q);
    LOG(`Encolado: ${op.type || op.endpoint}`);
    // Tambien guardar en IDB por durabilidad
    idbQueueAdd(op);
  }

  async function syncOfflineQueue() {
    const q = readQueue();
    if (q.length === 0) return;
    if (!navigator.onLine) return;

    LOG(`Sincronizando ${q.length} operaciones...`);
    const remaining = [];
    let ok = 0, fail = 0;

    for (const op of q) {
      try {
        const res = await fetch(op.endpoint, {
          method: op.method || 'POST',
          headers: { 'Content-Type': 'application/json', ...(op.headers || {}) },
          body: op.data ? JSON.stringify(op.data) : undefined
        });
        if (res.ok) {
          ok++;
          LOG(`  OK ${op.type || op.endpoint}`);
        } else {
          fail++;
          op.attempts = (op.attempts || 0) + 1;
          if (op.attempts < 5) remaining.push(op);
        }
      } catch (e) {
        fail++;
        op.attempts = (op.attempts || 0) + 1;
        if (op.attempts < 5) remaining.push(op);
      }
    }

    writeQueue(remaining);
    if (typeof window.toast === 'function') {
      if (ok > 0)   window.toast(`Sincronizadas ${ok} operaciones`, 'success');
      if (fail > 0) window.toast(`${fail} fallaron, reintentando luego`, 'warning');
    }
    // Pedir al SW que tambien drene su cola IDB
    if (swRegistration && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type: 'TRIGGER_SYNC' });
    }
  }

  /* ---------- 4. INDEXED DB (datos grandes + cola durable) ---------- */
  let db = null;
  function openIDB() {
    return new Promise((resolve) => {
      const req = indexedDB.open('volvix-db', 1);
      req.onupgradeneeded = (e) => {
        const _db = e.target.result;
        if (!_db.objectStoreNames.contains('cache'))
          _db.createObjectStore('cache', { keyPath: 'key' });
        if (!_db.objectStoreNames.contains('queue'))
          _db.createObjectStore('queue', { keyPath: 'id', autoIncrement: true });
      };
      req.onsuccess = (e) => { db = e.target.result; resolve(db); };
      req.onerror = () => resolve(null);
    });
  }

  function idbSet(key, value) {
    if (!db) return;
    try {
      const tx = db.transaction(['cache'], 'readwrite');
      tx.objectStore('cache').put({ key, value, ts: Date.now() });
    } catch (e) { WARN('idbSet:', e.message); }
  }

  function idbGet(key) {
    return new Promise((resolve) => {
      if (!db) return resolve(null);
      try {
        const tx = db.transaction(['cache'], 'readonly');
        const r = tx.objectStore('cache').get(key);
        r.onsuccess = () => resolve(r.result?.value ?? null);
        r.onerror = () => resolve(null);
      } catch { resolve(null); }
    });
  }

  function idbDel(key) {
    if (!db) return;
    try {
      const tx = db.transaction(['cache'], 'readwrite');
      tx.objectStore('cache').delete(key);
    } catch (_) {}
  }

  function idbQueueAdd(op) {
    if (!db) return;
    try {
      const tx = db.transaction(['queue'], 'readwrite');
      tx.objectStore('queue').add({ ...op, queued_at: Date.now() });
    } catch (e) { WARN('idbQueueAdd:', e.message); }
  }

  /* ---------- 5. EVENTOS ONLINE/OFFLINE ---------- */
  window.addEventListener('online', () => {
    LOG('Conexion restaurada');
    updateIndicator();
    syncOfflineQueue();
    if (typeof window.toast === 'function') {
      window.toast('Conexion restaurada', 'success');
    }
  });

  window.addEventListener('offline', () => {
    LOG('Sin conexion');
    updateIndicator();
    if (typeof window.toast === 'function') {
      window.toast('Sin conexion - operando offline', 'warning');
    }
  });

  /* ---------- 6. INTERCEPTOR fetch (helper opcional) ---------- */
  window.offlineFetch = async function (endpoint, options = {}) {
    if (navigator.onLine) {
      try {
        const r = await fetch(endpoint, options);
        if (r.ok) return r;
        throw new Error(`HTTP ${r.status}`);
      } catch (e) {
        addToOfflineQueue({
          endpoint,
          method: options.method,
          headers: options.headers,
          data: options.body ? safeParse(options.body) : null,
          type: 'auto'
        });
        throw e;
      }
    } else {
      addToOfflineQueue({
        endpoint,
        method: options.method,
        headers: options.headers,
        data: options.body ? safeParse(options.body) : null,
        type: 'auto'
      });
      return new Response(
        JSON.stringify({ ok: false, queued: true, offline: true }),
        { status: 202, headers: { 'Content-Type': 'application/json' } }
      );
    }
  };

  function safeParse(s) {
    try { return typeof s === 'string' ? JSON.parse(s) : s; }
    catch { return s; }
  }

  /* ---------- 7. INIT ---------- */
  async function init() {
    await openIDB();
    createIndicator();
    registerSW();
    if (navigator.onLine) syncOfflineQueue();

    // Reintento periodico
    setInterval(() => {
      if (navigator.onLine && queueLength() > 0) syncOfflineQueue();
      updateIndicator();
    }, 30000);
  }

  /* ---------- 8. API PUBLICA ---------- */
  window.addToOfflineQueue = addToOfflineQueue;
  window.idbSet = idbSet;
  window.idbGet = idbGet;
  window.idbDel = idbDel;

  window.OfflineAPI = {
    syncQueue:    syncOfflineQueue,
    addToQueue:   addToOfflineQueue,
    queueLength,
    readQueue,
    clearQueue:   () => writeQueue([]),
    idbSet, idbGet, idbDel,
    isOnline:     () => navigator.onLine,
    swRegistration: () => swRegistration,
    forceUpdate: () => {
      if (swRegistration) swRegistration.update();
    },
    clearAllCaches: () => {
      if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_CACHE' });
      }
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  LOG('volvix-offline-wiring cargado');
})();
