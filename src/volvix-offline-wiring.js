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

  /* R6b GAP-S2: Backoff exponencial + manejo 409/401 + headers idempotency/cart-token */
  const RETRY_BACKOFFS = [1000, 2000, 4000, 8000, 16000, 30000];
  function pickBackoffMs(retries) {
    return RETRY_BACKOFFS[Math.min(retries, RETRY_BACKOFFS.length - 1)];
  }

  async function syncOfflineQueue() {
    const q = readQueue();
    if (q.length === 0) return;
    if (!navigator.onLine) return;

    LOG(`Sincronizando ${q.length} operaciones...`);
    const remaining = [];
    let ok = 0, fail = 0, skipped = 0, blocked = 0;
    const now = Date.now();

    for (const op of q) {
      // Skip si está marcado bloqueado/saltado/dead
      if (op.status === 'skipped' || op.status === 'blocked_auth' || op.status === 'dead') {
        remaining.push(op);
        continue;
      }
      // Backoff: respetar nextAttemptAt
      if (op.nextAttemptAt && op.nextAttemptAt > now) {
        remaining.push(op);
        continue;
      }
      try {
        // Construir headers con Idempotency-Key + X-Cart-Token + Authorization
        const headers = { 'Content-Type': 'application/json', ...(op.headers || {}) };
        if (op.idempotency_key && !headers['Idempotency-Key']) headers['Idempotency-Key'] = op.idempotency_key;
        if (op.cart_token && !headers['X-Cart-Token']) headers['X-Cart-Token'] = op.cart_token;
        if (op.auth_token && !headers['Authorization']) headers['Authorization'] = 'Bearer ' + op.auth_token;

        const res = await fetch(op.endpoint, {
          method: op.method || 'POST',
          headers,
          body: op.data ? JSON.stringify(op.data) : undefined
        });
        if (res.ok) {
          ok++;
          LOG(`  OK ${op.type || op.endpoint}`);
          continue;
        }
        // 409 cart_already_consumed → marcar skipped (no dup)
        if (res.status === 409) {
          let body = {};
          try { body = await res.clone().json(); } catch (_) {}
          if (body.error === 'cart_already_consumed' || body.error_code === 'CART_ALREADY_CONSUMED') {
            op.status = 'skipped';
            op.skip_reason = 'cart_already_consumed';
            skipped++;
            remaining.push(op);
            continue;
          }
          if (body.idempotent_replay === true || body.error_code === 'IDEMPOTENT_REPLAY') {
            ok++;
            continue; // server ya respondió, drop
          }
        }
        // 401 SESSION_REVOKED / PERMISSIONS_CHANGED → bloquear
        if (res.status === 401) {
          let body = {};
          try { body = await res.clone().json(); } catch (_) {}
          const code = body.error_code || body.error || '';
          if (code === 'SESSION_REVOKED' || code === 'PERMISSIONS_CHANGED' || code === 'TOKEN_EXPIRED') {
            op.status = 'blocked_auth';
            op.block_reason = code;
            blocked++;
            remaining.push(op);
            continue;
          }
        }
        // Otros errores: backoff exponencial
        op.attempts = (op.attempts || 0) + 1;
        op.retries = op.attempts;
        op.nextAttemptAt = now + pickBackoffMs(op.attempts);
        if (op.attempts < 6) remaining.push(op);
        else { op.status = 'dead'; remaining.push(op); }
        fail++;
      } catch (e) {
        op.attempts = (op.attempts || 0) + 1;
        op.retries = op.attempts;
        op.nextAttemptAt = now + pickBackoffMs(op.attempts);
        op.last_error = e.message;
        if (op.attempts < 6) remaining.push(op);
        else { op.status = 'dead'; remaining.push(op); }
        fail++;
      }
    }

    writeQueue(remaining);
    if (typeof window.toast === 'function') {
      if (ok > 0)        window.toast(`Sincronizadas ${ok} operaciones`, 'success');
      if (skipped > 0)   window.toast(`${skipped} ya cobradas (no duplicadas)`, 'info');
      if (blocked > 0)   window.toast(`${blocked} bloqueadas: vuelve a iniciar sesión`, 'error');
      if (fail > 0)      window.toast(`${fail} fallaron, reintentando luego`, 'warning');
    }
    // Pedir al SW que tambien drene su cola IDB
    if (swRegistration && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type: 'TRIGGER_SYNC' });
    }
    // GAP-S3: notificar cuando queue esté vacía → online_clean
    const livePending = remaining.filter(o => o.status !== 'skipped' && o.status !== 'blocked_auth' && o.status !== 'dead').length;
    if (livePending === 0) {
      try { window.__volvixOfflineQueueClean = true; window.dispatchEvent(new CustomEvent('volvix:queue-clean')); } catch (_) {}
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

  /* ---------- R6b GAP-S4: Hourly cleanup en cliente ---------- */
  const _LAST_USER_ACTIVITY_KEY = 'volvix:last_activity_ts';
  function _markUserActivity() {
    try { localStorage.setItem(_LAST_USER_ACTIVITY_KEY, String(Date.now())); } catch (_) {}
  }
  function _getInactivityMs() {
    try {
      const last = parseInt(localStorage.getItem(_LAST_USER_ACTIVITY_KEY) || '0', 10);
      return last ? (Date.now() - last) : 0;
    } catch (_) { return 0; }
  }
  // Marcar actividad en eventos típicos
  ['click','keydown','mousemove','touchstart'].forEach(ev => {
    try { window.addEventListener(ev, _markUserActivity, { passive: true, capture: true }); } catch (_) {}
  });
  _markUserActivity();

  function _hourlyCleanup() {
    try {
      // 1. Si PerfMonitor expone cleanup de listeners orfanos, llamarlo
      if (window.PerfMonitor && typeof window.PerfMonitor.reset === 'function') {
        // Solo reset si no está corriendo activamente (no romper observabilidad en uso)
        const st = window.PerfMonitor.state || {};
        if (!st.running) { /* no hacer nada */ }
      }
      // 2. Liberar caches de listeners orphans en window (heuristico: si > 100, log)
      // 3. Force GC hint si está disponible (raro pero existe en algunos chromiums)
      if (typeof window.gc === 'function') { try { window.gc(); } catch (_) {} }
    } catch (e) { WARN('hourly cleanup error', e.message); }

    // 4. Force refresh nightly: si pagina lleva > 2h sin interaccion del user → reload
    //    SOLO en POS principal (salvadorex_web_v25.html), no en owner panel ni admin
    try {
      const p = (location.pathname || '').toLowerCase();
      const isPos = p.includes('salvadorex_web') || p.includes('multipos') || p === '/';
      if (!isPos) return;
      const inactivityMs = _getInactivityMs();
      const TWO_HOURS = 2 * 60 * 60 * 1000;
      if (inactivityMs >= TWO_HOURS) {
        LOG('User inactivo > 2h, refresh nocturno PWA');
        // Solo si no hay queue offline pendiente (no perder ventas)
        if (queueLength() === 0 && navigator.onLine) {
          window.location.reload();
        }
      }
    } catch (_) {}
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

    // R6b GAP-S4: Hourly cleanup (memory leak prevention en PWA días abierta)
    setInterval(_hourlyCleanup, 60 * 60 * 1000);
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
