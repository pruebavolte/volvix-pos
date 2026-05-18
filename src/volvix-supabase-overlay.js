/* ============================================================
 * volvix-supabase-overlay.js  (R13 — TOP10 wiring)
 *
 * Conecta los 10 wirings críticos de Volvix POS a Supabase real
 * SIN modificar sus archivos. Carga este script DESPUÉS de los
 * wiring originales y ANTES de que el usuario interactúe.
 *
 *   <script src="auth-gate.js"></script>
 *   <script src="volvix-supabase-overlay.js"></script>
 *   <script src="volvix-pos-extra-wiring.js"></script>
 *   ...
 *
 * Estrategia:
 *  - Mapea claves localStorage -> recurso REST en Supabase
 *  - Intercepta localStorage.setItem(key, json): hace POST/PUT
 *    al endpoint y deja la copia en localStorage como cache.
 *  - Si el endpoint falla (offline o 5xx), cae a localStorage y
 *    encola el cambio en window.Volvix.queue para reenvío.
 *  - Expone window.Volvix.persist(resource, data) para uso directo.
 *  - NO altera APIs públicas window.posXxx, window.crmXxx, etc.
 * ============================================================ */
(function (global) {
  'use strict';
  if (global.__VOLVIX_OVERLAY__) return;
  global.__VOLVIX_OVERLAY__ = true;

  const Volvix = global.Volvix = global.Volvix || {};
  const QUEUE_KEY = 'volvix:_offline_queue';
  const SESSION_KEY = 'volvixSession';

  // ── Mapa de claves localStorage → endpoint REST ─────────────
  // Claves exactas (literal):
  const KEY_MAP = {
    // pos-extra
    'volvix:promociones'      : '/api/products?type=promo',
    'volvix:recargas'         : '/api/sales?type=recarga',
    'volvix:servicios'        : '/api/sales?type=servicio',
    'volvix:departamentos'    : '/api/products/departments',
    'volvix:cotizaciones'     : '/api/sales?type=quote',
    'volvix:apertura-caja'    : '/api/inventory/cash-open',
    'volvix:kardex'           : '/api/inventory',
    'volvix:proveedores'      : '/api/suppliers',
    'volvix:pos-config'       : '/api/owner/settings',
    // multipos
    'volvix:transfers'        : '/api/branch_inventory/transfers',
    'volvix:empleados'        : '/api/owner/users',
    'volvix:branch-config'    : '/api/branches',
    'volvix:branch-permissions': '/api/branches/permissions',
    'volvix:cashboxes'        : '/api/branches/cashboxes',
    'volvix:alerts-log'       : '/api/audit_log?type=alert',
    'volvix:notif-log'        : '/api/audit_log?type=notif',
    // audit
    'volvix.audit.log.v1'     : '/api/audit_log',
    'volvix.audit.config.v1'  : '/api/owner/settings?key=audit'
  };

  // Prefijos -> endpoint base (cualquier subclave usa el mismo)
  const PREFIX_MAP = [
    ['volvix.crm.',           '/api/crm'],          // /<resource> = subkey
    ['volvix_purchase_',      '/api/purchases'],    // vendors,pos,receipts,invoices,payments
    ['volvix:tax:',           '/api/tax'],
    ['volvix:forecast:',      '/api/forecasts'],
    ['volvix:fulltext:',      '/api/search']
  ];

  // ── Sesión / fetch autenticado ──────────────────────────────
  function getToken() {
    try {
      const s = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
      return s && s.token ? s.token : null;
    } catch (_) { return null; }
  }

  Volvix.auth = Volvix.auth || {};
  Volvix.auth.fetch = Volvix.auth.fetch || function (url, opts) {
    opts = opts || {};
    opts.headers = Object.assign(
      { 'Content-Type': 'application/json' },
      opts.headers || {}
    );
    const t = getToken();
    if (t) opts.headers['Authorization'] = 'Bearer ' + t;
    return fetch(url, opts);
  };

  // ── Cola offline ────────────────────────────────────────────
  function loadQueue() {
    try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); }
    catch (_) { return []; }
  }
  function saveQueue(q) {
    try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q.slice(-500))); } catch (_) {}
  }
  Volvix.queue = {
    add(item) {
      const q = loadQueue();
      q.push(Object.assign({ ts: Date.now() }, item));
      saveQueue(q);
    },
    list: loadQueue,
    clear() { saveQueue([]); },
    async flush() {
      const q = loadQueue();
      const remaining = [];
      for (const it of q) {
        try {
          const r = await Volvix.auth.fetch(it.endpoint, {
            method: it.method || 'POST',
            body: JSON.stringify(it.data)
          });
          if (!r.ok) remaining.push(it);
        } catch (_) { remaining.push(it); }
      }
      saveQueue(remaining);
      return { sent: q.length - remaining.length, pending: remaining.length };
    }
  };

  // Auto-flush cuando vuelve la conexión
  global.addEventListener && global.addEventListener('online', () => {
    Volvix.queue.flush().catch(() => {});
  });

  // ── Resolver clave → endpoint ───────────────────────────────
  function resolveEndpoint(key) {
    if (KEY_MAP[key]) return KEY_MAP[key];
    for (const [prefix, base] of PREFIX_MAP) {
      if (key.indexOf(prefix) === 0) {
        const sub = key.slice(prefix.length);
        return sub ? base + '/' + encodeURIComponent(sub) : base;
      }
    }
    return null;
  }

  // ── Persist universal ───────────────────────────────────────
  Volvix.persist = async function persist(resourceOrKey, data, opts) {
    opts = opts || {};
    const endpoint = resourceOrKey.charAt(0) === '/'
      ? resourceOrKey
      : (resolveEndpoint(resourceOrKey) || '/api/' + resourceOrKey);
    try {
      const r = await Volvix.auth.fetch(endpoint, {
        method: opts.method || 'POST',
        body: JSON.stringify(data)
      });
      if (!r.ok) throw new Error('api ' + r.status);
      // cache local con clave original (si era una clave)
      if (resourceOrKey.charAt(0) !== '/') {
        try { _origSetItem.call(localStorage, resourceOrKey, JSON.stringify(data)); } catch (_) {}
      }
      try { return await r.json(); } catch (_) { return { ok: true }; }
    } catch (e) {
      if (resourceOrKey.charAt(0) !== '/') {
        try { _origSetItem.call(localStorage, resourceOrKey, JSON.stringify(data)); } catch (_) {}
      }
      Volvix.queue.add({ endpoint, method: opts.method || 'POST', data });
      return { offline: true, data, error: e.message };
    }
  };

  Volvix.fetchRemote = async function (resourceOrKey) {
    const endpoint = resourceOrKey.charAt(0) === '/'
      ? resourceOrKey
      : (resolveEndpoint(resourceOrKey) || '/api/' + resourceOrKey);
    try {
      const r = await Volvix.auth.fetch(endpoint);
      if (!r.ok) throw new Error('api ' + r.status);
      const data = await r.json();
      if (resourceOrKey.charAt(0) !== '/') {
        try { _origSetItem.call(localStorage, resourceOrKey, JSON.stringify(data)); } catch (_) {}
      }
      return data;
    } catch (_) {
      if (resourceOrKey.charAt(0) !== '/') {
        try { return JSON.parse(_origGetItem.call(localStorage, resourceOrKey) || 'null'); } catch (_) {}
      }
      return null;
    }
  };

  // ── Monkey-patch localStorage para claves Volvix ────────────
  const _origSetItem = localStorage.setItem.bind(localStorage);
  const _origGetItem = localStorage.getItem.bind(localStorage);
  const _origRemove  = localStorage.removeItem.bind(localStorage);

  // No tocamos sesión, queue ni nada que no esté mapeado.
  function isVolvixManaged(key) {
    if (!key) return false;
    if (key === SESSION_KEY || key === QUEUE_KEY) return false;
    if (KEY_MAP[key]) return true;
    return PREFIX_MAP.some(([p]) => key.indexOf(p) === 0);
  }

  localStorage.setItem = function (key, value) {
    _origSetItem(key, value);
    if (!isVolvixManaged(key)) return;
    let parsed = null;
    try { parsed = JSON.parse(value); } catch (_) { parsed = value; }
    const endpoint = resolveEndpoint(key);
    if (!endpoint) return;
    // Fire-and-forget; persist se encarga de cache + queue
    Volvix.auth.fetch(endpoint, {
      method: 'POST',
      body: JSON.stringify(parsed)
    }).then(r => {
      if (!r.ok) Volvix.queue.add({ endpoint, method: 'POST', data: parsed });
    }).catch(() => {
      Volvix.queue.add({ endpoint, method: 'POST', data: parsed });
    });
  };

  // getItem queda igual (lee cache local). Para forzar lectura
  // remota usar Volvix.fetchRemote(key).
  // removeItem también: borrado distribuido es opt-in:
  Volvix.removeRemote = function (key) {
    _origRemove(key);
    const ep = resolveEndpoint(key);
    if (ep) Volvix.auth.fetch(ep, { method: 'DELETE' }).catch(() => {});
  };

  // ── Boot: intentar flush cualquier cola pendiente ───────────
  setTimeout(() => { Volvix.queue.flush().catch(() => {}); }, 1500);

  console.log('[VOLVIX-OVERLAY] Activo — localStorage de claves Volvix re-enrutadas a Supabase');
})(typeof window !== 'undefined' ? window : globalThis);
