/**
 * volvix-realtime-wiring.js
 * Volvix POS — Sistema de WebSocket / Realtime usando Supabase Realtime
 * Agent-27 / Ronda 8 Fibonacci
 *
 * Provee:
 *  - Conexión WebSocket a Supabase Realtime
 *  - Suscripción a cambios en pos_sales (nuevas ventas en vivo)
 *  - Suscripción a pos_products (cambios de stock)
 *  - Sistema pub/sub local
 *  - Reconexión automática con backoff exponencial
 *  - Indicador visual de conexión WS
 *  - API global: window.RealtimeAPI con on/off/emit/connect
 */

(function (global) {
  'use strict';

  // ───────────────────────────────────────────────────────────────────────
  // CONFIGURACIÓN
  // ───────────────────────────────────────────────────────────────────────
  // Configuración cargada desde window.* o env. Nunca hardcodear keys aquí.
  const SUPABASE_URL =
    (typeof window !== 'undefined' && window.SUPABASE_URL) || '';
  const SUPABASE_ANON_KEY =
    (typeof window !== 'undefined' && (window.SUPABASE_ANON_KEY || window.VOLVIX_ANON_KEY)) || null;

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.warn('[Realtime] SUPABASE_URL/ANON_KEY missing — realtime wiring disabled');
    if (typeof window !== 'undefined') window.RealtimeAPI = { disabled: true, connect: () => {}, disconnect: () => {} };
    return;
  }

  const WS_HOST = SUPABASE_URL.replace(/^https?:\/\//, '');
  const WS_URL =
    'wss://' +
    WS_HOST +
    '/realtime/v1/websocket?apikey=' +
    SUPABASE_ANON_KEY +
    '&vsn=1.0.0';

  const RECONNECT_BASE_MS = 1000;
  const RECONNECT_MAX_MS = 30000;
  const RECONNECT_MAX_ATTEMPTS = 5; // R26 Bug 2: dar up tras 5 intentos
  const HEARTBEAT_INTERVAL_MS = 25000;
  const CONNECT_TIMEOUT_MS = 12000;

  const TABLES = {
    SALES: 'pos_sales',
    PRODUCTS: 'pos_products',
  };

  const SCHEMA = 'public';

  // ───────────────────────────────────────────────────────────────────────
  // ESTADO INTERNO
  // ───────────────────────────────────────────────────────────────────────
  const state = {
    ws: null,
    status: 'disconnected', // 'disconnected' | 'connecting' | 'connected' | 'error'
    refCounter: 1,
    heartbeatRef: null,
    heartbeatTimer: null,
    reconnectAttempts: 0,
    reconnectTimer: null,
    pendingJoins: [],
    joinedTopics: new Set(),
    listeners: Object.create(null), // event -> Set<fn>
    indicatorEl: null,
    manuallyClosed: false,
    lastError: null,
    stats: {
      messagesReceived: 0,
      messagesSent: 0,
      reconnects: 0,
      eventsEmitted: 0,
      connectedAt: null,
    },
  };

  // ───────────────────────────────────────────────────────────────────────
  // LOG
  // ───────────────────────────────────────────────────────────────────────
  function log() {
    const args = Array.prototype.slice.call(arguments);
    args.unshift('[RealtimeAPI]');
    try {
      console.log.apply(console, args);
    } catch (_) {}
  }
  function warn() {
    const args = Array.prototype.slice.call(arguments);
    args.unshift('[RealtimeAPI]');
    try {
      console.warn.apply(console, args);
    } catch (_) {}
  }
  function err() {
    const args = Array.prototype.slice.call(arguments);
    args.unshift('[RealtimeAPI]');
    try {
      console.error.apply(console, args);
    } catch (_) {}
  }

  // ───────────────────────────────────────────────────────────────────────
  // PUB/SUB LOCAL
  // ───────────────────────────────────────────────────────────────────────
  function on(event, fn) {
    if (typeof event !== 'string' || typeof fn !== 'function') return false;
    if (!state.listeners[event]) state.listeners[event] = new Set();
    state.listeners[event].add(fn);
    return true;
  }

  function off(event, fn) {
    if (!state.listeners[event]) return false;
    if (!fn) {
      delete state.listeners[event];
      return true;
    }
    state.listeners[event].delete(fn);
    if (state.listeners[event].size === 0) delete state.listeners[event];
    return true;
  }

  function emit(event, payload) {
    state.stats.eventsEmitted++;
    const set = state.listeners[event];
    if (!set || set.size === 0) return 0;
    let count = 0;
    set.forEach(function (fn) {
      try {
        fn(payload, event);
        count++;
      } catch (e) {
        err('listener error for', event, e);
      }
    });
    // wildcard
    const star = state.listeners['*'];
    if (star) {
      star.forEach(function (fn) {
        try {
          fn({ event: event, payload: payload });
        } catch (e) {
          err('wildcard listener error:', e);
        }
      });
    }
    return count;
  }

  // ───────────────────────────────────────────────────────────────────────
  // INDICADOR VISUAL DE CONEXIÓN
  // ───────────────────────────────────────────────────────────────────────
  function ensureIndicator() {
    if (typeof document === 'undefined') return null;
    if (state.indicatorEl && document.body.contains(state.indicatorEl)) {
      return state.indicatorEl;
    }
    const el = document.createElement('div');
    el.id = 'volvix-realtime-indicator';
    el.style.cssText = [
      'position:fixed',
      'bottom:10px',
      'right:10px',
      'z-index:99999',
      'padding:6px 10px',
      'border-radius:14px',
      'font-family:system-ui,-apple-system,sans-serif',
      'font-size:11px',
      'font-weight:600',
      'color:#fff',
      'background:#888',
      'box-shadow:0 2px 6px rgba(0,0,0,.25)',
      'cursor:pointer',
      'user-select:none',
      'transition:background .25s ease',
    ].join(';');
    el.textContent = 'WS: ?';
    el.title = 'Click para reconectar';
    el.addEventListener('click', function () {
      log('manual reconnect triggered via indicator');
      reconnectNow();
    });
    if (document.body) {
      document.body.appendChild(el);
    } else {
      document.addEventListener('DOMContentLoaded', function () {
        document.body.appendChild(el);
      });
    }
    state.indicatorEl = el;
    return el;
  }

  function paintIndicator() {
    const el = ensureIndicator();
    if (!el) return;
    const map = {
      connected: { bg: '#16a34a', txt: 'WS: live' },
      connecting: { bg: '#eab308', txt: 'WS: ...' },
      disconnected: { bg: '#6b7280', txt: 'WS: off' },
      error: { bg: '#dc2626', txt: 'WS: err' },
    };
    const m = map[state.status] || map.disconnected;
    el.style.background = m.bg;
    el.textContent = m.txt;
  }

  function setStatus(s) {
    if (state.status === s) return;
    state.status = s;
    paintIndicator();
    emit('status', { status: s, at: Date.now() });
  }

  // ───────────────────────────────────────────────────────────────────────
  // PROTOCOLO REALTIME (Phoenix v1)
  // ───────────────────────────────────────────────────────────────────────
  function nextRef() {
    return String(state.refCounter++);
  }

  function send(msg) {
    if (!state.ws || state.ws.readyState !== 1) {
      state.pendingJoins.push(msg);
      return false;
    }
    try {
      state.ws.send(JSON.stringify(msg));
      state.stats.messagesSent++;
      return true;
    } catch (e) {
      err('send failed:', e);
      return false;
    }
  }

  function joinTopic(table) {
    const topic = 'realtime:' + SCHEMA + ':' + table;
    if (state.joinedTopics.has(topic)) return;
    const ref = nextRef();
    const msg = {
      topic: topic,
      event: 'phx_join',
      ref: ref,
      payload: {
        config: {
          postgres_changes: [
            { event: '*', schema: SCHEMA, table: table },
          ],
        },
      },
    };
    log('joining topic', topic);
    if (send(msg)) {
      state.joinedTopics.add(topic);
    } else {
      // queued; mark as pending join
      state.joinedTopics.add(topic);
    }
  }

  function joinAllTopics() {
    joinTopic(TABLES.SALES);
    joinTopic(TABLES.PRODUCTS);
  }

  function flushPending() {
    if (!state.pendingJoins.length) return;
    const queue = state.pendingJoins.slice();
    state.pendingJoins.length = 0;
    queue.forEach(function (m) {
      send(m);
    });
  }

  // ───────────────────────────────────────────────────────────────────────
  // HEARTBEAT
  // ───────────────────────────────────────────────────────────────────────
  function startHeartbeat() {
    stopHeartbeat();
    state.heartbeatTimer = setInterval(function () {
      if (!state.ws || state.ws.readyState !== 1) return;
      send({
        topic: 'phoenix',
        event: 'heartbeat',
        ref: nextRef(),
        payload: {},
      });
    }, HEARTBEAT_INTERVAL_MS);
  }

  function stopHeartbeat() {
    if (state.heartbeatTimer) {
      clearInterval(state.heartbeatTimer);
      state.heartbeatTimer = null;
    }
  }

  // ───────────────────────────────────────────────────────────────────────
  // PROCESAMIENTO DE MENSAJES
  // ───────────────────────────────────────────────────────────────────────
  function handleMessage(raw) {
    state.stats.messagesReceived++;
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch (e) {
      err('bad JSON from server:', raw);
      return;
    }

    const ev = msg.event;
    const topic = msg.topic || '';
    const payload = msg.payload || {};

    if (ev === 'phx_reply') {
      // join confirmations / heartbeat replies
      if (payload.status === 'error') {
        warn('phx_reply error on', topic, payload);
        emit('join-error', { topic: topic, payload: payload });
      }
      return;
    }
    if (ev === 'phx_error') {
      warn('phx_error on', topic, payload);
      emit('channel-error', { topic: topic, payload: payload });
      return;
    }
    if (ev === 'phx_close') {
      state.joinedTopics.delete(topic);
      return;
    }

    if (ev === 'postgres_changes') {
      handlePostgresChange(topic, payload);
      return;
    }

    // catch-all
    emit('raw', msg);
  }

  function handlePostgresChange(topic, payload) {
    const data = payload && payload.data ? payload.data : payload;
    if (!data) return;
    const table = data.table || (topic.split(':').pop() || '');
    const type = (data.type || data.eventType || '').toUpperCase(); // INSERT/UPDATE/DELETE
    const record = data.record || data.new || null;
    const oldRecord = data.old_record || data.old || null;

    const evtPayload = {
      table: table,
      type: type,
      record: record,
      old: oldRecord,
      ts: Date.now(),
    };

    // Eventos genéricos
    emit('change', evtPayload);
    emit('change:' + table, evtPayload);

    // Eventos específicos por tabla
    if (table === TABLES.SALES) {
      if (type === 'INSERT') emit('sale:new', record);
      else if (type === 'UPDATE') emit('sale:update', { record: record, old: oldRecord });
      else if (type === 'DELETE') emit('sale:delete', oldRecord);
      emit('sales:any', evtPayload);
    } else if (table === TABLES.PRODUCTS) {
      if (type === 'UPDATE' && record && oldRecord) {
        const oldStock = oldRecord.stock;
        const newStock = record.stock;
        if (oldStock !== newStock) {
          emit('product:stock', {
            id: record.id,
            sku: record.sku,
            name: record.name,
            oldStock: oldStock,
            newStock: newStock,
            delta: (newStock || 0) - (oldStock || 0),
          });
        }
      }
      if (type === 'INSERT') emit('product:new', record);
      else if (type === 'DELETE') emit('product:delete', oldRecord);
      emit('products:any', evtPayload);
    }
  }

  // ───────────────────────────────────────────────────────────────────────
  // CONEXIÓN
  // ───────────────────────────────────────────────────────────────────────
  function connect() {
    if (state.ws && (state.ws.readyState === 0 || state.ws.readyState === 1)) {
      log('connect() ignored — already', state.status);
      return;
    }
    state.manuallyClosed = false;
    setStatus('connecting');

    let connectTimeout = setTimeout(function () {
      if (state.status === 'connecting') {
        warn('connect timeout');
        try {
          state.ws && state.ws.close();
        } catch (_) {}
        state.lastError = 'timeout';
        setStatus('error');
        scheduleReconnect();
      }
    }, CONNECT_TIMEOUT_MS);

    let ws;
    try {
      ws = new WebSocket(WS_URL);
    } catch (e) {
      clearTimeout(connectTimeout);
      err('WebSocket ctor failed:', e);
      state.lastError = String(e);
      setStatus('error');
      scheduleReconnect();
      return;
    }
    state.ws = ws;

    ws.onopen = function () {
      clearTimeout(connectTimeout);
      log('WS open');
      state.reconnectAttempts = 0;
      state.stats.connectedAt = Date.now();
      setStatus('connected');
      startHeartbeat();
      joinAllTopics();
      flushPending();
      emit('connected', { at: state.stats.connectedAt });
    };

    ws.onmessage = function (ev) {
      handleMessage(ev.data);
    };

    ws.onerror = function (e) {
      err('WS error', e && e.message ? e.message : e);
      state.lastError = 'ws-error';
      emit('error', { error: 'ws-error' });
    };

    ws.onclose = function (ev) {
      clearTimeout(connectTimeout);
      stopHeartbeat();
      state.joinedTopics.clear();
      log('WS close code=', ev.code, 'reason=', ev.reason);
      emit('disconnected', { code: ev.code, reason: ev.reason });
      if (state.manuallyClosed) {
        setStatus('disconnected');
        return;
      }
      setStatus('disconnected');
      scheduleReconnect();
    };
  }

  function disconnect() {
    state.manuallyClosed = true;
    if (state.reconnectTimer) {
      clearTimeout(state.reconnectTimer);
      state.reconnectTimer = null;
    }
    stopHeartbeat();
    if (state.ws) {
      try {
        state.ws.close(1000, 'manual');
      } catch (_) {}
    }
    setStatus('disconnected');
  }

  function reconnectNow() {
    if (state.reconnectTimer) {
      clearTimeout(state.reconnectTimer);
      state.reconnectTimer = null;
    }
    if (state.ws) {
      try {
        state.ws.close();
      } catch (_) {}
    }
    state.reconnectAttempts = 0;
    connect();
  }

  function scheduleReconnect() {
    if (state.manuallyClosed) return;
    if (state.reconnectTimer) return;
    // R26 Bug 2: dar up tras N intentos para evitar loop infinito cada 3s
    if (state.reconnectAttempts >= RECONNECT_MAX_ATTEMPTS) {
      warn('reconnect attempts exhausted (' + RECONNECT_MAX_ATTEMPTS + ') — giving up. Click WS indicator para reintentar manual.');
      setStatus('error');
      return;
    }
    state.reconnectAttempts++;
    state.stats.reconnects++;
    const delay = Math.min(
      RECONNECT_MAX_MS,
      RECONNECT_BASE_MS * Math.pow(2, state.reconnectAttempts - 1)
    );
    const jitter = Math.floor(Math.random() * 400);
    const finalDelay = delay + jitter;
    log(
      'reconnect attempt',
      state.reconnectAttempts,
      'in',
      finalDelay,
      'ms'
    );
    state.reconnectTimer = setTimeout(function () {
      state.reconnectTimer = null;
      connect();
    }, finalDelay);
  }

  // ───────────────────────────────────────────────────────────────────────
  // RECONEXIÓN POR EVENTOS DEL NAVEGADOR
  // ───────────────────────────────────────────────────────────────────────
  if (typeof window !== 'undefined') {
    window.addEventListener('online', function () {
      log('navigator online → reconnect');
      reconnectNow();
    });
    window.addEventListener('offline', function () {
      log('navigator offline');
      setStatus('disconnected');
    });
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', function () {
        if (
          document.visibilityState === 'visible' &&
          state.status !== 'connected'
        ) {
          log('tab visible → reconnect');
          reconnectNow();
        }
      });
    }
  }

  // ───────────────────────────────────────────────────────────────────────
  // API PÚBLICA
  // ───────────────────────────────────────────────────────────────────────
  const RealtimeAPI = {
    on: on,
    off: off,
    emit: emit,
    connect: connect,
    disconnect: disconnect,
    reconnect: reconnectNow,
    status: function () {
      return state.status;
    },
    stats: function () {
      return Object.assign({}, state.stats, {
        status: state.status,
        joinedTopics: Array.from(state.joinedTopics),
        listeners: Object.keys(state.listeners),
        reconnectAttempts: state.reconnectAttempts,
        lastError: state.lastError,
      });
    },
    subscribeTable: function (table) {
      if (!table) return false;
      joinTopic(table);
      return true;
    },
    config: {
      url: SUPABASE_URL,
      tables: TABLES,
      schema: SCHEMA,
    },
    _state: state, // debug
  };

  global.RealtimeAPI = RealtimeAPI;

  // Auto-connect cuando el DOM esté listo
  if (typeof document !== 'undefined') {
    if (
      document.readyState === 'complete' ||
      document.readyState === 'interactive'
    ) {
      setTimeout(connect, 0);
    } else {
      document.addEventListener('DOMContentLoaded', function () {
        connect();
      });
    }
  } else {
    // Entorno no-DOM (node-like): conectar inmediato si hay WebSocket global
    if (typeof WebSocket !== 'undefined') connect();
  }

  log('module loaded — window.RealtimeAPI ready');
})(typeof window !== 'undefined' ? window : globalThis);
