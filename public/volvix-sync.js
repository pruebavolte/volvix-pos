/* ============================================================
   VOLVIX · Sync Engine (offline-first)
   ============================================================
   Cumple REGLA 2 de RULES.md: "Offline-first o no existe"

   Responsabilidades:
   - Detecta conexión en tiempo real (eventos + heartbeat)
   - Toda operación se aplica LOCAL primero (optimistic UI)
   - Si online: manda al server inmediatamente
   - Si offline: encola en queue persistente (localStorage)
   - Cuando vuelve internet: procesa queue en orden FIFO
   - Resuelve conflictos con last-write-wins (timestamps)
   - Reintenta con backoff exponencial (1s → 2s → 4s → ... 60s)
   - Notifica al UI con eventos (connection:change, op:synced, etc)
   - Persiste queue entre cierres de navegador
   - Multi-pestaña: lee localStorage cada vez (sin caché en memoria)

   API:
     window.volvix.sync.execute(op)   → ejecuta operación offline-first
     window.volvix.sync.pull(tables)  → trae cambios del server (last-write-wins)
     window.volvix.sync.syncNow()     → fuerza procesamiento de queue
     window.volvix.sync.isOnline()    → boolean
     window.volvix.sync.isSyncing()   → boolean
     window.volvix.sync.pendingCount() → número
     window.volvix.sync.lastSync()    → timestamp ms
     window.volvix.sync.stats()       → { online, syncing, pending, lastSync, retryDelay }
     window.volvix.sync.on(event, cb) → suscripción a eventos
     window.volvix.sync.clear()       → wipe (debug)
============================================================ */
(function () {
  'use strict';

  // =========================================================
  // CONSTANTES
  // =========================================================
  const QUEUE_KEY      = 'volvix:sync:queue';
  const LOCAL_KEY      = 'volvix:sync:data';
  const META_KEY       = 'volvix:sync:meta';
  const MAX_RETRIES    = 10;
  const HEARTBEAT_MS   = 30000;
  const TIMEOUT_MS     = 10000;
  const INITIAL_DELAY  = 1000;
  const MAX_DELAY      = 60000;

  // =========================================================
  // ESTADO
  // =========================================================
  let online = (typeof navigator !== 'undefined') ? navigator.onLine : true;
  let syncing = false;
  let retryDelay = INITIAL_DELAY;
  let retryTimer = null;
  let heartbeatTimer = null;
  const listeners = new Map();

  // =========================================================
  // STORAGE PERSISTENTE (queue, local, meta)
  // SIEMPRE lee/escribe localStorage, nunca cachea en memoria
  // (multi-pestaña safe)
  // =========================================================
  function loadQueue() {
    try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); }
    catch { return []; }
  }
  function saveQueue(q) {
    try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); }
    catch (e) { console.warn('[volvix sync] localStorage lleno:', e.message); }
  }

  function loadLocal() {
    try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || '{}'); }
    catch { return {}; }
  }
  function saveLocal(d) {
    try { localStorage.setItem(LOCAL_KEY, JSON.stringify(d)); }
    catch (e) { console.warn('[volvix sync] localStorage lleno:', e.message); }
  }

  function loadMeta() {
    try { return JSON.parse(localStorage.getItem(META_KEY) || '{}'); }
    catch { return {}; }
  }
  function saveMeta(m) {
    try { localStorage.setItem(META_KEY, JSON.stringify(m)); }
    catch {}
  }

  // =========================================================
  // EVENTOS (pub/sub interno)
  // =========================================================
  function emit(event, data) {
    const handlers = listeners.get(event) || [];
    for (const h of handlers) {
      try { h(data); } catch (e) { console.error('[volvix sync] handler error:', e); }
    }
    // Wildcard
    const wildcards = listeners.get('*') || [];
    for (const h of wildcards) {
      try { h({ event, data }); } catch (e) { console.error(e); }
    }
  }

  function on(event, handler) {
    if (!listeners.has(event)) listeners.set(event, []);
    listeners.get(event).push(handler);
    return function off() {
      const arr = listeners.get(event);
      if (!arr) return;
      const idx = arr.indexOf(handler);
      if (idx >= 0) arr.splice(idx, 1);
    };
  }

  // =========================================================
  // DETECCIÓN DE CONEXIÓN
  // =========================================================
  async function checkOnline() {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setOnline(false);
      return false;
    }
    const apiUrl = window.volvix?.config?.apiUrl;
    if (!apiUrl) {
      // Sin apiUrl → no hay server → estamos en modo offline
      setOnline(false);
      return false;
    }
    try {
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), 3000);
      const res = await fetch(apiUrl + '/api/health', {
        signal: ctrl.signal,
        cache: 'no-store',
      });
      clearTimeout(to);
      setOnline(res.ok);
      return res.ok;
    } catch {
      setOnline(false);
      return false;
    }
  }

  function setOnline(value) {
    const wasOnline = online;
    online = value;
    if (wasOnline !== online) {
      emit('connection:change', { online });
      if (online) {
        console.log('%c VOLVIX SYNC ', 'background:#22C55E;color:#fff;padding:2px 6px;border-radius:3px',
          '✓ Conexión recuperada — sincronizando...');
        retryDelay = INITIAL_DELAY;
        // Procesar queue al reconectar
        setTimeout(processQueue, 500);
      } else {
        console.log('%c VOLVIX SYNC ', 'background:#EF4444;color:#fff;padding:2px 6px;border-radius:3px',
          '✗ Sin conexión — operando offline');
      }
    }
  }

  // =========================================================
  // EXECUTE · operación offline-first
  // =========================================================
  /**
   * op = {
   *   type: 'create' | 'update' | 'delete',
   *   table: 'ventas' | 'productos' | etc,
   *   id: string (para update/delete),
   *   data: object (para create/update),
   *   endpoint: string (URL del API, ej. '/api/ventas'),
   *   method: string (default GET/POST/PATCH/DELETE según type),
   *   body: object (default = data),
   * }
   *
   * Returns: Promise<{ success, synced, queued, result, opId }>
   */
  async function execute(op) {
    if (!op || !op.type) {
      throw new Error('execute requiere op.type');
    }

    const opId = 'op-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
    const operation = {
      id: opId,
      timestamp: Date.now(),
      attempts: 0,
      type: op.type,
      table: op.table,
      itemId: op.id,
      data: op.data,
      endpoint: op.endpoint,
      method: op.method,
      body: op.body || op.data,
    };

    // 1. Aplicar local inmediatamente (optimistic UI)
    if (op.table && op.data) {
      const local = loadLocal();
      if (!local[op.table]) local[op.table] = [];
      if (op.type === 'create') {
        local[op.table].push({
          ...op.data,
          _localId: opId,
          _synced: false,
          _ts: operation.timestamp,
        });
      } else if (op.type === 'update') {
        const idx = local[op.table].findIndex(x => x.id === op.id || x._localId === op.id);
        if (idx >= 0) {
          local[op.table][idx] = {
            ...local[op.table][idx],
            ...op.data,
            _synced: false,
            _ts: operation.timestamp,
          };
        }
      } else if (op.type === 'delete') {
        local[op.table] = local[op.table].filter(x => x.id !== op.id && x._localId !== op.id);
      }
      saveLocal(local);
    }

    emit('op:applied-local', { operation });

    // 2. Si online, intentar mandar al server ahora
    if (online) {
      try {
        const result = await sendToServer(operation);
        markSynced(operation, result);
        emit('op:synced', { operation, result });
        return { success: true, synced: true, queued: false, result, opId };
      } catch (err) {
        // Falló online → encolar y marcar como offline
        console.warn('[volvix sync] envío directo falló, encolando:', err.message);
        if (err.name === 'AbortError' || err.message.includes('fetch') || err.message.includes('network')) {
          setOnline(false);
        }
        // Cae al paso 3 (queue)
      }
    }

    // 3. Encolar (offline o falló envío directo)
    const queue = loadQueue();
    queue.push(operation);
    saveQueue(queue);
    emit('queue:added', { operation, queueSize: queue.length });
    return { success: true, synced: false, queued: true, opId };
  }

  // =========================================================
  // ENVIAR AL SERVER
  // =========================================================
  async function sendToServer(op) {
    const apiUrl = window.volvix?.config?.apiUrl;
    if (!apiUrl) throw new Error('sin apiUrl');

    const method = op.method || (
      op.type === 'create' ? 'POST' :
      op.type === 'update' ? 'PATCH' :
      op.type === 'delete' ? 'DELETE' : 'POST'
    );

    let endpoint = op.endpoint;
    if (!endpoint && op.table) {
      endpoint = '/api/' + op.table + (op.itemId && op.type !== 'create' ? '/' + op.itemId : '');
    }
    if (!endpoint) throw new Error('op sin endpoint ni table');

    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'X-Volvix-Op-Id': op.id,
      'X-Volvix-Op-Ts': String(op.timestamp),
    };

    // Auth header si hay sesión
    const authHeaders = window.volvix?.session?.getAuthHeaders?.() || {};
    Object.assign(headers, authHeaders);

    // Tenant
    const tenantId = window.volvix?.session?.getTenantId?.();
    if (tenantId) headers['X-Tenant-Id'] = tenantId;

    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), TIMEOUT_MS);

    try {
      const res = await fetch(apiUrl + endpoint, {
        method,
        headers,
        body: (op.body && method !== 'GET' && method !== 'DELETE') ? JSON.stringify(op.body) : undefined,
        signal: ctrl.signal,
        cache: 'no-store',
      });
      clearTimeout(to);

      if (res.status === 401) {
        // Sesión expiró: limpiar y redirigir
        if (window.volvix?.session?.clear) window.volvix.session.clear();
        if (location.pathname !== '/login.html') {
          location.replace('/login.html?expired=1');
        }
        throw new Error('Sesión expirada');
      }

      if (!res.ok) {
        let errMsg = 'HTTP ' + res.status;
        try {
          const errBody = await res.json();
          errMsg = errBody.error || errBody.message || errMsg;
        } catch {}
        throw new Error(errMsg);
      }

      if (res.status === 204) return null;
      return await res.json();
    } finally {
      clearTimeout(to);
    }
  }

  // =========================================================
  // MARCAR ITEM COMO SYNCED (después de éxito)
  // =========================================================
  function markSynced(op, result) {
    if (op.table && op.data) {
      const local = loadLocal();
      if (local[op.table]) {
        const idx = local[op.table].findIndex(x =>
          x._localId === op.id ||
          (result && x.id === result.id) ||
          (op.itemId && x.id === op.itemId)
        );
        if (idx >= 0) {
          local[op.table][idx] = {
            ...local[op.table][idx],
            ...(result || {}),
            _synced: true,
          };
          delete local[op.table][idx]._localId;
          saveLocal(local);
        }
      }
    }
    const meta = loadMeta();
    meta.lastSync = Date.now();
    saveMeta(meta);
  }

  // =========================================================
  // PROCESAR QUEUE
  // =========================================================
  async function processQueue() {
    if (syncing) return;
    if (!online) return;

    const queue = loadQueue();
    if (queue.length === 0) return;

    syncing = true;
    emit('sync:start', { pending: queue.length });

    const remaining = [];
    let synced = 0;
    let failed = 0;
    let aborted = false;

    for (let i = 0; i < queue.length; i++) {
      const op = queue[i];
      try {
        const result = await sendToServer(op);
        markSynced(op, result);
        emit('op:synced', { operation: op, result });
        synced++;
      } catch (err) {
        op.attempts = (op.attempts || 0) + 1;
        op.lastError = err.message;

        if (op.attempts < MAX_RETRIES) {
          remaining.push(op);
        } else {
          console.error('[volvix sync] op abandonada después de ' + MAX_RETRIES + ' intentos:', op);
          emit('op:abandoned', { operation: op });
        }
        failed++;

        // Si es error de red, abortar el resto del batch (no reintentes ahora)
        if (err.name === 'AbortError' || err.message.includes('fetch') ||
            err.message.includes('network') || err.message.includes('sin apiUrl')) {
          setOnline(false);
          // Re-encolar todos los pendientes restantes
          for (let j = i + 1; j < queue.length; j++) {
            remaining.push(queue[j]);
          }
          aborted = true;
          break;
        }
      }
    }

    saveQueue(remaining);
    syncing = false;
    emit('sync:end', { synced, failed, remaining: remaining.length, aborted });

    if (synced > 0) {
      console.log('%c VOLVIX SYNC ', 'background:#22C55E;color:#fff;padding:2px 6px;border-radius:3px',
        '✓ Sincronizados ' + synced + ' cambios');
      retryDelay = INITIAL_DELAY;
    }

    // Si quedan pendientes y seguimos online, reintentar con backoff
    if (remaining.length > 0 && online && !aborted) {
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = setTimeout(() => {
        retryDelay = Math.min(retryDelay * 2, MAX_DELAY);
        processQueue();
      }, retryDelay);
    }
  }

  // =========================================================
  // PULL · traer cambios del server (last-write-wins)
  // =========================================================
  async function pull(tables) {
    if (!online) return { success: false, reason: 'offline' };
    const apiUrl = window.volvix?.config?.apiUrl;
    if (!apiUrl) return { success: false, reason: 'no-api-url' };
    if (!Array.isArray(tables) || tables.length === 0) {
      return { success: false, reason: 'no-tables' };
    }

    const local = loadLocal();
    let totalNew = 0;
    let totalUpdated = 0;
    const errors = [];

    const headers = { 'Accept': 'application/json' };
    const authHeaders = window.volvix?.session?.getAuthHeaders?.() || {};
    Object.assign(headers, authHeaders);
    const tenantId = window.volvix?.session?.getTenantId?.();
    if (tenantId) headers['X-Tenant-Id'] = tenantId;

    for (const table of tables) {
      try {
        const res = await fetch(apiUrl + '/api/' + table, {
          headers,
          cache: 'no-store',
        });
        if (!res.ok) {
          errors.push({ table, status: res.status });
          continue;
        }
        const serverData = await res.json();
        if (!Array.isArray(serverData)) continue;

        if (!local[table]) local[table] = [];

        for (const serverItem of serverData) {
          const localIdx = local[table].findIndex(x => x.id === serverItem.id);
          if (localIdx === -1) {
            // Nuevo del server
            local[table].push({ ...serverItem, _synced: true });
            totalNew++;
          } else {
            const localItem = local[table][localIdx];
            // Si tenemos cambios locales no sincronizados, los respetamos
            if (localItem._synced === false) continue;
            // Last-write-wins por timestamp
            const localTs = localItem._ts || localItem.updated_at || localItem.created_at || 0;
            const serverTs = serverItem.updated_at || serverItem.created_at || 0;
            const localTsMs = typeof localTs === 'string' ? new Date(localTs).getTime() : localTs;
            const serverTsMs = typeof serverTs === 'string' ? new Date(serverTs).getTime() : serverTs;
            if (serverTsMs >= localTsMs) {
              local[table][localIdx] = { ...serverItem, _synced: true };
              totalUpdated++;
            }
          }
        }
      } catch (err) {
        errors.push({ table, error: err.message });
        console.warn('[volvix sync] pull falló para', table, err.message);
      }
    }

    saveLocal(local);
    const meta = loadMeta();
    meta.lastPull = Date.now();
    saveMeta(meta);
    emit('sync:pulled', { tables, totalNew, totalUpdated, errors });
    return { success: true, totalNew, totalUpdated, errors };
  }

  // =========================================================
  // INICIALIZACIÓN
  // =========================================================
  function init() {
    // Eventos del navegador
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        console.log('[volvix sync] evento online');
        checkOnline();
      });
      window.addEventListener('offline', () => {
        console.log('[volvix sync] evento offline');
        setOnline(false);
      });

      // Heartbeat periódico
      heartbeatTimer = setInterval(checkOnline, HEARTBEAT_MS);

      // Sync cuando la pestaña vuelve a primer plano
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden && online) {
          processQueue();
        }
      });

      // Multi-pestaña: detectar cambios en localStorage de otras pestañas
      window.addEventListener('storage', (e) => {
        if (e.key === QUEUE_KEY) {
          emit('queue:external-change', { newSize: loadQueue().length });
        }
      });
    }

    // Check inicial
    checkOnline().then(() => {
      if (online) processQueue();
    });

    console.log('%c VOLVIX SYNC ', 'background:#FBBF24;color:#000;padding:2px 6px;border-radius:3px',
      'engine listo · pendientes:', loadQueue().length);
  }

  // =========================================================
  // API PÚBLICA
  // =========================================================
  const sync = {
    execute,
    pull,
    syncNow: processQueue,

    // Estado
    isOnline:     () => online,
    isSyncing:    () => syncing,
    pendingCount: () => loadQueue().length,
    lastSync:     () => loadMeta().lastSync || null,
    lastPull:     () => loadMeta().lastPull || null,

    stats: () => ({
      online,
      syncing,
      pending: loadQueue().length,
      lastSync: loadMeta().lastSync || null,
      lastPull: loadMeta().lastPull || null,
      retryDelay,
    }),

    // Acceso a datos locales
    getLocal: (table) => {
      const d = loadLocal();
      return d[table] || [];
    },
    setLocal: (table, data) => {
      const d = loadLocal();
      d[table] = data;
      saveLocal(d);
    },

    // Eventos
    on,

    // Forzar check
    checkConnection: checkOnline,

    // Debug / reset
    clear: () => {
      localStorage.removeItem(QUEUE_KEY);
      localStorage.removeItem(LOCAL_KEY);
      localStorage.removeItem(META_KEY);
      console.log('[volvix sync] datos limpiados');
    },

    // Constantes (solo lectura)
    MAX_RETRIES,
    HEARTBEAT_MS,
  };

  // =========================================================
  // PUBLICAR (esperando que window.volvix exista)
  // =========================================================
  function publish() {
    if (!window.volvix) {
      // volvix-api.js todavía no cargó → esperar
      setTimeout(publish, 50);
      return;
    }
    window.volvix.sync = sync;
    init();
  }
  publish();
})();