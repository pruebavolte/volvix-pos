/* ============================================================
   VOLVIX · Cliente API universal
   ============================================================
   Se carga con: <script src="volvix-api.js"></script>

   NO hardcodea rutas. Autodetecta:
   - Si está en file:// → modo offline (localStorage)
   - Si está en http(s):// → usa el mismo origen para API
   - Variable window.VOLVIX_API_URL sobreescribe

   Expone: window.volvix
     volvix.api.tenants.list() → GET /api/tenants
     volvix.api.features.request(text, tenantId) → POST /api/features/request
     volvix.ws.on('ai:decision', handler) → suscripción WebSocket
============================================================ */
(function () {
  'use strict';

  // =============== AUTO-DETECT URL ===============
  function getApiUrl() {
    // 1. Override manual
    if (typeof window.VOLVIX_API_URL === 'string') return window.VOLVIX_API_URL;

    // 2. Mismo origen si es http(s)
    if (location.protocol === 'http:' || location.protocol === 'https:') {
      return location.origin;
    }

    // 3. file:// → intenta localhost en puertos comunes
    return null;
  }

  function getWsUrl(apiUrl) {
    if (!apiUrl) return null;
    return apiUrl.replace(/^http/, 'ws');
  }

  let API_URL = getApiUrl();
  const OFFLINE = !API_URL;

  // =============== MODO OFFLINE (localStorage) ===============
  // Cuando abres los HTMLs con doble clic (file://), funciona igual
  // guardando datos en localStorage
  const OfflineStore = {
    key: 'volvix:offline-db',
    data: null,
    load() {
      try { this.data = JSON.parse(localStorage.getItem(this.key) || 'null'); } catch { this.data = null; }
      if (!this.data) this.data = this._seed();
    },
    save() { localStorage.setItem(this.key, JSON.stringify(this.data)); },
    _seed() {
      return {
        tenants: [
          { id: 'TNT001', name: 'Abarrotes Don Chucho', giro: 'abarrotes', plan: 'pro', status: 'active', mrr: 799 },
          { id: 'TNT002', name: 'Restaurante Los Compadres', giro: 'restaurante', plan: 'enterprise', status: 'active', mrr: 1499 },
        ],
        features: [
          { id: 'FEAT-0001', name: 'Cobrar ticket', module: 'pos', status: 'stable', usage: 1843 },
          { id: 'FEAT-0030', name: 'Corte de caja estándar', module: 'corte', status: 'stable', usage: 1843 },
          { id: 'FEAT-0050', name: 'Factura CFDI 4.0', module: 'facturacion', status: 'stable', usage: 892 },
        ],
        tickets: [],
        knowledge: [
          { id: 'KB-001', problem: 'Impresora térmica Epson no imprime', cases: 47, mostCommonFix: 'Cambio puerto USB', successRate: 0.89, avgTimeSec: 52 },
        ],
      };
    },
    get(table) { return this.data[table] || []; },
    find(table, id) { return this.get(table).find(x => x.id === id); },
    add(table, obj) { this.data[table].push(obj); this.save(); return obj; },
    update(table, id, patch) {
      const o = this.find(table, id);
      if (o) { Object.assign(o, patch); this.save(); }
      return o;
    },
  };
  if (OFFLINE) OfflineStore.load();

  // =============== AI DECIDE (offline) ===============
  function aiDecideOffline(clientRequest, tenantId) {
    const features = OfflineStore.get('features');
    const req = (clientRequest || '').toLowerCase();
    let best = null, score = 0;
    for (const f of features) {
      const words = f.name.toLowerCase().split(' ');
      let s = 0;
      for (const w of words) if (w.length > 3 && req.includes(w)) s += w.length;
      if (s > score) { score = s; best = f; }
    }
    let decision, created;
    if (score >= 20) {
      decision = 'activate'; created = best;
    } else if (score >= 8) {
      decision = 'extend';
      created = {
        id: 'FEAT-' + String(features.length + 240).padStart(4, '0'),
        name: best.name + ' · extensión',
        module: best.module,
        status: 'extended',
        parent: best.id,
        usage: 1,
        createdByAI: true,
        origRequest: clientRequest,
        created: Date.now(),
      };
      OfflineStore.add('features', created);
    } else {
      decision = 'create';
      created = {
        id: 'FEAT-' + String(features.length + 240).padStart(4, '0'),
        name: clientRequest.slice(0, 60),
        module: 'custom',
        status: 'new',
        usage: 1,
        createdByAI: true,
        origRequest: clientRequest,
        created: Date.now(),
      };
      OfflineStore.add('features', created);
    }
    return { decision, feature: created, score };
  }

  // =============== FETCH HELPER ===============
  async function http(method, endpoint, body) {
    if (OFFLINE) {
      console.log('[volvix offline]', method, endpoint, body);
      return null;
    }
    try {
      const res = await fetch(API_URL + endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.json();
    } catch (err) {
      console.warn('[volvix] API fallo, usando datos locales:', err.message);
      return null;
    }
  }

  // =============== WEBSOCKET ===============
  const wsListeners = new Map();
  let ws = null, wsReconnectTimer = null;

  function wsConnect() {
    if (OFFLINE) return;
    // B17: Vercel serverless NO soporta WebSocket — abortar silenciosamente
    try {
      if (typeof location !== 'undefined' && /\.vercel\.app$/i.test(location.hostname)) {
        console.log('[volvix] WS skip on Vercel (serverless)');
        return;
      }
    } catch (_) {}
    const wsUrl = getWsUrl(API_URL);
    if (!wsUrl) return;

    try {
      ws = new WebSocket(wsUrl);
      ws.onopen = () => {
        console.log('[volvix] WebSocket conectado');
        if (wsReconnectTimer) { clearTimeout(wsReconnectTimer); wsReconnectTimer = null; }
      };
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          const handlers = wsListeners.get(msg.type) || [];
          handlers.forEach(h => { try { h(msg); } catch (err) { console.error(err); } });
          const wildcardHandlers = wsListeners.get('*') || [];
          wildcardHandlers.forEach(h => { try { h(msg); } catch (err) { console.error(err); } });
        } catch {}
      };
      ws.onclose = () => {
        console.log('[volvix] WebSocket desconectado, reintentando en 3s...');
        wsReconnectTimer = setTimeout(wsConnect, 3000);
      };
      ws.onerror = () => {};
    } catch (err) {
      console.warn('[volvix] WebSocket no disponible');
    }
  }

  function wsOn(event, handler) {
    if (!wsListeners.has(event)) wsListeners.set(event, []);
    wsListeners.get(event).push(handler);
  }

  function wsSend(msg) {
    if (!ws || ws.readyState !== 1) return false;
    ws.send(JSON.stringify(msg));
    return true;
  }

  // =============== API PÚBLICA ===============
  window.volvix = {
    config: {
      apiUrl: API_URL,
      offline: OFFLINE,
      version: '7.0.0',
    },

    // API REST
    api: {
      health: () => http('GET', '/api/health'),
      stats: () => http('GET', '/api/stats'),
      config: () => http('GET', '/api/config'),

      tenants: {
        list: async () => {
          // Pull del server si online, fallback local
          const server = await http('GET', '/api/tenants');
          if (server && window.volvix?.sync) {
            window.volvix.sync.setLocal('tenants', server);
            return server;
          }
          return window.volvix?.sync?.getLocal('tenants') || OfflineStore.get('tenants');
        },
        get: (id) => http('GET', '/api/tenants/' + id) || OfflineStore.find('tenants', id),
        create: async (data) => {
          // Offline-first: usa sync engine si disponible
          if (window.volvix?.sync) {
            const full = { ...data, id: 'TNT-' + Date.now(), created: Date.now() };
            await window.volvix.sync.execute({
              type: 'create', table: 'tenants', data: full,
              endpoint: '/api/tenants', body: full,
            });
            return full;
          }
          return http('POST', '/api/tenants', data) || OfflineStore.add('tenants', { ...data, id: 'TNT' + Date.now() });
        },
        update: async (id, data) => {
          if (window.volvix?.sync) {
            await window.volvix.sync.execute({
              type: 'update', table: 'tenants', id,
              endpoint: '/api/tenants/' + id, body: data, data,
            });
            return { id, ...data };
          }
          return http('PATCH', '/api/tenants/' + id, data) || OfflineStore.update('tenants', id, data);
        },
      },

      features: {
        list: (filters) => {
          const q = filters ? '?' + new URLSearchParams(filters) : '';
          return http('GET', '/api/features' + q) || OfflineStore.get('features');
        },
        request: async (clientRequest, tenantId) => {
          if (OFFLINE) return aiDecideOffline(clientRequest, tenantId);
          return http('POST', '/api/features/request', { clientRequest, tenantId })
            || aiDecideOffline(clientRequest, tenantId);
        },
      },

      tickets: {
        list: () => http('GET', '/api/tickets') || OfflineStore.get('tickets'),
        create: async (data) => http('POST', '/api/tickets', data) || OfflineStore.add('tickets', { ...data, id: 'TKT-' + Date.now() }),
        resolve: (id, data) => http('POST', '/api/tickets/' + id + '/resolve', data),
      },

      knowledge: {
        list: () => http('GET', '/api/knowledge') || OfflineStore.get('knowledge'),
        search: (q) => http('GET', '/api/knowledge/search?q=' + encodeURIComponent(q)),
      },

      remote: {
        start: (tenantId) => http('POST', '/api/remote/start', { tenantId }),
        connect: (code) => http('POST', '/api/remote/connect', { code }),
      },

      ai: {
        chat: (message, system) => http('POST', '/api/ai/chat', { message, system }),
        chatMessages: (messages, system) => http('POST', '/api/ai/chat', { messages, system }),
      },
    },

    // WebSocket
    ws: {
      on: wsOn,
      send: wsSend,
      isConnected: () => ws && ws.readyState === 1,
    },

    // Helpers
    ready: (cb) => {
      if (document.readyState === 'complete') cb();
      else window.addEventListener('load', cb);
    },

    // Utilities
    toast: (msg, type = 'info') => {
      const existing = document.querySelector('.volvix-toast');
      if (existing) existing.remove();
      const t = document.createElement('div');
      t.className = 'volvix-toast';
      t.style.cssText = 'position:fixed;bottom:30px;left:50%;transform:translateX(-50%);background:#1C1917;color:#fff;padding:10px 18px;border-radius:100px;font:500 13px system-ui;z-index:10000;box-shadow:0 10px 30px rgba(0,0,0,0.3);opacity:0;transition:opacity 0.2s;';
      t.textContent = msg;
      document.body.appendChild(t);
      requestAnimationFrame(() => t.style.opacity = '1');
      setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 2500);
    },
  };

  // Arrancar WebSocket
  wsConnect();

  // Log de inicio
  console.log('%c VOLVIX ', 'background:#FBBF24;color:#000;font-weight:700;padding:3px 8px;border-radius:4px;',
    OFFLINE ? 'modo offline (localStorage)' : 'conectado a ' + API_URL);
})();
