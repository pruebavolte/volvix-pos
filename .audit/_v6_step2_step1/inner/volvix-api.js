/* ============================================================
   VOLVIX · Cliente API universal
   ============================================================
   Se carga con: <script src="/volvix-api.js"></script>

   Responsabilidades:
   - Autodetectar URL del backend (mismo origen, file://, override)
   - Exponer window.volvix.api con metodos por recurso
   - Fallback a localStorage cuando no hay servidor (modo offline)
   - Integrar con auth (manda Authorization header si hay sesion)
   - Manejar errores de red sin romper la UI

   Expone:
     window.volvix.config             → { apiUrl, offline, version }
     window.volvix.api.health()
     window.volvix.api.tenants.*
     window.volvix.api.features.*
     window.volvix.api.tickets.*
     window.volvix.api.knowledge.*
     window.volvix.api.remote.*
     window.volvix.api.ai.*
     window.volvix.api.ventas.*
     window.volvix.api.productos.*
     window.volvix.api.clientes.*

   NO incluye sync engine (eso es volvix-sync.js)
============================================================ */
(function () {
  'use strict';

  // =========================================================
  // AUTODETECCIÓN DE URL
  // =========================================================
  function detectApiUrl() {
    // 1. Override manual (config.js o window asignado)
    if (typeof window.VOLVIX_API_URL === 'string' && window.VOLVIX_API_URL.length > 0) {
      return window.VOLVIX_API_URL.replace(/\/$/, '');
    }
    // 2. Mismo origen si es http/https
    if (location.protocol === 'http:' || location.protocol === 'https:') {
      return location.origin;
    }
    // 3. file:// → no hay servidor, modo offline puro
    return null;
  }

  const API_URL = detectApiUrl();
  const OFFLINE_MODE = !API_URL;
  const FLAGS = window.VOLVIX_FLAGS || {};
  const DEBUG = FLAGS.debugMode === true;

  // =========================================================
  // SESIÓN / AUTH
  // =========================================================
  function getSession() {
    try {
      const raw = localStorage.getItem('volvix:session');
      if (!raw) return null;
      const s = JSON.parse(raw);
      if (s.expires_at && s.expires_at < Date.now()) {
        localStorage.removeItem('volvix:session');
        return null;
      }
      return s;
    } catch {
      return null;
    }
  }

  function getAuthHeaders() {
    const s = getSession();
    if (!s || !s.access_token) return {};
    return { 'Authorization': 'Bearer ' + s.access_token };
  }

  function getTenantId() {
    const s = getSession();
    return s?.tenant_id || window.VOLVIX_DEFAULT_TENANT || null;
  }

  // =========================================================
  // STORAGE OFFLINE (fallback cuando no hay servidor)
  // =========================================================
  const OfflineStore = {
    KEY: 'volvix:offline-data',
    cache: null,

    load() {
      if (this.cache) return this.cache;
      try {
        this.cache = JSON.parse(localStorage.getItem(this.KEY) || 'null');
      } catch {
        this.cache = null;
      }
      if (!this.cache) {
        this.cache = this._seed();
        this.save();
      }
      return this.cache;
    },

    save() {
      try {
        localStorage.setItem(this.KEY, JSON.stringify(this.cache));
      } catch (e) {
        console.warn('[volvix] localStorage lleno:', e.message);
      }
    },

    _seed() {
      return {
        tenants: [
          { id: 'TNT001', name: 'Abarrotes Don Chucho', giro: 'abarrotes', plan: 'pro', status: 'active', mrr: 799 },
        ],
        productos: [
          { id: 'd1', codigo: '7501055303045', nombre: 'Coca-Cola 600ml', precio: 25, stock: 124, categoria: 'Bebidas' },
          { id: 'd2', codigo: '7501030411025', nombre: 'Pan dulce', precio: 8.5, stock: 48, categoria: 'Panadería' },
          { id: 'd3', codigo: '7501058634511', nombre: 'Queso fresco 250g', precio: 120, stock: 12, categoria: 'Lácteos' },
          { id: 'd4', codigo: '7501055305018', nombre: 'Agua 1.5L', precio: 12, stock: 200, categoria: 'Bebidas' },
          { id: 'd5', codigo: '7501031301013', nombre: 'Leche Lala 1L', precio: 32, stock: 55, categoria: 'Lácteos' },
          { id: 'd6', codigo: '7501003130052', nombre: 'Arroz 1kg', precio: 28, stock: 80, categoria: 'Básicos' },
          { id: 'd7', codigo: '7501003130069', nombre: 'Frijol negro 1kg', precio: 35, stock: 60, categoria: 'Básicos' },
          { id: 'd8', codigo: '7501007861054', nombre: 'Sabritas Original', precio: 18, stock: 90, categoria: 'Snacks' },
        ],
        ventas: [],
        clientes: [],
        features: [],
        tickets: [],
        knowledge: [],
      };
    },

    list(table) {
      this.load();
      return this.cache[table] || [];
    },

    find(table, id) {
      return this.list(table).find(x => x.id === id);
    },

    insert(table, obj) {
      this.load();
      if (!this.cache[table]) this.cache[table] = [];
      const item = { ...obj, id: obj.id || this._genId(table), _localOnly: true, _ts: Date.now() };
      this.cache[table].push(item);
      this.save();
      return item;
    },

    update(table, id, patch) {
      this.load();
      const item = this.find(table, id);
      if (item) {
        Object.assign(item, patch, { _ts: Date.now() });
        this.save();
      }
      return item;
    },

    remove(table, id) {
      this.load();
      this.cache[table] = (this.cache[table] || []).filter(x => x.id !== id);
      this.save();
    },

    _genId(table) {
      const prefix = {
        ventas: 'V', tenants: 'TNT', productos: 'P', clientes: 'C',
        features: 'FEAT', tickets: 'TKT',
      }[table] || 'X';
      return prefix + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
    },

    clear() {
      localStorage.removeItem(this.KEY);
      this.cache = null;
    },
  };

  // =========================================================
  // FETCH HELPER (con auth, timeout, error handling)
  // =========================================================
  async function http(method, endpoint, body, opts = {}) {
    if (OFFLINE_MODE) {
      if (DEBUG) console.log('[volvix offline]', method, endpoint, body);
      return null;
    }

    const ctrl = new AbortController();
    const timeoutMs = opts.timeout || 10000;
    const timeoutId = setTimeout(() => ctrl.abort(), timeoutMs);

    try {
      const headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...getAuthHeaders(),
        ...(opts.headers || {}),
      };
      const tenantId = getTenantId();
      if (tenantId) headers['X-Tenant-Id'] = tenantId;

      const res = await fetch(API_URL + endpoint, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: ctrl.signal,
        cache: 'no-store',
      });

      clearTimeout(timeoutId);

      // 401 = sesión expirada → forzar re-login
      if (res.status === 401) {
        localStorage.removeItem('volvix:session');
        var __isPubA = (typeof window.__vlxIsPublicPage === 'function') && window.__vlxIsPublicPage();
        if (typeof window.VOLVIX_ON_AUTH_FAIL === 'function') {
          window.VOLVIX_ON_AUTH_FAIL();
        } else if (!__isPubA && location.pathname !== '/login.html') {
          location.replace('/login.html?expired=1');
        }
        throw new Error('Sesión expirada');
      }

      // 4xx / 5xx
      if (!res.ok) {
        let errMsg = 'HTTP ' + res.status;
        try {
          const errBody = await res.json();
          errMsg = errBody.error || errBody.message || errMsg;
        } catch {}
        throw new Error(errMsg);
      }

      // 204 No Content
      if (res.status === 204) return null;

      return await res.json();
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        throw new Error('Timeout: el servidor no respondió en ' + timeoutMs + 'ms');
      }
      // Error de red → caller decide si usar fallback offline
      if (DEBUG) console.warn('[volvix] http error:', method, endpoint, err.message);
      throw err;
    }
  }

  // Wrapper que usa offline fallback en caso de error de red
  async function httpOrOffline(method, endpoint, body, table, fallbackFn) {
    try {
      return await http(method, endpoint, body);
    } catch (err) {
      if (DEBUG) console.warn('[volvix] usando offline fallback:', err.message);
      if (typeof fallbackFn === 'function') return fallbackFn();
      return null;
    }
  }

  // =========================================================
  // API PÚBLICA POR RECURSO
  // =========================================================
  const api = {
    // ---------- Core ----------
    health:  () => http('GET', '/api/health').catch(() => null),
    config:  () => http('GET', '/api/config').catch(() => null),
    stats:   () => http('GET', '/api/stats').catch(() => null),

    // ---------- Tenants ----------
    tenants: {
      list:   () => httpOrOffline('GET', '/api/tenants', null, 'tenants',
                                  () => OfflineStore.list('tenants')),
      get:    (id) => httpOrOffline('GET', '/api/tenants/' + encodeURIComponent(id), null, null,
                                    () => OfflineStore.find('tenants', id)),
      create: (data) => http('POST', '/api/tenants', data),
      update: (id, data) => http('PATCH', '/api/tenants/' + encodeURIComponent(id), data),
      delete: (id) => http('DELETE', '/api/tenants/' + encodeURIComponent(id)),
    },

    // ---------- Features (motor auto-evolución) ----------
    features: {
      list:    (filters) => {
        const q = filters ? '?' + new URLSearchParams(filters).toString() : '';
        return httpOrOffline('GET', '/api/features' + q, null, 'features',
                             () => OfflineStore.list('features'));
      },
      get:     (id) => http('GET', '/api/features/' + encodeURIComponent(id)),
      // EL CORAZON: cliente pide algo, IA decide
      request: (clientRequest, tenantId) => http('POST', '/api/features/request', {
        clientRequest,
        tenantId: tenantId || getTenantId(),
      }),
    },

    // ---------- Tickets (soporte) ----------
    tickets: {
      list:    () => httpOrOffline('GET', '/api/tickets', null, 'tickets',
                                   () => OfflineStore.list('tickets')),
      get:     (id) => http('GET', '/api/tickets/' + encodeURIComponent(id)),
      create:  (data) => http('POST', '/api/tickets', { ...data, tenantId: data.tenantId || getTenantId() }),
      resolve: (id, data) => http('POST', '/api/tickets/' + encodeURIComponent(id) + '/resolve', data),
    },

    // ---------- Knowledge base ----------
    knowledge: {
      list:    () => httpOrOffline('GET', '/api/knowledge', null, 'knowledge',
                                   () => OfflineStore.list('knowledge')),
      search:  (q) => http('GET', '/api/knowledge/search?q=' + encodeURIComponent(q)),
    },

    // ---------- Control remoto ----------
    remote: {
      start:   (tenantId) => http('POST', '/api/remote/start', { tenantId: tenantId || getTenantId() }),
      connect: (code) => http('POST', '/api/remote/connect', { code }),
    },

    // ---------- IA chat ----------
    ai: {
      chat: (message, system) => http('POST', '/api/ai/chat', { message, system }),
      chatMessages: (messages, system) => http('POST', '/api/ai/chat', { messages, system }),
    },

    // ---------- Ventas (POS) ----------
    ventas: {
      list:   (filters) => {
        const q = filters ? '?' + new URLSearchParams(filters).toString() : '';
        return httpOrOffline('GET', '/api/ventas' + q, null, 'ventas',
                             () => OfflineStore.list('ventas'));
      },
      get:    (id) => http('GET', '/api/ventas/' + encodeURIComponent(id)),
      create: (venta) => http('POST', '/api/ventas', {
        ...venta,
        tenant_id: venta.tenant_id || getTenantId(),
      }),
    },

    // ---------- Productos ----------
    productos: {
      list:   () => httpOrOffline('GET', '/api/productos', null, 'productos',
                                  () => OfflineStore.list('productos')),
      get:    (id) => http('GET', '/api/productos/' + encodeURIComponent(id)),
      create: (data) => http('POST', '/api/productos', data),
      update: (id, data) => http('PATCH', '/api/productos/' + encodeURIComponent(id), data),
      delete: (id) => http('DELETE', '/api/productos/' + encodeURIComponent(id)),
      search: (q) => http('GET', '/api/productos/search?q=' + encodeURIComponent(q)),
    },

    // ---------- Clientes ----------
    clientes: {
      list:   () => httpOrOffline('GET', '/api/clientes', null, 'clientes',
                                  () => OfflineStore.list('clientes')),
      get:    (id) => http('GET', '/api/clientes/' + encodeURIComponent(id)),
      create: (data) => http('POST', '/api/clientes', data),
      update: (id, data) => http('PATCH', '/api/clientes/' + encodeURIComponent(id), data),
    },

    // ---------- Helpers de bajo nivel (escape hatch) ----------
    raw: http,
    rawOffline: httpOrOffline,
  };

  // =========================================================
  // UTILIDADES GLOBALES
  // =========================================================
  const utils = {
    // Toast notification (UI feedback)
    toast(msg, type = 'info', durationMs = 2800) {
      let el = document.getElementById('volvix-global-toast');
      if (!el) {
        el = document.createElement('div');
        el.id = 'volvix-global-toast';
        el.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%) translateY(20px);' +
          'background:#1C1917;color:#fff;border-radius:8px;padding:10px 20px;' +
          'font:600 13px/1.4 Inter,system-ui,sans-serif;z-index:9999;' +
          'opacity:0;transition:all 0.25s;pointer-events:none;white-space:nowrap;' +
          'box-shadow:0 10px 30px rgba(0,0,0,0.3);max-width:90vw;text-overflow:ellipsis;overflow:hidden';
        document.body.appendChild(el);
      }
      const colors = {
        info:    '#3B82F6',
        ok:      '#16A34A',
        success: '#16A34A',
        warn:    '#F97316',
        err:     '#DC2626',
        error:   '#DC2626',
      };
      el.style.background = colors[type] || '#1C1917';
      el.textContent = msg;
      requestAnimationFrame(() => {
        el.style.opacity = '1';
        el.style.transform = 'translateX(-50%) translateY(0)';
      });
      clearTimeout(el._t);
      el._t = setTimeout(() => {
        el.style.opacity = '0';
        el.style.transform = 'translateX(-50%) translateY(20px)';
      }, durationMs);
    },

    // Escape HTML (anti-XSS) – uso obligatorio en template strings con datos del backend
    esc(s) {
      if (s == null) return '';
      return String(s).replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
      })[c]);
    },

    // Formato moneda MXN (o lo que diga config)
    money(n, currency) {
      const code = currency || (window.VOLVIX_REGION?.currency) || 'MXN';
      const num = Number(n);
      if (isNaN(num)) return '$0.00';
      try {
        return new Intl.NumberFormat(window.VOLVIX_REGION?.locale || 'es-MX', {
          style: 'currency',
          currency: code,
          minimumFractionDigits: 2,
        }).format(num);
      } catch {
        return '$' + num.toFixed(2);
      }
    },

    // Formato número simple
    num(n, decimals = 0) {
      const num = Number(n);
      if (isNaN(num)) return '0';
      return num.toLocaleString(window.VOLVIX_REGION?.locale || 'es-MX', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      });
    },

    // Formato fecha respetando timezone del config
    date(d, opts) {
      const date = d instanceof Date ? d : new Date(d);
      if (isNaN(date.getTime())) return '—';
      const tz = window.VOLVIX_REGION?.timezone || 'America/Monterrey';
      const locale = window.VOLVIX_REGION?.locale || 'es-MX';
      return date.toLocaleDateString(locale, { timeZone: tz, ...(opts || {}) });
    },

    datetime(d, opts) {
      const date = d instanceof Date ? d : new Date(d);
      if (isNaN(date.getTime())) return '—';
      const tz = window.VOLVIX_REGION?.timezone || 'America/Monterrey';
      const locale = window.VOLVIX_REGION?.locale || 'es-MX';
      return date.toLocaleString(locale, { timeZone: tz, ...(opts || {}) });
    },

    time(d, opts) {
      const date = d instanceof Date ? d : new Date(d);
      if (isNaN(date.getTime())) return '—';
      const tz = window.VOLVIX_REGION?.timezone || 'America/Monterrey';
      const locale = window.VOLVIX_REGION?.locale || 'es-MX';
      return date.toLocaleTimeString(locale, { timeZone: tz, ...(opts || {}) });
    },

    // Tiempo relativo: "hace 5 min", "hace 2h"
    relativeTime(d) {
      const date = d instanceof Date ? d : new Date(d);
      const diffMs = Date.now() - date.getTime();
      const min = Math.floor(diffMs / 60000);
      if (min < 1) return 'ahora';
      if (min < 60) return 'hace ' + min + ' min';
      const h = Math.floor(min / 60);
      if (h < 24) return 'hace ' + h + 'h';
      const d2 = Math.floor(h / 24);
      if (d2 < 30) return 'hace ' + d2 + 'd';
      return this.date(date);
    },

    // Debounce simple
    debounce(fn, ms) {
      let t;
      return function (...args) {
        clearTimeout(t);
        t = setTimeout(() => fn.apply(this, args), ms);
      };
    },

    // UUID v4 simple (no crypto-grade pero alcanza para IDs locales)
    uuid() {
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
      });
    },
  };

  // =========================================================
  // PUBLICAR EN window.volvix
  // =========================================================
  window.volvix = window.volvix || {};
  window.volvix.config = {
    apiUrl: API_URL,
    offline: OFFLINE_MODE,
    version: window.VOLVIX_BRAND?.version || '7.0.0',
    flags: FLAGS,
  };
  window.volvix.api = api;
  window.volvix.utils = utils;
  window.volvix.session = {
    get: getSession,
    getTenantId: getTenantId,
    getAuthHeaders: getAuthHeaders,
    clear: () => {
      localStorage.removeItem('volvix:session');
    },
    set: (session) => {
      localStorage.setItem('volvix:session', JSON.stringify(session));
    },
  };
  window.volvix.offline = OfflineStore;

  // Helper "ready"
  window.volvix.ready = (cb) => {
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      Promise.resolve().then(cb);
    } else {
      document.addEventListener('DOMContentLoaded', cb);
    }
  };

  // =========================================================
  // LOG DE INICIO
  // =========================================================
  const tag = OFFLINE_MODE ? 'background:#F97316' : 'background:#FBBF24';
  console.log(
    '%c VOLVIX %c ' + (OFFLINE_MODE ? 'modo offline (localStorage)' : 'conectado a ' + API_URL),
    tag + ';color:#000;font-weight:700;padding:3px 8px;border-radius:4px',
    'color:#666'
  );
})();
