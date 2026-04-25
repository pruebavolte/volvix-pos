/* ============================================================
   VOLVIX · Sync Engine
   ============================================================
   Offline-first real. Qué hace:

   1. Detecta conexión (online/offline) en tiempo real
   2. Toda operación (venta, cobro, etc) se guarda PRIMERO local
   3. Si hay internet, se manda también al servidor
   4. Si NO hay internet, se mete a una queue persistente
   5. Cuando vuelve internet, procesa la queue en orden
   6. Resuelve conflictos con timestamps (last-write-wins)
   7. Reintenta con backoff exponencial (1s, 2s, 4s, 8s, 16s...)
   8. Notifica al UI cambios de estado

   Expone: window.volvix.sync
============================================================ */
(function () {
  'use strict';

  const QUEUE_KEY = 'volvix:sync:queue';
  const LOCAL_KEY = 'volvix:sync:data';
  const META_KEY = 'volvix:sync:meta';
  const MAX_RETRIES = 10;

  // =============== ESTADO ===============
  let online = typeof navigator !== 'undefined' ? navigator.onLine : true;
  let syncing = false;
  let listeners = new Map();
  let retryTimer = null;
  let retryDelay = 1000;

  // =============== QUEUE PERSISTENTE ===============
  function loadQueue() {
    try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); }
    catch { return []; }
  }
  function saveQueue(q) { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); }

  function loadLocal() {
    try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || '{}'); }
    catch { return {}; }
  }
  function saveLocal(d) { localStorage.setItem(LOCAL_KEY, JSON.stringify(d)); }

  function loadMeta() {
    try { return JSON.parse(localStorage.getItem(META_KEY) || '{}'); }
    catch { return {}; }
  }
  function saveMeta(m) { localStorage.setItem(META_KEY, JSON.stringify(m)); }

  // =============== EMIT EVENTOS ===============
  function emit(event, data) {
    const handlers = listeners.get(event) || [];
    handlers.forEach(h => { try { h(data); } catch (e) { console.error(e); } });
  }
  function on(event, handler) {
    if (!listeners.has(event)) listeners.set(event, []);
    listeners.get(event).push(handler);
    return () => {
      const arr = listeners.get(event);
      const idx = arr.indexOf(handler);
      if (idx >= 0) arr.splice(idx, 1);
    };
  }

  // =============== DETECCIÓN DE CONEXIÓN ===============
  async function checkOnline() {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      online = false;
      return false;
    }
    // Verificación real con ping al backend
    try {
      const base = window.volvix?.config?.apiUrl;
      if (!base) { online = false; return false; }
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), 3000);
      const res = await fetch(base + '/api/health', {
        signal: ctrl.signal,
        cache: 'no-store',
      });
      clearTimeout(to);
      online = res.ok;
    } catch {
      online = false;
    }
    return online;
  }

  function setOnline(value) {
    const was = online;
    online = value;
    if (was !== online) {
      emit('connection:change', { online });
      if (online) {
        console.log('%c VOLVIX ', 'background:#22C55E;color:#fff;padding:2px 6px;border-radius:3px', '✓ Conexión recuperada — sincronizando...');
        retryDelay = 1000;
        processQueue();
      } else {
        console.log('%c VOLVIX ', 'background:#EF4444;color:#fff;padding:2px 6px;border-radius:3px', '✗ Sin conexión — operando offline');
      }
    }
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => { setOnline(true); });
    window.addEventListener('offline', () => { setOnline(false); });
    // Heartbeat cada 30s
    setInterval(async () => {
      await checkOnline();
      setOnline(online);
    }, 30000);
  }

  // =============== OPERACIÓN OFFLINE-FIRST ===============
  /**
   * Ejecuta una operación offline-first:
   * 1. Aplica el cambio local inmediato (optimistic)
   * 2. Si online: manda al server y confirma
   * 3. Si offline: mete a queue para cuando vuelva internet
   */
  async function execute(op) {
    // op = { type, table, id, data, method, endpoint, body }
    const operation = {
      id: 'op-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
      timestamp: Date.now(),
      attempts: 0,
      ...op,
    };

    // 1. Aplicar local inmediatamente (optimistic UI)
    if (op.table && op.data) {
      const local = loadLocal();
      if (!local[op.table]) local[op.table] = [];
      if (op.type === 'create') {
        local[op.table].push({ ...op.data, _localId: operation.id, _synced: false });
      } else if (op.type === 'update') {
        const idx = local[op.table].findIndex(x => x.id === op.id || x._localId === op.id);
        if (idx >= 0) {
          local[op.table][idx] = { ...local[op.table][idx], ...op.data, _synced: false };
        }
      } else if (op.type === 'delete') {
        local[op.table] = local[op.table].filter(x => x.id !== op.id && x._localId !== op.id);
      }
      saveLocal(local);
    }

    emit('op:applied-local', operation);

    // 2. Intentar mandar al server
    if (online) {
      try {
        const result = await sendToServer(operation);
        markSynced(operation, result);
        return { success: true, synced: true, result };
      } catch (err) {
        console.warn('[volvix sync] falló online, metiendo a queue:', err.message);
        setOnline(false);
      }
    }

    // 3. Meter a queue
    const queue = loadQueue();
    queue.push(operation);
    saveQueue(queue);
    emit('queue:added', { operation, queueSize: queue.length });
    return { success: true, synced: false, queued: true };
  }

  // =============== ENVÍO AL SERVER ===============
  async function sendToServer(op) {
    const base = window.volvix?.config?.apiUrl;
    if (!base) throw new Error('sin apiUrl');

    const method = op.method || (op.type === 'create' ? 'POST' :
                                  op.type === 'update' ? 'PATCH' :
                                  op.type === 'delete' ? 'DELETE' : 'POST');
    const endpoint = op.endpoint || `/api/${op.table}${op.id ? '/' + op.id : ''}`;

    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 10000);
    try {
      const res = await fetch(base + endpoint, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'X-Volvix-Op-Id': op.id,
          'X-Volvix-Op-Ts': String(op.timestamp),
        },
        body: op.body ? JSON.stringify(op.body) : (op.data ? JSON.stringify(op.data) : undefined),
        signal: ctrl.signal,
      });
      clearTimeout(to);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.json();
    } finally {
      clearTimeout(to);
    }
  }

  // =============== PROCESAR QUEUE ===============
  async function processQueue() {
    if (syncing) return;
    if (!online) return;
    const queue = loadQueue();
    if (queue.length === 0) return;

    syncing = true;
    emit('sync:start', { pending: queue.length });

    const remaining = [];
    let synced = 0, failed = 0;

    for (const op of queue) {
      try {
        const result = await sendToServer(op);
        markSynced(op, result);
        synced++;
        emit('op:synced', { op, result });
      } catch (err) {
        op.attempts = (op.attempts || 0) + 1;
        op.lastError = err.message;
        if (op.attempts < MAX_RETRIES) {
          remaining.push(op);
        } else {
          console.error('[volvix sync] op superó max retries, abandonada:', op);
          emit('op:abandoned', { op });
        }
        failed++;

        // Si es error de red, corta y espera
        if (err.message.includes('fetch') || err.name === 'AbortError') {
          setOnline(false);
          remaining.push(...queue.slice(queue.indexOf(op) + 1));
          break;
        }
      }
    }

    saveQueue(remaining);
    syncing = false;
    emit('sync:end', { synced, failed, remaining: remaining.length });

    // Si quedan, reintentar con backoff
    if (remaining.length > 0 && online) {
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = setTimeout(() => {
        retryDelay = Math.min(retryDelay * 2, 60000);
        processQueue();
      }, retryDelay);
    } else if (synced > 0) {
      console.log('%c VOLVIX ', 'background:#22C55E;color:#fff;padding:2px 6px;border-radius:3px',
        `✓ Sincronizados ${synced} cambios`);
      retryDelay = 1000;
    }
  }

  // =============== MARCAR SYNCED ===============
  function markSynced(op, result) {
    if (op.table && op.data) {
      const local = loadLocal();
      if (local[op.table]) {
        const idx = local[op.table].findIndex(x =>
          x._localId === op.id || x.id === (result?.id || op.id)
        );
        if (idx >= 0) {
          local[op.table][idx] = {
            ...local[op.table][idx],
            ...(result || {}),
            _synced: true,
            _localId: undefined,
          };
          saveLocal(local);
        }
      }
    }
    const meta = loadMeta();
    meta.lastSync = Date.now();
    saveMeta(meta);
  }

  // =============== PULL DESDE SERVIDOR ===============
  /**
   * Trae cambios del servidor y los mergea local con last-write-wins
   */
  async function pull(tables) {
    if (!online) return { success: false, reason: 'offline' };
    const base = window.volvix?.config?.apiUrl;
    if (!base) return { success: false, reason: 'no-api-url' };

    const meta = loadMeta();
    const local = loadLocal();
    let totalNew = 0, totalUpdated = 0;

    for (const table of tables) {
      try {
        const res = await fetch(base + '/api/' + table);
        if (!res.ok) continue;
        const serverData = await res.json();
        if (!local[table]) local[table] = [];

        for (const serverItem of serverData) {
          const localIdx = local[table].findIndex(x => x.id === serverItem.id);
          if (localIdx === -1) {
            local[table].push({ ...serverItem, _synced: true });
            totalNew++;
          } else {
            const localItem = local[table][localIdx];
            // Last-write-wins por timestamp
            const localTs = localItem.updated || localItem.created || 0;
            const serverTs = serverItem.updated || serverItem.created || 0;
            if (serverTs > localTs && localItem._synced !== false) {
              local[table][localIdx] = { ...serverItem, _synced: true };
              totalUpdated++;
            }
          }
        }
      } catch (err) {
        console.warn('[volvix sync] pull falló para', table, err.message);
      }
    }

    saveLocal(local);
    meta.lastPull = Date.now();
    saveMeta(meta);
    emit('sync:pulled', { tables, totalNew, totalUpdated });
    return { success: true, totalNew, totalUpdated };
  }

  // =============== API PÚBLICA ===============
  const sync = {
    // Ejecutar operación offline-first
    execute,

    // Traer cambios del server
    pull,

    // Forzar sync ahora
    syncNow: processQueue,

    // Estado
    isOnline: () => online,
    isSyncing: () => syncing,
    pendingCount: () => loadQueue().length,
    lastSync: () => loadMeta().lastSync,

    // Datos locales
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

    // Limpiar (para debug)
    clear: () => {
      localStorage.removeItem(QUEUE_KEY);
      localStorage.removeItem(LOCAL_KEY);
      localStorage.removeItem(META_KEY);
    },

    // Stats
    stats: () => ({
      online,
      syncing,
      pending: loadQueue().length,
      lastSync: loadMeta().lastSync,
      retryDelay,
    }),
  };

  // =============== INICIALIZAR ===============
  if (typeof window !== 'undefined') {
    // Esperar a que volvix esté listo
    function init() {
      if (!window.volvix) {
        setTimeout(init, 50);
        return;
      }
      window.volvix.sync = sync;
      // Check inicial
      checkOnline().then(() => {
        setOnline(online);
        if (online) processQueue();
      });
      console.log('%c VOLVIX SYNC ', 'background:#FBBF24;color:#000;padding:2px 6px;border-radius:3px',
        'engine listo · pendientes:', loadQueue().length);
    }
    init();
  }
})();
